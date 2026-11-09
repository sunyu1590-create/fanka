package com.heika.nativeapp.feature.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    val sending: Boolean = false,
    val liked: Boolean = false,
    val saved: Boolean = false,
    val rating: Int? = null,
    val average: Double? = null,
    val ratingCount: Int = 0,
    val following: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val commentSubmitted: Int = 0,
)

@HiltViewModel
class PostDetailViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(PostDetailState())
    val state = mutableState.asStateFlow()
    private var loadedId: String? = null
    private var requestVersion = 0
    private var commentPage = 0

    fun load(post: HeikaPost) {
        val key = post.cloudId.ifBlank { post.id.toString() }
        if (loadedId == key && mutableState.value.post != null) return
        loadedId = key
        val version = ++requestVersion
        mutableState.value = PostDetailState(post = post, loading = true)
        viewModelScope.launch {
            runCatching { repository.postDetail(post) }
                .onSuccess { detail ->
                    if (version != requestVersion) return@onSuccess
                    mutableState.update { it.copy(post = detail, loading = false, error = null) }
                    loadComments(detail)
                    loadInteractions(detail)
                }
                .onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(loading = false, error = error.message ?: "内容暂时无法加载") } }
        }
    }

    fun loadByKey(key: String) {
        if (loadedId == key && mutableState.value.post != null) return
        loadedId = key
        val version = ++requestVersion
        mutableState.value = PostDetailState(loading = true)
        viewModelScope.launch {
            runCatching { repository.postDetailByKey(key) }
                .onSuccess { detail ->
                    if (version != requestVersion) return@onSuccess
                    mutableState.update { it.copy(post = detail, loading = false, error = null) }
                    loadComments(detail)
                    loadInteractions(detail)
                }
                .onFailure { error -> if (version == requestVersion) mutableState.update { it.copy(loading = false, error = error.message ?: "内容暂时无法加载") } }
        }
    }

    fun reload() { mutableState.value.post?.let { loadedId = null; load(it) } }

    private fun loadComments(post: HeikaPost) = viewModelScope.launch {
        if (!isUuid(post.cloudId)) return@launch
        commentPage = 0
        runCatching { repository.comments(post.cloudId, 1) }.onSuccess { data ->
            val rows = data.optJSONArray("items").jsonObjects().map { row ->
                val author = row.optJSONObject("author")
                NativeComment(row.optString("id"), row.optString("parent_id").takeIf(String::isNotBlank), row.optString("body"), row.optString("author_id"), author?.optString("nickname").orEmpty().ifBlank { "探索者" }, row.optString("created_at"))
            }
            commentPage = 1
            mutableState.update { it.copy(comments = rows, commentsHasMore = data.optBoolean("has_more"), loadingMoreComments = false) }
        }.onFailure { error -> mutableState.update { it.copy(error = error.message ?: "评论暂时无法加载") } }
    }

    fun loadMoreComments() = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        if (!isUuid(post.cloudId) || !mutableState.value.commentsHasMore || mutableState.value.loadingMoreComments) return@launch
        val next = commentPage + 1
        mutableState.update { it.copy(loadingMoreComments = true) }
        runCatching { repository.comments(post.cloudId, next) }.onSuccess { data ->
            val rows = data.optJSONArray("items").jsonObjects().map { row ->
                val author = row.optJSONObject("author")
                NativeComment(row.optString("id"), row.optString("parent_id").takeIf(String::isNotBlank), row.optString("body"), row.optString("author_id"), author?.optString("nickname").orEmpty().ifBlank { "探索者" }, row.optString("created_at"))
            }
            commentPage = next
            mutableState.update { state -> state.copy(comments = (state.comments + rows).distinctBy { it.id }, commentsHasMore = data.optBoolean("has_more"), loadingMoreComments = false) }
        }.onFailure { error -> mutableState.update { it.copy(loadingMoreComments = false, error = error.message ?: "更多评论加载失败") } }
    }

    private fun loadInteractions(post: HeikaPost) = viewModelScope.launch {
        val signedIn = runCatching { auth.current() != null }.getOrDefault(false)
        val state = runCatching { repository.interactionState(post.id) }.getOrDefault(JSONObject())
        val rating = runCatching { repository.ratingState(post.id) }.getOrDefault(JSONObject())
        mutableState.update { it.copy(liked = signedIn && state.optBoolean("liked"), saved = signedIn && state.optBoolean("saved"), rating = rating.optInt("myRating").takeIf { value -> value in 1..5 }, average = rating.optDouble("average").takeIf { value -> value > 0 }, ratingCount = rating.optInt("count")) }
        val authorId = post.authorId
        if (signedIn && authorId != null) {
            runCatching { repository.creatorFollowState(authorId) }.onSuccess { follow -> mutableState.update { it.copy(following = follow.optBoolean("following")) } }
        }
    }

    fun toggleLike() = toggleInteraction("like")
    fun toggleSaved() = toggleInteraction("bookmark")

    private fun toggleInteraction(action: String) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        if (runCatching { auth.current() == null }.getOrDefault(true)) {
            mutableState.update { it.copy(notice = "请先登录后继续") }
            return@launch
        }
        val old = mutableState.value
        val liked = if (action == "like") !old.liked else old.liked
        val saved = if (action == "bookmark") !old.saved else old.saved
        mutableState.update { it.copy(liked = liked, saved = saved, error = null, notice = null) }
        runCatching { repository.setPostInteraction(post.id, action, if (action == "like") liked else saved) }
            .onFailure { error -> mutableState.update { it.copy(liked = old.liked, saved = old.saved, error = error.message ?: "操作失败") } }
    }

    fun rate(value: Int) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        val old = mutableState.value
        if (runCatching { auth.current() == null }.getOrDefault(true)) {
            mutableState.update { it.copy(notice = "登录后可以为内容评分") }
            return@launch
        }
        mutableState.update { it.copy(rating = value, error = null) }
        runCatching { repository.ratePost(post.id, value) }.onSuccess { result ->
            mutableState.update { it.copy(average = result.optDouble("average"), ratingCount = result.optInt("count"), notice = "评分已保存") }
        }.onFailure { error -> mutableState.update { it.copy(rating = old.rating, error = error.message ?: "评分失败") } }
    }

    fun toggleFollow() = viewModelScope.launch {
        val id = mutableState.value.post?.authorId ?: return@launch
        if (runCatching { auth.current() == null }.getOrDefault(true)) {
            mutableState.update { it.copy(notice = "登录后可以关注创作者") }
            return@launch
        }
        runCatching { repository.toggleCreatorFollow(id) }.onSuccess { result -> mutableState.update { it.copy(following = result.optBoolean("following"), notice = if (result.optBoolean("following")) "已关注" else "已取消关注") } }
            .onFailure { error -> mutableState.update { it.copy(error = error.message ?: "关注操作失败") } }
    }

    fun comment(body: String, parentId: String? = null) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
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
                val author = item.optJSONObject("author")
                val comment = NativeComment(item.optString("id"), item.optString("parent_id").takeIf(String::isNotBlank), item.optString("body"), item.optString("author_id"), author?.optString("nickname").orEmpty().ifBlank { "我" }, item.optString("created_at"))
                mutableState.update { it.copy(comments = listOf(comment) + it.comments, sending = false, notice = "评论已发送", commentSubmitted = it.commentSubmitted + 1) }
            }
            .onFailure { error -> mutableState.update { it.copy(sending = false, error = error.message ?: "评论发送失败") } }
    }

    fun report(reason: String, note: String) = viewModelScope.launch {
        val post = mutableState.value.post ?: return@launch
        if (!isUuid(post.cloudId)) {
            mutableState.update { it.copy(error = "该内容暂不支持举报") }
            return@launch
        }
        if (runCatching { auth.current() != null }.getOrDefault(false).not()) {
            mutableState.update { it.copy(notice = "请先登录后举报内容") }
            return@launch
        }
        runCatching { repository.reportPost(post.cloudId, reason, note) }.onSuccess { result ->
            mutableState.update { it.copy(notice = if (result.optBoolean("duplicate")) "你已举报过这篇内容，平台会继续处理" else "举报已提交，平台会进行人工复核") }
        }.onFailure { error -> mutableState.update { it.copy(error = error.message ?: "举报提交失败") } }
    }

    private fun isUuid(value: String) = value.matches(Regex("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))
}
