package com.heika.nativeapp.feature.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.ui.NativePreferences
import com.heika.nativeapp.data.jsonObjects
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject

data class NativeComment(
    val id: String,
    val parentId: String?,
    val body: String,
    val authorId: String,
    val author: String,
    val createdAt: String,
)

data class PostDetailState(
    val post: HeikaPost? = null,
    val comments: List<NativeComment> = emptyList(),
    val commentsHasMore: Boolean = false,
    val loadingMoreComments: Boolean = false,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val sending: Boolean = false,
    val liked: Boolean = false,
    val saved: Boolean = false,
    val rating: Int? = null,
    val ratingSending: Boolean = false,
    val ratingAnimationKey: Int = 0,
    val ratingAnimationScore: Int = 0,
    val average: Double? = null,
    val ratingCount: Int = 0,
    val following: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val commentSubmitted: Int = 0,
    val aiVersions: List<JSONObject> = emptyList(),
    val aiVersionsLoading: Boolean = false,
    val aiVersionsError: String? = null,
    val aiFeedbackSending: Boolean = false,
    val aiFeedbackSubmitted: Boolean = false,
)

@HiltViewModel
class PostDetailViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
    preferences: NativePreferences,
) : ViewModel() {
    val readingMode = preferences.readingMode.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "standard")
    private val mutableState = MutableStateFlow(PostDetailState())
    val state = mutableState.asStateFlow()
    private var loadedId: String? = null
    private var requestVersion = 0
    private var aiVersionRequest = 0
    private var requestedVersionsFor: String? = null
    private var commentPage = 0
    private var requestedKey: String? = null

    fun load(post: HeikaPost, force: Boolean = false) {
        val key = post.cloudId.ifBlank { post.id.toString() }
        if (!force && loadedId == key && mutableState.value.post != null) return
        loadedId = key
        requestedKey = key
        val version = ++requestVersion
        aiVersionRequest++
        mutableState.value = PostDetailState(post = post, loading = false, refreshing = true)
        if (post.channel == "ai") loadAiVersions(post)
        viewModelScope.launch {
            runCatching { repository.postDetail(post) }
                .onSuccess { detail ->
                    if (version != requestVersion) return@onSuccess
                    mutableState.update { it.copy(post = detail, loading = false, refreshing = false, error = null) }
                    loadComments(detail, version)
                    loadInteractions(detail, version)
                }
                .onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(loading = false, refreshing = false, error = error.message ?: "内容暂时无法加载") } }
        }
    }

    fun loadByKey(key: String, force: Boolean = false) {
        if (!force && loadedId == key && mutableState.value.post != null) return
        loadedId = key
        requestedKey = key
        val version = ++requestVersion
        aiVersionRequest++
        mutableState.value = PostDetailState(loading = true)
        viewModelScope.launch {
            runCatching { repository.cachedPostDetail(key) }.getOrNull()?.let { cached ->
                if (version == requestVersion) {
                    mutableState.update { it.copy(post = cached, loading = false, refreshing = true, error = null) }
                    if (cached.channel == "ai") loadAiVersions(cached)
                }
            }
            runCatching { repository.postDetailByKey(key) }
                .onSuccess { detail ->
                    if (version != requestVersion) return@onSuccess
                    mutableState.update { it.copy(post = detail, loading = false, refreshing = false, error = null) }
                    loadComments(detail, version)
                    loadInteractions(detail, version)
                    if (detail.channel == "ai") loadAiVersions(detail)
                }
                .onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(loading = false, refreshing = false, error = error.message ?: "内容暂时无法加载") } }
        }
    }

    fun reload() {
        val key = requestedKey ?: return
        if (mutableState.value.post != null) load(mutableState.value.post!!, force = true) else loadByKey(key, force = true)
    }

    fun loadAiVersions(post: HeikaPost? = mutableState.value.post, force: Boolean = false) {
        val resource = post ?: return
        val requestedPostId = resource.cloudId.ifBlank { resource.id.toString() }
        if (!force && requestedVersionsFor == requestedPostId) return
        requestedVersionsFor = requestedPostId
        val requestId = ++aiVersionRequest
        viewModelScope.launch {
        if (resource.channel != "ai" || !isUuid(resource.cloudId)) return@launch
        val resourceKey = resource.cloudId.ifBlank { resource.id.toString() }
        val cached = runCatching { repository.cachedAiResourceVersions(resource.cloudId) }.getOrNull()
        if (requestId != aiVersionRequest || mutableState.value.post?.let { it.cloudId.ifBlank { it.id.toString() } } != resourceKey) return@launch
        if (cached != null) mutableState.update { it.copy(aiVersions = cached, aiVersionsLoading = false, aiVersionsError = null) }
        else mutableState.update { it.copy(aiVersionsLoading = true, aiVersionsError = null) }
        runCatching { repository.aiResourceVersions(resource.cloudId) }
            .onSuccess { versions -> if (requestId == aiVersionRequest && mutableState.value.post?.let { it.cloudId.ifBlank { it.id.toString() } } == resourceKey) {
                mutableState.update { it.copy(aiVersions = versions, aiVersionsLoading = false, aiVersionsError = null) }
                runCatching { repository.saveAiResourceVersions(resource.cloudId, versions) }
            } }
            .onFailure { error -> if (requestId == aiVersionRequest && mutableState.value.post?.let { it.cloudId.ifBlank { it.id.toString() } } == resourceKey) mutableState.update { it.copy(aiVersionsLoading = false, aiVersionsError = if (cached == null) error.message ?: "版本记录加载失败" else null) } }
        }
    }

    fun submitAiFeedback(kind: String, details: String) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val version = requestVersion
        if (post.channel != "ai") return@launch
        if (runCatching { auth.current() != null }.getOrDefault(false).not()) {
            mutableState.update { it.copy(notice = "登录后可以提交资源反馈") }
            return@launch
        }
        if (mutableState.value.aiFeedbackSending) return@launch
        mutableState.update { it.copy(aiFeedbackSending = true, aiFeedbackSubmitted = false, error = null) }
        runCatching { repository.submitAiResourceFeedback(post.cloudId, kind, details) }
            .onSuccess { if (version == requestVersion) mutableState.update { it.copy(aiFeedbackSending = false, aiFeedbackSubmitted = true, notice = "反馈已提交，管理员会核查") } }
            .onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(aiFeedbackSending = false, error = error.message ?: "反馈提交失败") } }
    }

    private fun loadComments(post: HeikaPost, version: Int = requestVersion) = viewModelScope.launch {
        if (!isUuid(post.cloudId)) return@launch
        commentPage = 0
        runCatching { repository.comments(post.cloudId, 1) }.onSuccess { data ->
            val rows = data.optJSONArray("items").jsonObjects().map { row ->
                val author = row.optJSONObject("author")
                NativeComment(row.optString("id"), row.optString("parent_id").takeIf(String::isNotBlank), row.optString("body"), row.optString("author_id"), author?.optString("nickname").orEmpty().ifBlank { "探索者" }, row.optString("created_at"))
            }
            if (version == requestVersion) {
                commentPage = 1
                mutableState.update { it.copy(comments = rows, commentsHasMore = data.optBoolean("has_more"), loadingMoreComments = false) }
            }
        }.onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(error = error.message ?: "评论暂时无法加载") } }
    }

    fun loadMoreComments() = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val version = requestVersion
        if (!isUuid(post.cloudId) || !mutableState.value.commentsHasMore || mutableState.value.loadingMoreComments) return@launch
        val next = commentPage + 1
        mutableState.update { it.copy(loadingMoreComments = true) }
        runCatching { repository.comments(post.cloudId, next) }.onSuccess { data ->
            if (version != requestVersion || mutableState.value.post?.cloudId != post.cloudId) return@onSuccess
            val rows = data.optJSONArray("items").jsonObjects().map { row ->
                val author = row.optJSONObject("author")
                NativeComment(row.optString("id"), row.optString("parent_id").takeIf(String::isNotBlank), row.optString("body"), row.optString("author_id"), author?.optString("nickname").orEmpty().ifBlank { "探索者" }, row.optString("created_at"))
            }
            commentPage = next
            mutableState.update { state -> state.copy(comments = (state.comments + rows).distinctBy { it.id }, commentsHasMore = data.optBoolean("has_more"), loadingMoreComments = false) }
        }.onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(loadingMoreComments = false, error = error.message ?: "更多评论加载失败") } }
    }

    private fun loadInteractions(post: HeikaPost, version: Int = requestVersion) = viewModelScope.launch {
        val signedIn = runCatching { auth.current() != null }.getOrDefault(false)
        val state = runCatching { repository.interactionState(post.id) }.getOrDefault(JSONObject())
        val rating = runCatching { repository.ratingState(post.id) }.getOrDefault(JSONObject())
        if (version != requestVersion) return@launch
        mutableState.update { it.copy(liked = signedIn && state.optBoolean("liked"), saved = signedIn && state.optBoolean("saved"), rating = rating.optInt("myRating").takeIf { value -> value in 1..5 }, average = rating.optDouble("average").takeIf { value -> value > 0 }, ratingCount = rating.optInt("count")) }
        val authorId = post.authorId
        if (signedIn && authorId != null) {
            runCatching { repository.creatorFollowState(authorId) }.onSuccess { follow -> if (version == requestVersion) mutableState.update { it.copy(following = follow.optBoolean("following")) } }
        }
    }

    fun toggleLike() = toggleInteraction("like")
    fun toggleSaved() = toggleInteraction("bookmark")

    private fun toggleInteraction(action: String) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val version = requestVersion
        if (runCatching { auth.current() == null }.getOrDefault(true)) {
            mutableState.update { it.copy(notice = "请先登录后继续") }
            return@launch
        }
        val old = mutableState.value
        val liked = if (action == "like") !old.liked else old.liked
        val saved = if (action == "bookmark") !old.saved else old.saved
        mutableState.update { it.copy(liked = liked, saved = saved, error = null, notice = null) }
        runCatching { repository.setPostInteraction(post.id, action, if (action == "like") liked else saved) }
            .onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(liked = old.liked, saved = old.saved, error = error.message ?: "操作失败") } }
    }

    fun rate(value: Int) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val old = mutableState.value
        val version = requestVersion
        if (old.ratingSending || value !in 1..5) return@launch
        if (runCatching { auth.current() == null }.getOrDefault(true)) {
            mutableState.update { it.copy(notice = "登录后可以为内容评分") }
            return@launch
        }
        mutableState.update { it.copy(ratingSending = true, error = null, notice = null) }
        runCatching { repository.ratePost(post.id, value) }.onSuccess { result ->
            if (version != requestVersion) return@onSuccess
            val awarded = result.optJSONObject("experience")?.optInt("awarded", 0) ?: 0
            mutableState.update {
                it.copy(
                    rating = result.optInt("myRating", value).takeIf { score -> score in 1..5 },
                    average = result.optDouble("average").takeIf { it.isFinite() },
                    ratingCount = result.optInt("count").coerceAtLeast(0),
                    ratingSending = false,
                    ratingAnimationKey = it.ratingAnimationKey + 1,
                    ratingAnimationScore = result.optInt("myRating", value),
                    notice = if (awarded > 0) "评分已保存 · +$awarded EXP" else "评分已保存",
                )
            }
        }.onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(rating = old.rating, ratingSending = false, error = error.message ?: "评分失败") } }
    }

    fun toggleFollow() = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val id = post.authorId ?: return@launch
        val version = requestVersion
        if (runCatching { auth.current() == null }.getOrDefault(true)) {
            mutableState.update { it.copy(notice = "登录后可以关注创作者") }
            return@launch
        }
        runCatching { repository.toggleCreatorFollow(id) }.onSuccess { result -> if (version == requestVersion) mutableState.update { it.copy(following = result.optBoolean("following"), notice = if (result.optBoolean("following")) "已关注" else "已取消关注") } }
            .onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(error = error.message ?: "关注操作失败") } }
    }

    fun comment(body: String, parentId: String? = null) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val version = requestVersion
        if (!isUuid(post.cloudId)) {
            mutableState.update { it.copy(error = "这篇内容暂不支持评论") }
            return@launch
        }
        if (runCatching { auth.current() == null }.getOrDefault(true)) {
            mutableState.update { it.copy(notice = "请先登录后发表评论") }
            return@launch
        }
        val text = body.trim()
        if (text.isBlank()) return@launch
        mutableState.update { it.copy(sending = true, error = null) }
        runCatching { repository.addComment(post.cloudId, text, parentId) }
            .onSuccess { item ->
                if (version != requestVersion) return@onSuccess
                val author = item.optJSONObject("author")
                val comment = NativeComment(item.optString("id"), item.optString("parent_id").takeIf(String::isNotBlank), item.optString("body"), item.optString("author_id"), author?.optString("nickname").orEmpty().ifBlank { "我" }, item.optString("created_at"))
                mutableState.update { it.copy(comments = listOf(comment) + it.comments, sending = false, notice = "评论已发送", commentSubmitted = it.commentSubmitted + 1) }
            }
            .onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(sending = false, error = error.message ?: "评论发送失败") } }
    }

    fun report(reason: String, note: String) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val version = requestVersion
        if (!isUuid(post.cloudId)) {
            mutableState.update { it.copy(error = "该内容暂不支持举报") }
            return@launch
        }
        if (runCatching { auth.current() != null }.getOrDefault(false).not()) {
            mutableState.update { it.copy(notice = "请先登录后举报内容") }
            return@launch
        }
        runCatching { repository.reportPost(post.cloudId, reason, note) }.onSuccess { result ->
            if (version != requestVersion) return@onSuccess
            mutableState.update { it.copy(notice = if (result.optBoolean("duplicate")) "你已举报过这篇内容，平台会继续处理" else "举报已提交，平台会进行人工复核") }
        }.onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(error = error.message ?: "举报提交失败") } }
    }

    private fun isUuid(value: String) = value.matches(Regex("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))
}
