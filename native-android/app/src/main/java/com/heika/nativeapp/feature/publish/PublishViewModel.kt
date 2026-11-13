package com.heika.nativeapp.feature.publish

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaCategory
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import com.heika.nativeapp.data.stringList
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class PendingImage(
    val key: String,
    val preview: Any,
    val name: String,
    val path: String? = null,
    val progress: Boolean = false,
    val error: String? = null,
    val uploadId: String? = null,
    val mime: String? = null,
    val localFilePath: String? = null,
    val uploadedBySession: Boolean = false,
)

data class PublishState(
    val title: String = "", val body: String = "", val topicText: String = "", val categories: List<HeikaCategory> = emptyList(),
    val channel: String = "community", val contentType: String = "knowledge_article", val resourceData: Map<String, String> = emptyMap(),
    val category: String = "", val images: List<PendingImage> = emptyList(), val mediaPaths: List<String> = emptyList(),
    val pendingDeletePaths: List<String> = emptyList(),
    val draftId: Int? = null, val draftCloudId: String? = null, val accountId: String? = null, val revisionMode: Boolean = false,
    val serverStatus: String = "draft",
    val loading: Boolean = true, val saving: Boolean = false, val publishing: Boolean = false,
    val error: String? = null, val notice: String? = null, val showLeaveDialog: Boolean = false,
    val publishedPost: JSONObject? = null,
)

private val AI_ARRAY_FIELDS = setOf("platforms", "environments", "use_cases", "variables")

private fun stringFields(json: JSONObject): Map<String, String> = buildMap {
    val keys = json.keys()
    while (keys.hasNext()) {
        val key = keys.next()
        val value = json.opt(key)
        val text = if (value is JSONArray) buildList { for (i in 0 until value.length()) add(value.optString(i)) }.joinToString("\n") else value?.takeUnless { it == JSONObject.NULL }?.toString().orEmpty()
        if (text.isNotBlank()) put(key, text)
    }
}

@HiltViewModel
class PublishViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val mutableState = MutableStateFlow(PublishState())
    val state = mutableState.asStateFlow()
    private var saveJob: Job? = null
    private var snapshotJob: Job? = null
    private var draftLoaded = false
    private val saveMutex = Mutex()
    private val publishMutex = Mutex()
    private val uploadJobs = ConcurrentHashMap<String, Job>()
    private var needsServerSync = false

    init {
        viewModelScope.launch {
            auth.session.collect { session ->
                val owner = mutableState.value.accountId
                if (owner != null && owner != session?.userId) {
                    uploadJobs.values.forEach { it.cancel() }
                    uploadJobs.clear()
                    mutableState.value = PublishState(
                        accountId = session?.userId,
                        loading = false,
                        error = "账号已切换，请返回后重新打开发布页",
                    )
                }
            }
        }
        viewModelScope.launch {
            val session = runCatching { auth.current() }.getOrNull()
            if (session == null) {
                mutableState.update { it.copy(loading = false, error = "登录后可以发布内容") }
                return@launch
            }
            mutableState.update { it.copy(accountId = session.userId) }
            mutableState.update { it.copy(loading = false) }
        }
    }

    suspend fun configureChannel(channel: String) {
        val target = if (channel == "ai") "ai" else "community"
        if (mutableState.value.channel == target && mutableState.value.categories.isNotEmpty()) return
        mutableState.update { it.copy(channel = target, loading = true, category = "", error = null) }
        val categories = runCatching { repository.loadCategories(target, "category") }.getOrDefault(emptyList())
        mutableState.update { current -> current.copy(
            channel = target,
            categories = categories,
            category = current.category.takeIf { value -> categories.any { it.name == value } } ?: categories.firstOrNull()?.name.orEmpty(),
            loading = false,
            error = if (categories.isEmpty()) "$target 分类暂不可用，请重试" else current.error,
        ) }
    }

    fun switchChannel(channel: String) = viewModelScope.launch {
        val target = if (channel == "ai") "ai" else "community"
        val current = mutableState.value
        if (current.channel == target || current.publishing || current.images.any(PendingImage::progress)) return@launch
        persistLocalSnapshot()
        saveDraftInternal()
        val accountId = current.accountId
        mutableState.value = PublishState(channel = target, accountId = accountId, loading = true)
        draftLoaded = false
        configureChannel(target)
        resumeDraft()
    }

    fun resumeDraft(requestedId: Int? = null) = viewModelScope.launch {
        if (draftLoaded) return@launch
        draftLoaded = true
        val session = runCatching { auth.current() }.getOrNull() ?: run {
            mutableState.update { it.copy(loading = false, error = "登录后可以发布内容") }
            return@launch
        }
        mutableState.update { it.copy(accountId = session.userId) }

        val local = runCatching { repository.localPublishSnapshot(session.userId, mutableState.value.channel) }.getOrNull()
        val localMatchesRequested = requestedId != null && local?.optInt("draftId", -1) == requestedId
        if (local != null && (requestedId == null || localMatchesRequested)) {
            restoreLocalSnapshot(local)
        }

        // New drafts are local-only. Read server data only when opening an
        // explicitly selected legacy draft or an existing published work for edit.
        if (requestedId != null && !localMatchesRequested) {
            runCatching { repository.myLibraryState() }.onSuccess { profile ->
                val remote = profile.optJSONArray("own").jsonObjects().firstOrNull {
                    it.optInt("id") == requestedId &&
                        it.optString("channel").ifBlank { "community" } == mutableState.value.channel &&
                        it.optString("status") in setOf("draft", "pending_review", "published")
                }
                if (remote == null) {
                    mutableState.update { it.copy(error = "内容暂不可用") }
                } else {
                    restoreRemote(remote)
                    persistLocalSnapshot()
                }
            }.onFailure { error ->
                if (local == null) mutableState.update { it.copy(error = error.message ?: "暂时无法读取内容") }
                else mutableState.update { it.copy(notice = "已恢复本机内容") }
            }
        }
    }

    private fun restoreRemote(post: JSONObject) {
        val pending = post.optJSONObject("pendingRevision")
        val pendingPayload = pending?.optJSONObject("payload")?.takeIf { pending.optString("status") == "pending" }
        val source = pendingPayload ?: post
        val paths = source.stringList("mediaPaths")
        val previews = source.stringList("thumbnailImages").ifEmpty { source.stringList("images") }
        val revisionMode = post.optString("status") == "published"
        mutableState.update { current ->
            current.copy(
                draftId = post.optInt("id").takeIf { it > 0 },
                draftCloudId = post.optString("cloudId").takeIf(String::isNotBlank),
                revisionMode = revisionMode,
                serverStatus = post.optString("status").ifBlank { "draft" },
                title = source.optString("title"), body = source.optString("body"),
                contentType = source.optString("contentType").ifBlank { current.contentType },
                resourceData = source.optJSONObject("resourceData")?.let(::stringFields).orEmpty().ifEmpty { current.resourceData },
                category = source.optString("tag").ifBlank { current.category },
                topicText = source.optJSONArray("topics")?.let { arr -> buildList { for (i in 0 until arr.length()) add(arr.optString(i)) }.joinToString(" ") } ?: "",
                mediaPaths = paths,
                images = paths.mapIndexed { index, path -> PendingImage(
                    "remote:$path", previews.getOrNull(index) ?: path, path.substringAfterLast('/'), path = path,
                    uploadedBySession = revisionMode && path !in post.stringList("mediaPaths"),
                ) },
                notice = if (revisionMode) "正在编辑已发布作品；提交后将按网站规则送审" else "旧草稿已导入此设备",
                error = null,
            )
        }
        needsServerSync = false
    }

    private suspend fun restoreLocalSnapshot(snapshot: JSONObject) {
        val filesRoot = withContext(Dispatchers.IO) { accountDraftDirectory(mutableState.value.accountId.orEmpty()).canonicalPath }
        val images = withContext(Dispatchers.IO) {
            snapshot.optJSONArray("images").jsonObjects().mapNotNull { item ->
                val filePath = item.optString("localFilePath").takeIf(String::isNotBlank)
                val localFilePath = filePath?.let { path ->
                    runCatching { File(path).canonicalFile.takeIf { it.path.startsWith("$filesRoot/") }?.path }.getOrNull()
                }
                val localFile = localFilePath?.let(::File)?.takeIf(File::isFile)
                val path = item.optString("path").takeIf(String::isNotBlank)
                val preview = localFile?.let { Uri.fromFile(it) }
                    ?: path
                    ?: item.optString("preview").takeIf(String::isNotBlank)
                    ?: item.optString("name").ifBlank { "图片" }
                if (localFilePath == null && path == null && item.optString("preview").isBlank()) null else PendingImage(
                    key = item.optString("key").ifBlank { UUID.randomUUID().toString() }, preview = preview,
                    name = item.optString("name").ifBlank { path?.substringAfterLast('/') ?: "图片" }, path = path,
                    uploadId = item.optString("uploadId").takeIf(String::isNotBlank), mime = item.optString("mime").takeIf(String::isNotBlank),
                    localFilePath = localFile?.absolutePath,
                    uploadedBySession = item.optBoolean("uploadedBySession"),
                    error = when {
                        path != null -> null
                        localFile == null && localFilePath != null -> "本机图片副本已丢失，请移除后重新选择"
                        localFile != null -> null
                        else -> item.optString("error").takeIf(String::isNotBlank)
                    },
                )
            }
        }
        mutableState.update { current -> current.copy(
            draftId = snapshot.optInt("draftId", -1).takeIf { it > 0 },
            draftCloudId = snapshot.optString("draftCloudId").takeIf(String::isNotBlank),
            revisionMode = snapshot.optBoolean("revisionMode"),
            serverStatus = snapshot.optString("serverStatus").ifBlank { "draft" },
            title = snapshot.optString("title"), body = snapshot.optString("body"), topicText = snapshot.optString("topicText"),
            contentType = snapshot.optString("contentType").ifBlank { current.contentType },
            resourceData = snapshot.optJSONObject("resourceData")?.let(::stringFields).orEmpty(),
            category = snapshot.optString("category").ifBlank { current.category },
            images = images, mediaPaths = images.mapNotNull(PendingImage::path),
            pendingDeletePaths = snapshot.optJSONArray("pendingDeletePaths")?.let { array -> buildList { for (i in 0 until array.length()) add(array.optString(i)) } }.orEmpty(),
            notice = "已恢复本机草稿", error = null,
        ) }
        needsServerSync = snapshot.optBoolean("needsServerSync", true)
    }

    fun edit(title: String = mutableState.value.title, body: String = mutableState.value.body, topicText: String = mutableState.value.topicText, category: String = mutableState.value.category) {
        needsServerSync = true
        mutableState.update { it.copy(title = title.take(80), body = body.take(5000), topicText = topicText.take(200), category = category, error = null) }
        scheduleSave()
        scheduleSnapshot()
    }

    fun setAiContentType(contentType: String) {
        if (contentType !in AiResourceRules.contentTypes) return
        mutableState.update { it.copy(contentType = contentType, error = null) }
        needsServerSync = true
        scheduleSave(); scheduleSnapshot()
    }

    fun editAiField(key: String, value: String) {
        if (!key.matches(Regex("^[a-z][a-z0-9_]{0,39}$"))) return
        mutableState.update { it.copy(resourceData = it.resourceData + (key to value.take(12000)), error = null) }
        needsServerSync = true
        scheduleSave(); scheduleSnapshot()
    }

    fun reportError(message: String) = mutableState.update { it.copy(error = message) }

    private fun scheduleSave() {
        val current = mutableState.value
        if (current.title.isBlank() && current.body.isBlank() && current.images.isEmpty()) return
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(900)
            saveDraftInternal()
        }
    }

    private fun scheduleSnapshot() {
        snapshotJob?.cancel()
        snapshotJob = viewModelScope.launch {
            delay(120)
            persistLocalSnapshot()
        }
    }

    private suspend fun persistLocalSnapshot(): Boolean {
        val current = mutableState.value
        val accountId = current.accountId ?: return false
        val images = JSONArray().apply {
            current.images.forEach { image -> put(JSONObject()
                .put("key", image.key).put("name", image.name).put("path", image.path)
                .put("preview", if (image.preview is Uri && image.preview.scheme != "file") "" else image.preview.toString())
                .put("uploadId", image.uploadId).put("mime", image.mime)
                .put("localFilePath", image.localFilePath).put("uploadedBySession", image.uploadedBySession)
                .put("error", image.error))
            }
        }
        val snapshot = JSONObject()
            .put("draftId", current.draftId).put("draftCloudId", current.draftCloudId)
            .put("revisionMode", current.revisionMode).put("serverStatus", current.serverStatus).put("title", current.title).put("body", current.body)
            .put("topicText", current.topicText).put("category", current.category).put("channel", current.channel)
            .put("contentType", current.contentType).put("resourceData", JSONObject(current.resourceData)).put("images", images)
            .put("pendingDeletePaths", JSONArray(current.pendingDeletePaths))
            .put("needsServerSync", needsServerSync).put("savedAt", System.currentTimeMillis())
        return runCatching { repository.saveLocalPublishSnapshot(accountId, snapshot, current.channel) }
            .fold(
                onSuccess = { true },
                onFailure = { error ->
                    mutableState.update { it.copy(error = "本机草稿保存失败：${error.message ?: "存储不可用"}") }
                    false
                },
            )
    }

    private fun accountDraftDirectory(accountId: String): File {
        require(accountId.matches(Regex("[0-9a-fA-F-]{36}"))) { "账号状态无效" }
        return File(context.filesDir, "heika-drafts/$accountId").apply { mkdirs() }
    }

    suspend fun addImage(name: String, mime: String, bytes: ByteArray) {
        if (mutableState.value.images.size >= 9) {
            mutableState.update { it.copy(error = "一篇内容最多添加 9 张图片") }
            return
        }
        if (bytes.size !in 1..(4 * 1024 * 1024) || mime !in setOf("image/jpeg", "image/png", "image/webp")) {
            mutableState.update { it.copy(error = "图片须为 4 MB 以内的 JPG、PNG 或 WebP") }
            return
        }
        val accountId = mutableState.value.accountId ?: runCatching { auth.current()?.userId }.getOrNull()
        if (accountId == null) {
            mutableState.update { it.copy(error = "登录状态已失效，请重新登录") }
            return
        }
        val key = UUID.randomUUID().toString()
        val uploadId = UUID.randomUUID().toString()
        val extension = when (mime) { "image/jpeg" -> "jpg"; "image/png" -> "png"; else -> "webp" }
        val localFile = withContext(Dispatchers.IO) { File(accountDraftDirectory(accountId), "$uploadId.$extension") }
        val temporaryFile = File(localFile.parentFile, "$uploadId.part")
        try {
            withContext(Dispatchers.IO) {
                FileOutputStream(temporaryFile).use { output ->
                    output.write(bytes)
                    output.fd.sync()
                }
                if (!temporaryFile.renameTo(localFile)) throw IOException("图片本地保存失败")
            }
        } catch (error: Exception) {
            withContext(Dispatchers.IO) { temporaryFile.delete(); localFile.delete() }
            if (error is CancellationException) throw error
            mutableState.update { it.copy(error = error.message ?: "图片准备失败") }
            return
        }
        val image = PendingImage(key, Uri.fromFile(localFile), name, progress = false, uploadId = uploadId, mime = mime, localFilePath = localFile.absolutePath)
        mutableState.update { it.copy(accountId = accountId, images = it.images + image, error = null) }
        needsServerSync = true
        if (!persistLocalSnapshot()) {
            mutableState.update { state -> state.copy(images = state.images.map { if (it.key == key) it.copy(progress = false, error = "本机草稿快照未能保存") else it }) }
            return
        }
        mutableState.update { state -> state.copy(images = state.images.map { if (it.key == key) it.copy(progress = false) else it }) }
    }

    fun retryUpload(key: String) {
        val image = mutableState.value.images.firstOrNull { it.key == key } ?: return
        if (image.progress || image.path != null || image.localFilePath == null || image.uploadId == null || image.mime == null) return
        uploadJobs[key]?.cancel()
        uploadJobs[key] = viewModelScope.launch { uploadPendingImage(key) }
    }

    private suspend fun uploadPendingImage(key: String) {
        val image = mutableState.value.images.firstOrNull { it.key == key } ?: return
        mutableState.update { state -> state.copy(images = state.images.map { if (it.key == key) it.copy(progress = true, error = null) else it }) }
        try {
            ensureSameAccount(mutableState.value.accountId)
            val localPath = image.localFilePath?.let(::File) ?: throw IllegalStateException("图片本地副本不存在，无法重试")
            if (!localPath.isFile) throw IllegalStateException("图片本地副本已丢失，请重新选择")
            val current = mutableState.value
            val bytes = withContext(Dispatchers.IO) { localPath.readBytes() }
            val order = mutableState.value.images.indexOfFirst { it.key == key }.coerceAtLeast(0)
            val result = repository.uploadImage(
                postId = current.draftCloudId.takeIf { current.revisionMode },
                uploadId = image.uploadId!!,
                fileName = image.name,
                mimeType = image.mime!!,
                bytes = bytes,
                sortOrder = order,
                revisionMode = current.revisionMode,
            )
            val path = result.optString("path").takeIf(String::isNotBlank) ?: throw IllegalStateException("服务端未返回图片路径")
            if (mutableState.value.images.none { it.key == key }) {
                runCatching { repository.deleteUploadedImage(null, path) }
                withContext(Dispatchers.IO) { localPath.delete() }
                return
            }
            mutableState.update { state ->
                val images = state.images.map { if (it.key == key) it.copy(path = path, progress = false, error = null, preview = Uri.fromFile(localPath), uploadedBySession = true) else it }
                state.copy(images = images, mediaPaths = images.mapNotNull(PendingImage::path), error = null)
            }
            needsServerSync = true
            persistLocalSnapshot()
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            mutableState.update { state -> state.copy(images = state.images.map { if (it.key == key) it.copy(progress = false, error = error.message ?: "上传失败") else it }, error = error.message ?: "图片上传失败") }
            persistLocalSnapshot()
        }
    }

    fun removeImage(key: String) = viewModelScope.launch {
        val current = mutableState.value
        val removed = current.images.firstOrNull { it.key == key }
        val uploadJob = uploadJobs[key]
        uploadJob?.cancel()
        mutableState.update { state ->
            val images = state.images.filterNot { it.key == key }
            state.copy(images = images, mediaPaths = images.mapNotNull(PendingImage::path))
        }
        needsServerSync = true
        // Let an in-flight upload finish before deleting its deterministic path.
        // If the response arrives after removal, uploadPendingImage also cleans
        // the returned path; this retry covers a lost HTTP reply.
        uploadJob?.join()
        if (uploadJobs[key] === uploadJob) uploadJobs.remove(key)
        removed?.localFilePath?.let { path -> withContext(Dispatchers.IO) { File(path).delete() } }
        val latest = mutableState.value
        val ext = when (removed?.mime) { "image/jpeg" -> "jpg"; "image/png" -> "png"; "image/webp" -> "webp"; else -> null }
        val orphanRetryPath = if (removed?.uploadId != null && ext != null && latest.accountId != null) "${latest.accountId}/${removed.uploadId}.$ext" else null
        val remotePath = removed?.path ?: orphanRetryPath
        // Locally selected images have a unique uploadId before their first
        // submit. Cleanup by that id also covers an upload interrupted mid-request.
        val isStagedUpload = removed?.uploadId != null && remotePath != null
        val canDeleteRemote = !isStagedUpload && remotePath != null && latest.draftCloudId != null &&
            (!latest.revisionMode || removed?.uploadId != null || removed?.uploadedBySession == true)
        if (isStagedUpload) runCatching { repository.deleteUploadedImage(null, remotePath!!) }
        if (canDeleteRemote) {
            mutableState.update { state -> state.copy(pendingDeletePaths = (state.pendingDeletePaths + remotePath!!).distinct()) }
            retryPendingDeletes()
        }
        persistLocalSnapshot()
        if (!current.revisionMode) saveDraftInternal()
    }

    fun moveImage(key: String, delta: Int) {
        mutableState.update { state ->
            val currentIndex = state.images.indexOfFirst { it.key == key }
            val targetIndex = currentIndex + delta
            if (currentIndex < 0 || targetIndex !in state.images.indices) state else {
                val images = state.images.toMutableList().apply { add(targetIndex, removeAt(currentIndex)) }
                state.copy(images = images, mediaPaths = images.mapNotNull(PendingImage::path))
            }
        }
        needsServerSync = true
        scheduleSave()
        scheduleSnapshot()
    }

    fun setCover(key: String) {
        val current = mutableState.value
        val index = current.images.indexOfFirst { it.key == key }
        if (index <= 0) return
        mutableState.update { state ->
            val images = state.images.toMutableList().apply { add(0, removeAt(index)) }
            state.copy(images = images, mediaPaths = images.mapNotNull(PendingImage::path))
        }
        needsServerSync = true
        scheduleSave()
        scheduleSnapshot()
    }

    fun saveDraft(onDone: (() -> Unit)? = null) = viewModelScope.launch {
        saveJob?.cancel()
        val saved = saveDraftInternal(announce = true)
        if (saved) onDone?.invoke() else mutableState.update {
            it.copy(showLeaveDialog = false, notice = "本机保存失败，请重试")
        }
    }

    fun deleteLocalDraft() = viewModelScope.launch {
        saveJob?.cancel()
        snapshotJob?.cancel()
        uploadJobs.values.forEach(Job::cancel)
        uploadJobs.clear()
        val current = mutableState.value
        // Only delete app-created, unattached staging objects. Never touch gallery
        // originals, existing published media, or legacy server-owned assets.
        current.images.filter { it.uploadId != null && it.mime != null }.forEach { image ->
            val extension = when (image.mime) { "image/jpeg" -> "jpg"; "image/png" -> "png"; "image/webp" -> "webp"; else -> null }
            val stagedPath = extension?.let { ext -> current.accountId?.let { "$it/${image.uploadId}.$ext" } }
            if (stagedPath != null) runCatching { repository.deleteUploadedImage(null, stagedPath) }
        }
        clearLocalFiles(current.images)
        current.accountId?.let { repository.clearLocalPublishSnapshot(it, current.channel) }
        needsServerSync = false
        mutableState.update {
            PublishState(
                categories = it.categories,
                channel = it.channel,
                accountId = it.accountId,
                category = it.categories.firstOrNull()?.name.orEmpty(),
                loading = false,
                notice = "草稿已删除",
            )
        }
    }

    fun continueEditing() = mutableState.update { it.copy(showLeaveDialog = false) }

    fun leaveWithLocalCopy(onLeave: () -> Unit) = viewModelScope.launch {
        if (!persistLocalSnapshot()) return@launch
        mutableState.update { it.copy(showLeaveDialog = false) }
        onLeave()
    }

    private suspend fun submitContent(current: PublishState): JSONObject {
        val topics = parseTopics(current.topicText)
        return if (current.channel == "ai") {
            val resource = JSONObject()
            current.resourceData.forEach { (key, value) ->
                if (value.isBlank()) return@forEach
                if (key in AI_ARRAY_FIELDS) resource.put(key, JSONArray(value.lines().map(String::trim).filter(String::isNotBlank)))
                else resource.put(key, value.trim())
            }
            repository.mutateAiResource(
                action = "submit",
                id = current.draftCloudId,
                title = current.title,
                body = current.body,
                category = current.category,
                contentType = current.contentType,
                resourceData = resource,
                topics = topics,
                mediaPaths = current.mediaPaths,
            )
        } else {
            repository.publishDraft(current.draftId, current.title, current.body, current.category, topics, current.mediaPaths)
        }
    }

    private fun validateAiResource(current: PublishState) {
        if (current.channel != "ai") return
        val missing = AiResourceRules.missingRequiredFields(current.contentType, current.resourceData)
        if (current.contentType !in AiResourceRules.contentTypes || missing.isNotEmpty()) {
            throw IllegalArgumentException(if (missing.isNotEmpty()) "请补全必填资源字段：${missing.joinToString("、") { AiResourceRules.labels[it] ?: it }}" else "AI 资源类型无效")
        }
        val link = current.resourceData["source_url"].orEmpty().trim()
        if (link.isNotEmpty() && !AiResourceRules.isSafeSourceUrl(link)) throw IllegalArgumentException("资源链接仅支持公开 HTTPS 地址")
    }

    private suspend fun saveDraftInternal(announce: Boolean = false): Boolean = saveMutex.withLock {
        mutableState.update { it.copy(saving = true, error = null) }
        val saved = persistLocalSnapshot()
        mutableState.update { it.copy(
            saving = false,
            error = if (saved) null else "本机草稿保存失败，请重试",
            notice = if (announce) if (saved) "草稿已保存在此设备" else "本机草稿保存失败，请重试" else it.notice,
        ) }
        saved
    }

    private suspend fun retryPendingDeletes() {
        val current = mutableState.value
        val postId = current.draftCloudId ?: return
        if (current.pendingDeletePaths.isEmpty()) return
        ensureSameAccount(current.accountId)
        var remaining = current.pendingDeletePaths
        var lastError: String? = null
        for (path in current.pendingDeletePaths) {
            try {
                repository.deleteUploadedImage(postId, path)
                remaining = remaining - path
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                lastError = error.message
            }
        }
        mutableState.update { it.copy(pendingDeletePaths = remaining, notice = if (remaining.isNotEmpty()) "图片已从编辑列表移除，服务器文件清理待重试：${lastError.orEmpty()}" else it.notice) }
        persistLocalSnapshot()
    }

    fun retryRemovedImageCleanup() = viewModelScope.launch { retryPendingDeletes() }

    fun publish() = viewModelScope.launch {
        if (!publishMutex.tryLock()) return@launch
        try {
            val current = mutableState.value
            saveJob?.cancel()
            if (current.publishing || current.saving || current.images.any(PendingImage::progress)) return@launch
            if (current.pendingDeletePaths.isNotEmpty()) {
                retryPendingDeletes()
                if (mutableState.value.pendingDeletePaths.isNotEmpty()) {
                    mutableState.update { it.copy(error = "已移除图片的服务器清理尚未确认，请联网重试后再提交") }
                    return@launch
                }
            }
            if (current.title.isBlank() || current.body.isBlank() || current.category.isBlank()) {
                mutableState.update { it.copy(error = "请填写标题、正文并选择分类") }
                return@launch
            }
            if (current.images.any { it.error != null && it.localFilePath == null }) {
                mutableState.update { it.copy(error = "请移除无法读取的图片后重试") }
                return@launch
            }
            mutableState.update { it.copy(publishing = true, error = null, notice = null) }
            runCatching {
                ensureSameAccount(current.accountId)
                current.images.filter { it.path == null }.forEach { uploadPendingImage(it.key) }
                val latest = mutableState.value
                if (latest.images.any { it.path == null }) throw IOException("图片上传未完成，请检查网络后重试")
                if (latest.channel == "ai") validateAiResource(latest)
                submitContent(latest)
            }
                .onSuccess { result ->
                    clearLocalFiles(mutableState.value.images)
                    current.accountId?.let { repository.clearLocalPublishSnapshot(it, current.channel) }
                    needsServerSync = false
                    mutableState.update { it.copy(publishing = false, serverStatus = result.optString("status").ifBlank { if (current.revisionMode) "published" else "pending_review" }, notice = if (current.revisionMode) "修改已提交审核，原作品保持发布" else "内容已提交审核", publishedPost = result) }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(publishing = false, error = error.message ?: "提交失败，请重试") }
                    persistLocalSnapshot()
                }
        } finally {
            publishMutex.unlock()
        }
    }

    private suspend fun clearLocalFiles(images: List<PendingImage>) = withContext(Dispatchers.IO) {
        images.mapNotNull(PendingImage::localFilePath).forEach { path ->
            val file = File(path)
            runCatching { if (file.canonicalPath.startsWith(context.filesDir.canonicalPath + "/heika-drafts/")) file.delete() }
        }
    }

    private suspend fun ensureSameAccount(ownerId: String?) {
        val activeUserId = auth.current()?.userId
        if (ownerId == null || activeUserId != ownerId) throw IOException("账号已切换，请返回后重新打开发布页")
    }

    private fun parseTopics(raw: String): List<String> = raw.split(Regex("[\\s,，#]+" )).map(String::trim).filter(String::isNotBlank).distinct().take(5)
}
