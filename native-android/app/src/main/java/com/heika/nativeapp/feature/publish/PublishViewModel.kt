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
    val category: String = "", val images: List<PendingImage> = emptyList(), val mediaPaths: List<String> = emptyList(),
    val pendingDeletePaths: List<String> = emptyList(),
    val draftId: Int? = null, val draftCloudId: String? = null, val accountId: String? = null, val revisionMode: Boolean = false,
    val serverStatus: String = "draft",
    val loading: Boolean = true, val saving: Boolean = false, val publishing: Boolean = false,
    val error: String? = null, val notice: String? = null, val showLeaveDialog: Boolean = false,
    val publishedPost: JSONObject? = null,
)

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
    private val draftMutex = Mutex()
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
            val categories = runCatching { repository.loadCategories("community", "category") }.getOrDefault(emptyList())
            mutableState.update { it.copy(categories = categories, category = it.category.ifBlank { categories.firstOrNull()?.name.orEmpty() }, loading = false, error = if (categories.isEmpty()) "发布分类暂不可用，请重试" else it.error) }
        }
    }

    fun resumeDraft(requestedId: Int? = null) = viewModelScope.launch {
        if (draftLoaded) return@launch
        draftLoaded = true
        val session = runCatching { auth.current() }.getOrNull() ?: run {
            mutableState.update { it.copy(loading = false, error = "登录后可以发布内容") }
            return@launch
        }
        mutableState.update { it.copy(accountId = session.userId) }

        val local = runCatching { repository.localPublishSnapshot(session.userId) }.getOrNull()
        if (local != null && (requestedId == null || local.optInt("draftId", -1) == requestedId)) {
            restoreLocalSnapshot(local)
        }

        runCatching { repository.myLibraryState() }.onSuccess { profile ->
            val own = profile.optJSONArray("own").jsonObjects()
            val remote = if (requestedId != null) {
                own.firstOrNull { it.optInt("id") == requestedId && it.optString("status") in setOf("draft", "pending_review", "published") }
            } else {
                val localDraftId = local?.optInt("draftId", -1)?.takeIf { it > 0 }
                localDraftId?.let { id -> own.firstOrNull { it.optInt("id") == id && it.optString("status") in setOf("draft", "pending_review", "published") } }
                    ?: own.filter { it.optString("status") in setOf("draft", "pending_review") }
                        .maxByOrNull { it.optString("updatedAt") }
            }
            if (remote == null) {
                val localDraftId = local?.optInt("draftId", -1)?.takeIf { it > 0 }
                if (local != null && needsServerSync && localDraftId == null && requestedId == null) scheduleSave()
                else if (local != null && localDraftId != null) mutableState.update { it.copy(error = "云端草稿暂不可用；本机副本仍保留") }
                return@onSuccess
            }
            val localMatches = local != null && (local.optInt("draftId", -1) == remote.optInt("id"))
            val localIsNewUnsynced = local != null && local.optInt("draftId", -1) <= 0 && needsServerSync
            if ((localMatches && needsServerSync) || localIsNewUnsynced) {
                mutableState.update { it.copy(notice = "已恢复本机未同步修改") }
                scheduleSave()
            } else {
                restoreRemote(remote)
                persistLocalSnapshot()
            }
        }.onFailure { error ->
            if (local == null) mutableState.update { it.copy(error = error.message ?: "暂时无法读取草稿") }
            else mutableState.update { it.copy(notice = "已恢复本机内容，联网后可继续同步") }
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
                category = source.optString("tag").ifBlank { current.category },
                topicText = source.optJSONArray("topics")?.let { arr -> buildList { for (i in 0 until arr.length()) add(arr.optString(i)) }.joinToString(" ") } ?: "",
                mediaPaths = paths,
                images = paths.mapIndexed { index, path -> PendingImage(
                    "remote:$path", previews.getOrNull(index) ?: path, path.substringAfterLast('/'), path = path,
                    uploadedBySession = revisionMode && path !in post.stringList("mediaPaths"),
                ) },
                notice = if (revisionMode) "正在编辑已发布作品；提交后将按网站规则送审" else "已恢复服务端草稿",
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
                        localFile != null -> "图片上传未完成，请重试"
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

    fun reportError(message: String) = mutableState.update { it.copy(error = message) }

    private fun scheduleSave() {
        val current = mutableState.value
        if (current.title.isBlank() && current.body.isBlank() && current.images.isEmpty()) return
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(900)
            saveDraft()
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
            .put("topicText", current.topicText).put("category", current.category).put("images", images)
            .put("pendingDeletePaths", JSONArray(current.pendingDeletePaths))
            .put("needsServerSync", needsServerSync).put("savedAt", System.currentTimeMillis())
        return runCatching { repository.saveLocalPublishSnapshot(accountId, snapshot) }
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
        val image = PendingImage(key, Uri.fromFile(localFile), name, progress = true, uploadId = uploadId, mime = mime, localFilePath = localFile.absolutePath)
        mutableState.update { it.copy(accountId = accountId, images = it.images + image, error = null) }
        needsServerSync = true
        if (!persistLocalSnapshot()) {
            mutableState.update { state -> state.copy(images = state.images.map { if (it.key == key) it.copy(progress = false, error = "本机草稿快照未能保存") else it }) }
            return
        }
        lateinit var job: Job
        job = viewModelScope.launch { uploadPendingImage(key) }
        uploadJobs[key] = job
        job.invokeOnCompletion { if (uploadJobs[key] === job) uploadJobs.remove(key) }
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
            val cloudId = if (current.revisionMode) current.draftCloudId.orEmpty() else ensureDraft().optString("cloudId")
            if (cloudId.isBlank()) throw IllegalStateException("内容编号无效")
            val bytes = withContext(Dispatchers.IO) { localPath.readBytes() }
            val order = mutableState.value.images.indexOfFirst { it.key == key }.coerceAtLeast(0)
            val result = repository.uploadImage(cloudId, image.uploadId!!, image.name, image.mime!!, bytes, order, current.revisionMode)
            val path = result.optString("path").takeIf(String::isNotBlank) ?: throw IllegalStateException("服务端未返回图片路径")
            if (mutableState.value.images.none { it.key == key }) {
                runCatching { repository.deleteUploadedImage(cloudId, path) }
                withContext(Dispatchers.IO) { localPath.delete() }
                return
            }
            mutableState.update { state ->
                val images = state.images.map { if (it.key == key) it.copy(path = path, progress = false, error = null, preview = Uri.fromFile(localPath), uploadedBySession = true) else it }
                state.copy(images = images, mediaPaths = images.mapNotNull(PendingImage::path), error = null)
            }
            needsServerSync = true
            persistLocalSnapshot()
            if (!mutableState.value.revisionMode) saveDraftInternal()
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
        val canDeleteRemote = remotePath != null && latest.draftCloudId != null &&
            (!latest.revisionMode || removed?.uploadId != null || removed?.uploadedBySession == true)
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
        val localSaved = persistLocalSnapshot()
        val saved = saveDraftInternal()
        if (saved) onDone?.invoke() else mutableState.update {
            it.copy(showLeaveDialog = onDone != null && localSaved, notice = if (localSaved) "内容已保存在本机，联网后可继续同步" else "同步失败，且本机副本未能确认保存；请留在页面重试")
        }
    }

    fun continueEditing() = mutableState.update { it.copy(showLeaveDialog = false) }

    fun leaveWithLocalCopy(onLeave: () -> Unit) = viewModelScope.launch {
        if (!persistLocalSnapshot()) return@launch
        mutableState.update { it.copy(showLeaveDialog = false) }
        onLeave()
    }

    private suspend fun ensureDraft(): JSONObject = draftMutex.withLock {
        val current = mutableState.value
        ensureSameAccount(current.accountId)
        if (current.revisionMode) return@withLock JSONObject().put("id", current.draftId).put("cloudId", current.draftCloudId.orEmpty())
        if (current.draftId != null && !current.draftCloudId.isNullOrBlank()) return@withLock JSONObject().put("id", current.draftId).put("cloudId", current.draftCloudId)
        val result = repository.createOrUpdateDraft(current.draftId, current.title, current.body, current.category.ifBlank { "生活" }, parseTopics(current.topicText), current.mediaPaths)
        val id = result.optInt("id")
        if (id <= 0) throw IllegalStateException("草稿编号无效")
        mutableState.update { it.copy(draftId = id, draftCloudId = result.optString("cloudId").takeIf(String::isNotBlank), serverStatus = result.optString("status").ifBlank { "draft" }) }
        persistLocalSnapshot()
        result
    }

    private suspend fun saveDraftInternal(): Boolean = saveMutex.withLock {
        val current = mutableState.value
        if (current.title.isBlank() && current.body.isBlank() && current.images.isEmpty()) return@withLock true
        if (current.revisionMode) {
            retryPendingDeletes()
            persistLocalSnapshot()
            mutableState.update { it.copy(saving = false, notice = "修改已保存在本机，提交时将送审") }
            return@withLock true
        }
        mutableState.update { it.copy(saving = true, error = null) }
        runCatching {
            ensureSameAccount(current.accountId)
            retryPendingDeletes()
            repository.createOrUpdateDraft(current.draftId, current.title, current.body, current.category.ifBlank { "生活" }, parseTopics(current.topicText), current.mediaPaths)
        }
            .fold(
                onSuccess = { result ->
                    mutableState.update { it.copy(draftId = result.optInt("id").takeIf { id -> id > 0 } ?: it.draftId, draftCloudId = result.optString("cloudId").takeIf(String::isNotBlank) ?: it.draftCloudId, serverStatus = result.optString("status").ifBlank { it.serverStatus }, saving = false, notice = if (it.serverStatus == "pending_review") "审核中的作品已更新" else "草稿已保存") }
                    needsServerSync = mutableState.value.pendingDeletePaths.isNotEmpty()
                    persistLocalSnapshot()
                    true
                },
                onFailure = { error ->
                    mutableState.update { it.copy(saving = false, error = error.message ?: "草稿保存失败", notice = "内容已保存在本机，联网后可继续同步") }
                    persistLocalSnapshot()
                    false
                },
            )
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
            if (current.images.any { it.error != null || it.path == null }) {
                mutableState.update { it.copy(error = "请重试失败图片上传，或移除未完成的图片") }
                return@launch
            }
            mutableState.update { it.copy(publishing = true, error = null, notice = null) }
            val ready = if (current.revisionMode) true else saveDraftInternal()
            if (!ready) {
                mutableState.update { it.copy(publishing = false) }
                return@launch
            }
            val latest = mutableState.value
            runCatching {
                ensureSameAccount(latest.accountId)
                repository.publishDraft(latest.draftId, latest.title, latest.body, latest.category, parseTopics(latest.topicText), latest.mediaPaths)
            }
                .onSuccess { result ->
                    clearLocalFiles(latest.images)
                    latest.accountId?.let { repository.clearLocalPublishSnapshot(it) }
                    needsServerSync = false
                    mutableState.update { it.copy(publishing = false, serverStatus = result.optString("status").ifBlank { if (latest.revisionMode) "published" else "pending_review" }, notice = if (latest.revisionMode) "修改已提交审核，原作品保持发布" else "内容已提交审核", publishedPost = result) }
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
