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
    val authorAvatar: String? = null,
    val likeCount: Int = 0,
    val liked: Boolean = false,
)

private fun JSONObject.toNativeComment(): NativeComment {
    val author = optJSONObject("author")
    return NativeComment(
        id = optString("id"),
        parentId = optString("parent_id").takeIf(String::isNotBlank),
        body = optString("body"),
        authorId = optString("author_id"),
        author = author?.optString("nickname").orEmpty().ifBlank { "探索者" },
        createdAt = optString("created_at"),
        authorAvatar = author?.optString("avatar_url")?.takeIf(String::isNotBlank),
        likeCount = optInt("likeCount"),
        liked = optBoolean("liked"),
    )
}

data class PostDetailState(
    val post: HeikaPost? = null,
    val comments: List<NativeComment> = emptyList(),
    val commentsLoading: Boolean = false,
    val commentsError: String? = null,
    val commentsHasMore: Boolean = false,
    val loadingMoreComments: Boolean = false,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val sending: Boolean = false,
    val liked: Boolean = false,
    val likeCount: Int? = null,
    val saved: Boolean = false,
    val interactionSending: Boolean = false,
    val followSending: Boolean = false,
    val commentLikesSending: Set<String> = emptySet(),
    val rating: Int? = null,
    val ratingSending: Boolean = false,
    val ratingError: String? = null,
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
        mutableState.value = PostDetailState(post = post, likeCount = post.likeCount, loading = false, refreshing = true)
        if (post.channel == "ai") loadAiVersions(post)
        viewModelScope.launch {
            runCatching { repository.postDetail(post) }
                .onSuccess { detail ->
                    if (version != requestVersion) return@onSuccess
                    mutableState.update { it.copy(post = detail, likeCount = detail.likeCount, loading = false, refreshing = false, error = null) }
                    loadComments(detail, version)
                    loadInteractions(detail, version)
                }
                .onFailure { if (version == requestVersion) mutableState.update { it.copy(loading = false, refreshing = false, error = "内容暂时无法加载，请重试") } }
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
                    mutableState.update { it.copy(post = cached, likeCount = cached.likeCount, loading = false, refreshing = true, error = null) }
                    if (cached.channel == "ai") loadAiVersions(cached)
                }
            }
            runCatching { repository.postDetailByKey(key) }
                .onSuccess { detail ->
                    if (version != requestVersion) return@onSuccess
                    mutableState.update { it.copy(post = detail, likeCount = detail.likeCount, loading = false, refreshing = false, error = null) }
                    loadComments(detail, version)
                    loadInteractions(detail, version)
                    if (detail.channel == "ai") loadAiVersions(detail)
                }
                .onFailure { if (version == requestVersion) mutableState.update { it.copy(loading = false, refreshing = false, error = "内容暂时无法加载，请重试") } }
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
        mutableState.update { it.copy(commentsLoading = true, commentsError = null) }
        runCatching { repository.comments(post.cloudId, 1) }.onSuccess { data ->
            val rows = data.optJSONArray("items").jsonObjects().map { it.toNativeComment() }
            if (version == requestVersion) {
                commentPage = 1
                mutableState.update { it.copy(comments = rows, commentsHasMore = data.optBoolean("has_more"), loadingMoreComments = false, commentsLoading = false, commentsError = null) }
            }
        }.onFailure { if (version == requestVersion) mutableState.update { it.copy(commentsLoading = false, commentsError = "评论加载失败，请重试") } }
    }

    fun retryComments() { mutableState.value.post?.let { loadComments(it) } }

    fun toggleCommentLike(commentId: String) = viewModelScope.launch {
        val before = mutableState.value
        val comment = before.comments.firstOrNull { it.id == commentId } ?: return@launch
        val version = requestVersion
        val postId = before.post?.cloudId ?: return@launch
        if (commentId in before.commentLikesSending) return@launch
        mutableState.update { it.copy(commentLikesSending = it.commentLikesSending + commentId) }
        val signedIn = runCatching { auth.current() != null }.getOrDefault(false)
        if (version != requestVersion || mutableState.value.post?.cloudId != postId) return@launch
        if (!signedIn) {
            mutableState.update { it.copy(commentLikesSending = it.commentLikesSending - commentId, notice = "登录后可以点赞评论") }
            return@launch
        }
        val liked = !comment.liked
        mutableState.update { state -> state.copy(comments = state.comments.map { if (it.id == commentId) it.copy(liked = liked, likeCount = (it.likeCount + if (liked) 1 else -1).coerceAtLeast(0)) else it }) }
        runCatching { repository.setCommentLiked(commentId, liked) }
            .onFailure { if (version == requestVersion && mutableState.value.post?.cloudId == postId) mutableState.update { state -> state.copy(commentLikesSending = state.commentLikesSending - commentId, comments = state.comments.map { if (it.id == commentId) comment else it }, notice = "评论点赞失败，请重试") } }
            .onSuccess { if (version == requestVersion && mutableState.value.post?.cloudId == postId) mutableState.update { it.copy(commentLikesSending = it.commentLikesSending - commentId) } }
    }

    fun loadMoreComments() = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val version = requestVersion
        if (!isUuid(post.cloudId) || !mutableState.value.commentsHasMore || mutableState.value.loadingMoreComments) return@launch
        val next = commentPage + 1
        mutableState.update { it.copy(loadingMoreComments = true) }
        runCatching { repository.comments(post.cloudId, next) }.onSuccess { data ->
            if (version != requestVersion || mutableState.value.post?.cloudId != post.cloudId) return@onSuccess
            val rows = data.optJSONArray("items").jsonObjects().map { it.toNativeComment() }
            commentPage = next
            mutableState.update { state -> state.copy(comments = (state.comments + rows).distinctBy { it.id }, commentsHasMore = data.optBoolean("has_more"), loadingMoreComments = false) }
        }.onFailure { if (version == requestVersion) mutableState.update { it.copy(loadingMoreComments = false, commentsError = "更多评论加载失败，请重试") } }
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
        if (mutableState.value.interactionSending) return@launch
        if (post.id <= 0) {
            android.util.Log.w("PostDetail", "Blocked $action: invalid client post id=${post.id}")
            mutableState.update { it.copy(notice = "内容暂不可用") }
            return@launch
        }
        val old = mutableState.value
        mutableState.update { it.copy(interactionSending = true) }
        val signedIn = runCatching { auth.current() != null }.getOrDefault(false)
        if (version != requestVersion) return@launch
        if (!signedIn) {
            mutableState.update { it.copy(interactionSending = false, notice = "请先登录后继续") }
            return@launch
        }
        val liked = if (action == "like") !old.liked else old.liked
        val saved = if (action == "bookmark") !old.saved else old.saved
        val likeCount = if (action == "like") ((old.likeCount ?: post.likeCount) + if (liked) 1 else -1).coerceAtLeast(0) else old.likeCount
        mutableState.update { it.copy(liked = liked, likeCount = likeCount, saved = saved, error = null, notice = null) }
        runCatching { repository.setPostInteraction(post.id, action, if (action == "like") liked else saved) }
            .onSuccess { if (version == requestVersion) mutableState.update { it.copy(interactionSending = false) } }
            .onFailure { if (version == requestVersion) mutableState.update { it.copy(liked = old.liked, likeCount = old.likeCount, saved = old.saved, interactionSending = false, notice = if (action == "like") "点赞失败，请重试" else "收藏失败，请重试") } }
    }

    fun rate(value: Int) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val old = mutableState.value
        val version = requestVersion
        if (old.ratingSending || value !in 1..5) return@launch
        if (post.id <= 0 || post.channel !in setOf("community", "ai")) {
            android.util.Log.w("PostDetail", "Blocked rating: invalid post id/type id=${post.id} type=${post.channel}")
            mutableState.update { it.copy(ratingError = "内容暂不可用，请重试") }
            return@launch
        }
        mutableState.update { it.copy(ratingSending = true, ratingError = null) }
        val signedIn = runCatching { auth.current() != null }.getOrDefault(false)
        if (version != requestVersion) return@launch
        if (!signedIn) {
            mutableState.update { it.copy(ratingSending = false, notice = "登录后可以为内容评分") }
            return@launch
        }
        mutableState.update { it.copy(rating = value, ratingSending = true, ratingError = null, error = null, notice = null) }
        runCatching { repository.ratePost(post.id, value) }.onSuccess { result ->
            if (version != requestVersion) return@onSuccess
            val awarded = result.optJSONObject("experience")?.optInt("awarded", 0) ?: 0
            mutableState.update {
                it.copy(
                    rating = result.optInt("myRating", value).takeIf { score -> score in 1..5 },
                    average = result.optDouble("average").takeIf { it.isFinite() },
                    ratingCount = result.optInt("count").coerceAtLeast(0),
                    ratingSending = false,
                    ratingError = null,
                    ratingAnimationKey = it.ratingAnimationKey + 1,
                    ratingAnimationScore = result.optInt("myRating", value),
                    notice = if (awarded > 0) "评分已保存 · +$awarded EXP" else "评分已保存",
                )
            }
        }.onFailure { if (version == requestVersion) mutableState.update { it.copy(rating = old.rating, ratingSending = false, ratingError = "评分失败，请重试") } }
    }

    fun toggleFollow() = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val id = post.authorId ?: return@launch
        val version = requestVersion
        if (mutableState.value.followSending) return@launch
        mutableState.update { it.copy(followSending = true) }
        val signedIn = runCatching { auth.current() != null }.getOrDefault(false)
        if (version != requestVersion) return@launch
        if (!signedIn) {
            mutableState.update { it.copy(followSending = false, notice = "登录后可以关注创作者") }
            return@launch
        }
        runCatching { repository.toggleCreatorFollow(id) }.onSuccess { result -> if (version == requestVersion) mutableState.update { it.copy(following = result.optBoolean("following"), followSending = false, notice = if (result.optBoolean("following")) "已关注" else "已取消关注") } }
            .onFailure { if (version == requestVersion) mutableState.update { it.copy(followSending = false, notice = "关注失败，请重试") } }
    }

    fun comment(body: String, parentId: String? = null) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val version = requestVersion
        if (mutableState.value.sending) return@launch
        if (!isUuid(post.cloudId)) {
            mutableState.update { it.copy(error = "这篇内容暂不支持评论") }
            return@launch
        }
        mutableState.update { it.copy(sending = true, error = null) }
        val signedIn = runCatching { auth.current() != null }.getOrDefault(false)
        if (version != requestVersion) return@launch
        if (!signedIn) {
            mutableState.update { it.copy(sending = false, notice = "请先登录后发表评论") }
            return@launch
        }
        val text = body.trim()
        if (text.isBlank()) {
            mutableState.update { it.copy(sending = false) }
            return@launch
        }
        runCatching { repository.addComment(post.cloudId, text, parentId) }
            .onSuccess { item ->
                if (version != requestVersion) return@onSuccess
                val comment = item.toNativeComment().let { it.copy(author = it.author.ifBlank { "我" }) }
            mutableState.update { it.copy(comments = listOf(comment) + it.comments, sending = false, notice = "评论已发送", commentSubmitted = it.commentSubmitted + 1, commentsError = null) }
            }
            .onFailure { if (version == requestVersion) mutableState.update { it.copy(sending = false, error = "评论发送失败，请重试") } }
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
        }.onFailure { if (version == requestVersion) mutableState.update { it.copy(error = "举报提交失败，请重试") } }
    }

    private fun isUuid(value: String) = value.matches(Regex("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))
}
