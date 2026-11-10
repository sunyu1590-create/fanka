package com.heika.nativeapp.feature.publish

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaCategory
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import com.heika.nativeapp.data.stringList
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject

data class PendingImage(val key: String, val preview: Any, val name: String, val path: String? = null, val progress: Boolean = false, val error: String? = null)
data class PublishState(
    val title: String = "", val body: String = "", val topicText: String = "", val categories: List<HeikaCategory> = emptyList(),
    val category: String = "", val images: List<PendingImage> = emptyList(), val mediaPaths: List<String> = emptyList(),
    val draftId: Int? = null, val draftCloudId: String? = null, val loading: Boolean = true, val saving: Boolean = false, val publishing: Boolean = false,
    val error: String? = null, val notice: String? = null, val publishedPost: JSONObject? = null,
)

@HiltViewModel
class PublishViewModel @Inject constructor(private val repository: HeikaRepository, private val auth: AuthRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(PublishState())
    val state = mutableState.asStateFlow()
    private var saveJob: Job? = null
    private var draftLoaded = false
    private val saveMutex = Mutex()
    private val draftMutex = Mutex()

    init {
        viewModelScope.launch {
            if (runCatching { auth.current() }.getOrNull() == null) {
                mutableState.update { it.copy(loading = false, error = "登录后可以发布内容") }
                return@launch
            }
            val categories = runCatching { repository.loadCategories("community", "category") }.getOrDefault(emptyList())
            mutableState.update { it.copy(categories = categories, category = it.category.ifBlank { categories.firstOrNull()?.name.orEmpty() }, loading = false, error = if (categories.isEmpty()) "发布分类暂不可用，请重试" else it.error) }
        }
    }

    fun resumeDraft(requestedId: Int? = null) = viewModelScope.launch {
        if (draftLoaded) return@launch
        draftLoaded = true
        runCatching { repository.myLibraryState() }.onSuccess { profile ->
            val draft = profile.optJSONArray("own").jsonObjects().firstOrNull {
                it.optString("status") in setOf("draft", "pending_review") && (requestedId == null || it.optInt("id") == requestedId)
            } ?: return@onSuccess
            val paths = draft.stringList("mediaPaths")
            val previews = draft.stringList("thumbnailImages").ifEmpty { draft.stringList("images") }
            mutableState.update { current -> current.copy(
                draftId = draft.optInt("id").takeIf { it > 0 }, draftCloudId = draft.optString("cloudId").takeIf(String::isNotBlank), title = draft.optString("title"), body = draft.optString("body"),
                category = draft.optString("tag").ifBlank { current.category },
                topicText = draft.optJSONArray("topics")?.let { arr -> buildList { for (i in 0 until arr.length()) add(arr.optString(i)) }.joinToString(" ") } ?: current.topicText,
                mediaPaths = paths,
                images = paths.mapIndexed { index, path -> PendingImage("restored:$path", previews.getOrNull(index) ?: path, path.substringAfterLast('/'), path = path) },
                notice = "已恢复未完成草稿",
            ) }
        }
    }

    fun edit(title: String = mutableState.value.title, body: String = mutableState.value.body, topicText: String = mutableState.value.topicText, category: String = mutableState.value.category) {
        mutableState.update { it.copy(title = title.take(80), body = body.take(5000), topicText = topicText.take(200), category = category, error = null) }
        scheduleSave()
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

    fun addImage(uri: Uri, name: String, mime: String, bytes: ByteArray) = viewModelScope.launch {
        if (mutableState.value.images.size >= 9) {
            mutableState.update { it.copy(error = "一篇内容最多添加 9 张图片") }
            return@launch
        }
        if (bytes.size !in 1..(4 * 1024 * 1024) || mime !in setOf("image/jpeg", "image/png", "image/webp")) {
            mutableState.update { it.copy(error = "图片须为 4 MB 以内的 JPG、PNG 或 WebP") }
            return@launch
        }
        val key = uri.toString()
        val image = PendingImage(key, uri, name, progress = true)
        mutableState.update { it.copy(images = it.images + image, error = null) }
        runCatching {
            val draft = ensureDraft()
            val cloudId = draft.optString("cloudId").ifBlank { mutableState.value.draftCloudId.orEmpty() }
            if (cloudId.isBlank()) throw IllegalStateException("草稿内容编号无效")
            val upload = repository.uploadImage(cloudId, UUID.randomUUID().toString(), name, mime, bytes, mutableState.value.images.lastIndex)
            upload.optString("path")
        }.onSuccess { path ->
            mutableState.update { state ->
                val images = state.images.map { if (it.key == key) it.copy(path = path, progress = false) else it }
                state.copy(images = images, mediaPaths = images.mapNotNull(PendingImage::path), error = null)
            }
            saveDraft()
        }.onFailure { error ->
            mutableState.update { state -> state.copy(images = state.images.map { if (it.key == key) it.copy(progress = false, error = error.message ?: "上传失败") else it }, error = error.message ?: "图片上传失败") }
        }
    }

    fun removeImage(key: String) = viewModelScope.launch {
        val current = mutableState.value
        val removed = current.images.firstOrNull { it.key == key }
        mutableState.update { state ->
            val images = state.images.filterNot { it.key == key }
            state.copy(images = images, mediaPaths = images.mapNotNull(PendingImage::path))
        }
        val postId = current.draftCloudId
        if (removed?.path != null && postId != null) runCatching { repository.deleteUploadedImage(postId, removed.path) }
        saveDraft()
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
        scheduleSave()
    }

    fun saveDraft(onDone: (() -> Unit)? = null) = viewModelScope.launch {
        saveJob?.cancel()
        if (saveDraftInternal()) onDone?.invoke()
    }

    private suspend fun ensureDraft(): JSONObject {
        return draftMutex.withLock {
            val current = mutableState.value
            if (current.draftId != null) JSONObject().put("id", current.draftId).put("cloudId", current.draftCloudId.orEmpty())
            else {
                val result = repository.createOrUpdateDraft(title = current.title, body = current.body, tag = current.category.ifBlank { "生活" }, topics = parseTopics(current.topicText), mediaPaths = current.mediaPaths)
                val id = result.optInt("id")
                if (id <= 0) throw IllegalStateException("草稿编号无效")
                mutableState.update { it.copy(draftId = id, draftCloudId = result.optString("cloudId").takeIf(String::isNotBlank)) }
                result
            }
        }
    }

    private suspend fun saveDraftInternal(): Boolean = saveMutex.withLock {
        val current = mutableState.value
        if (current.title.isBlank() && current.body.isBlank() && current.images.isEmpty()) return@withLock true
        mutableState.update { it.copy(saving = true, error = null) }
        runCatching { repository.createOrUpdateDraft(current.draftId, current.title, current.body, current.category.ifBlank { "生活" }, parseTopics(current.topicText), current.mediaPaths) }
            .fold(
                onSuccess = { result ->
                    mutableState.update { it.copy(draftId = result.optInt("id").takeIf { id -> id > 0 } ?: it.draftId, draftCloudId = result.optString("cloudId").takeIf(String::isNotBlank) ?: it.draftCloudId, saving = false, notice = "草稿已保存") }
                    true
                },
                onFailure = { error ->
                    mutableState.update { it.copy(saving = false, error = error.message ?: "草稿保存失败") }
                    false
                },
            )
    }

    fun publish() = viewModelScope.launch {
        val current = mutableState.value
        saveJob?.cancel()
        if (current.saving) return@launch
        if (current.title.isBlank() || current.body.isBlank() || current.category.isBlank()) {
            mutableState.update { it.copy(error = "请填写标题、正文并选择分类") }
            return@launch
        }
        if (current.images.any { it.progress || it.path == null }) {
            mutableState.update { it.copy(error = "请等待图片上传完成，失败图片可移除后重试") }
            return@launch
        }
        mutableState.update { it.copy(publishing = true, error = null, notice = null) }
        runCatching { repository.publishDraft(current.draftId, current.title, current.body, current.category, parseTopics(current.topicText), current.mediaPaths) }
            .onSuccess { result -> mutableState.update { it.copy(publishing = false, notice = "内容已提交审核", publishedPost = result) } }
            .onFailure { error -> mutableState.update { it.copy(publishing = false, error = error.message ?: "发布失败，请重试") } }
    }

    private fun parseTopics(raw: String): List<String> = raw.split(Regex("[\\s,，#]+" )).map(String::trim).filter(String::isNotBlank).distinct().take(5)
}
