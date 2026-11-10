package com.heika.nativeapp.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

data class NativeProfile(
    val id: String,
    val nickname: String,
    val bio: String,
    val avatar: String?,
    val tier: String,
    val showBookmarks: Boolean,
)

data class ProfileStats(val totalOpened: Int = 0, val streak: Int = 0, val bookmarks: Int = 0, val experience: Int = 0, val level: Int = 1, val progress: Int = 0)

data class ProfileState(
    val profile: NativeProfile? = null,
    val posts: List<HeikaPost> = emptyList(),
    val bookmarks: List<HeikaPost> = emptyList(),
    val liked: List<HeikaPost> = emptyList(),
    val drafts: List<HeikaPost> = emptyList(),
    val hasMoreWorks: Boolean = false,
    val hasMoreBookmarks: Boolean = false,
    val hasMoreLiked: Boolean = false,
    val loadingMore: String? = null,
    val stats: ProfileStats = ProfileStats(),
    val following: Boolean = false,
    val followerCount: Int = 0,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val own: Boolean = false,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(private val repository: HeikaRepository, private val auth: AuthRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(ProfileState())
    val state = mutableState.asStateFlow()
    private var loadedFor: String? = null
    private var lastRefreshAt: Long = 0L
    private var requestedOwnProfile = false
    private var loadGeneration = 0L
    private var profileLoadJob: Job? = null
    private var profileLoadRequestKey: String? = null

    init {
        viewModelScope.launch {
            auth.session.collect { session ->
                val current = mutableState.value
                if (requestedOwnProfile && loadedFor != session?.userId) {
                    loadedFor = null
                    lastRefreshAt = 0L
                    if (session == null) mutableState.value = ProfileState(loading = false, error = "登录后查看个人主页")
                    else load(null, force = true)
                }
            }
        }
    }

    fun load(requestedId: String?, force: Boolean = false): Job {
        val requestKey = requestedId ?: "__own__"
        if (!force && profileLoadJob?.isActive == true && profileLoadRequestKey == requestKey) return profileLoadJob!!
        profileLoadRequestKey = requestKey
        val generation = ++loadGeneration
        val job = viewModelScope.launch {
        requestedOwnProfile = requestedId == null
        val session = runCatching { auth.current() }.getOrNull()
        if (requestedId == null && session == null) {
            mutableState.value = ProfileState(loading = false, error = "登录后查看个人主页")
            return@launch
        }
        val id = requestedId ?: session!!.userId
        val own = session?.userId == id
        if (!force && loadedFor == id && !mutableState.value.loading && System.currentTimeMillis() - lastRefreshAt < 60_000L) return@launch
        loadedFor = id

        if (own && mutableState.value.profile == null) {
            runCatching { repository.cachedMyProfile(id) }.getOrNull()?.let { cached ->
                mutableState.value = decodeSnapshot(cached, own = true).copy(loading = false, refreshing = true)
            }
        } else if (mutableState.value.profile != null && mutableState.value.profile?.id == id) {
            mutableState.update { it.copy(loading = false, refreshing = true, error = null) }
        } else {
            mutableState.value = ProfileState(own = own, loading = true)
        }

        runCatching {
            if (own) {
                val profileReq = async { repository.myProfile() }
                val postsReq = async { repository.myLibrary("own") }
                val bookmarksReq = async { repository.myLibrary("bookmarks") }
                val likedReq = async { repository.myLibrary("liked") }
                val libraryStateReq = async { repository.myLibraryState() }
                val progressionReq = async { repository.progression() }
                val data = profileReq.await()
                val profileJson = data.optJSONObject("profile") ?: data
                val profile = profileJson.toProfile(id)
                val ownLibrary = postsReq.await()
                val bookmarkLibrary = bookmarksReq.await()
                val likedLibrary = likedReq.await()
                val owned = ownLibrary.optJSONArray("items").jsonObjects().map(HeikaPost::from)
                val bookmarks = bookmarkLibrary.optJSONArray("items").jsonObjects().map(HeikaPost::from)
                val liked = likedLibrary.optJSONArray("items").jsonObjects().map(HeikaPost::from)
                val interactions = libraryStateReq.await().optJSONArray("interactions").jsonObjects()
                val openedIds = interactions.asSequence().filter { it.optString("opened_at").isNotBlank() }
                    .mapNotNull { it.optJSONObject("posts")?.optInt("client_id")?.takeIf { id -> id > 0 } }.toSet()
                val openedDates = interactions.asSequence().mapNotNull { row ->
                    if (row.optString("opened_at").isBlank()) null else row.optString("opened_at").take(10)
                }.toSet()
                val progression = progressionReq.await()
                val experience = progression.optInt("total")
                val levels = listOf(0, 100, 240, 430, 680, 1000, 1390, 1850, 2380, 2980)
                val levelIndex = levels.indexOfLast { experience >= it }.coerceAtLeast(0)
                val levelStart = levels[levelIndex]
                val levelEnd = levels.getOrNull(levelIndex + 1)
                val stats = ProfileStats(
                    totalOpened = openedIds.size,
                    streak = calculateStreak(openedDates),
                    bookmarks = data.optJSONArray("bookmarks")?.length() ?: bookmarks.size,
                    experience = experience,
                    level = levelIndex + 1,
                    progress = if (levelEnd == null) 100 else (((experience - levelStart).toFloat() / (levelEnd - levelStart)) * 100).toInt().coerceIn(0, 100),
                )
                ProfileLoadResult(
                    profile,
                    owned.filter { JSONObject(it.rawJson).optString("status") != "draft" },
                    bookmarks,
                    liked,
                    owned.filter { JSONObject(it.rawJson).optString("status") == "draft" },
                    stats,
                    JSONObject(),
                    ownLibrary.optBoolean("has_more"),
                    bookmarkLibrary.optBoolean("has_more"),
                    likedLibrary.optBoolean("has_more"),
                )
            } else {
                val data = repository.profile(id)
                val profileJson = data.optJSONObject("profile") ?: data
                val posts = data.optJSONArray("posts").jsonObjects().map(HeikaPost::from)
                val bookmarks = data.optJSONArray("bookmarks").jsonObjects().map(HeikaPost::from)
                val follow = if (session != null) runCatching { repository.creatorFollowState(id) }.getOrDefault(JSONObject()) else JSONObject()
                ProfileLoadResult(profileJson.toProfile(id), posts, bookmarks, emptyList(), emptyList(), ProfileStats(bookmarks = bookmarks.size), follow)
            }
        }.onSuccess { result ->
            if (generation != loadGeneration || loadedFor != id) return@onSuccess
            val latestUser = runCatching { auth.current()?.userId }.getOrNull()
            if (own && latestUser != id) return@onSuccess
            val updated = ProfileState(
                profile = result.profile, posts = result.posts, bookmarks = result.bookmarks, liked = result.liked,
                drafts = result.drafts, hasMoreWorks = result.hasMoreWorks,
                hasMoreBookmarks = result.hasMoreBookmarks, hasMoreLiked = result.hasMoreLiked,
                stats = result.stats, following = result.follow.optBoolean("following"),
                followerCount = result.follow.optInt("followerCount"), loading = false, refreshing = false, own = own,
            )
            mutableState.value = updated
            lastRefreshAt = System.currentTimeMillis()
            if (own) runCatching { repository.saveMyProfileCache(id, encodeSnapshot(updated)) }
        }.onFailure { error ->
            if (generation == loadGeneration && loadedFor == id) mutableState.update { it.copy(loading = false, refreshing = false, error = error.message ?: "个人主页刷新失败") }
        }
        }
        profileLoadJob = job
        job.invokeOnCompletion { if (profileLoadJob == job) profileLoadRequestKey = null }
        return job
    }

    fun loadMore(kind: String) = viewModelScope.launch {
        val before = mutableState.value
        if (!before.own || before.loadingMore != null || kind !in setOf("own", "bookmarks", "liked")) return@launch
        val hasMore = when (kind) { "own" -> before.hasMoreWorks; "bookmarks" -> before.hasMoreBookmarks; else -> before.hasMoreLiked }
        if (!hasMore) return@launch
        val existingCount = when (kind) {
            "own" -> before.posts.size + before.drafts.size
            "bookmarks" -> before.bookmarks.size
            else -> before.liked.size
        }
        val page = existingCount / 24 + 1
        val profileId = before.profile?.id ?: return@launch
        mutableState.update { it.copy(loadingMore = kind) }
        runCatching { repository.myLibrary(kind, page) }
            .onSuccess { response ->
                if (mutableState.value.profile?.id != profileId) return@onSuccess
                val incoming = response.optJSONArray("items").jsonObjects().map(HeikaPost::from)
                mutableState.update { current ->
                    fun append(old: List<HeikaPost>, new: List<HeikaPost>): List<HeikaPost> {
                        val seen = old.map { it.cloudId.ifBlank { it.id.toString() } }.toHashSet()
                        return old + new.filter { seen.add(it.cloudId.ifBlank { it.id.toString() }) }
                    }
                    when (kind) {
                        "own" -> {
                            val all = append(current.posts + current.drafts, incoming)
                            current.copy(
                                posts = all.filter { JSONObject(it.rawJson).optString("status") != "draft" },
                                drafts = all.filter { JSONObject(it.rawJson).optString("status") == "draft" },
                                hasMoreWorks = response.optBoolean("has_more"), loadingMore = null,
                            )
                        }
                        "bookmarks" -> current.copy(bookmarks = append(current.bookmarks, incoming), hasMoreBookmarks = response.optBoolean("has_more"), loadingMore = null)
                        else -> current.copy(liked = append(current.liked, incoming), hasMoreLiked = response.optBoolean("has_more"), loadingMore = null)
                    }
                }
                runCatching { repository.saveMyProfileCache(profileId, encodeSnapshot(mutableState.value)) }
            }
            .onFailure { error -> mutableState.update { it.copy(loadingMore = null, error = error.message ?: "更多内容加载失败") } }
    }

    fun deleteOwnPost(post: HeikaPost) = viewModelScope.launch {
        if (!mutableState.value.own) return@launch
        mutableState.update { it.copy(saving = true, error = null, notice = null) }
        runCatching { repository.deleteMyPost(post.id) }
            .onSuccess {
                mutableState.update { current ->
                    current.copy(
                        posts = current.posts.filterNot { it.id == post.id },
                        drafts = current.drafts.filterNot { it.id == post.id },
                        bookmarks = current.bookmarks.filterNot { it.id == post.id },
                        liked = current.liked.filterNot { it.id == post.id },
                        saving = false,
                        notice = "作品已删除",
                    )
                }
                mutableState.value.profile?.id?.let { id -> runCatching { repository.saveMyProfileCache(id, encodeSnapshot(mutableState.value)) } }
            }
            .onFailure { error -> mutableState.update { it.copy(saving = false, error = error.message ?: "删除作品失败") } }
    }

    fun updateProfile(nickname: String, bio: String) = viewModelScope.launch {
        val previous = mutableState.value.profile ?: return@launch
        val name = nickname.trim()
        val description = bio.trim()
        if (name.length !in 1..24 || description.length > 80) {
            mutableState.update { it.copy(error = "昵称需为 1–24 个字符，简介最多 80 个字符") }
            return@launch
        }
        mutableState.update { it.copy(saving = true, error = null, notice = null) }
        runCatching { repository.updateMyProfile(name, description) }.onSuccess { result ->
            val json = result.optJSONObject("profile") ?: result
            val updated = json.toProfile(previous.id).let { if (it.nickname == "探索者") previous.copy(nickname = name, bio = description) else it }
            mutableState.update { it.copy(profile = updated, saving = false, notice = "资料已保存") }
            runCatching { repository.saveMyProfileCache(previous.id, encodeSnapshot(mutableState.value)) }
        }.onFailure { error -> mutableState.update { it.copy(saving = false, error = error.message ?: "资料保存失败") } }
    }

    fun updateAvatar(fileName: String, mimeType: String, bytes: ByteArray) = viewModelScope.launch {
        val previous = mutableState.value.profile ?: return@launch
        mutableState.update { it.copy(saving = true, error = null, notice = null) }
        runCatching { repository.uploadMyAvatar(fileName, mimeType, bytes) }.onSuccess { result ->
            val json = result.optJSONObject("profile") ?: result
            val avatar = json.optString("avatar_url").takeIf(String::isNotBlank)
            if (avatar == null) mutableState.update { it.copy(saving = false, error = "头像已上传，但服务器未返回头像地址") }
            else {
                mutableState.update { it.copy(profile = previous.copy(avatar = avatar), saving = false, notice = "头像已更新") }
                runCatching { repository.saveMyProfileCache(previous.id, encodeSnapshot(mutableState.value)) }
            }
        }.onFailure { error -> mutableState.update { it.copy(saving = false, error = error.message ?: "头像上传失败") } }
    }

    fun reportError(message: String) { mutableState.update { it.copy(error = message) } }

    fun toggleFollow() = viewModelScope.launch {
        val profile = mutableState.value.profile ?: return@launch
        if (runCatching { auth.current() }.getOrNull() == null) {
            mutableState.update { it.copy(error = "登录后可以关注创作者") }
            return@launch
        }
        runCatching { repository.toggleCreatorFollow(profile.id) }.onSuccess { result ->
            mutableState.update { it.copy(following = result.optBoolean("following"), followerCount = result.optInt("followerCount"), error = null, notice = if (result.optBoolean("following")) "已关注" else "已取消关注") }
        }.onFailure { error -> mutableState.update { it.copy(error = error.message ?: "关注操作失败") } }
    }

    private fun decodeSnapshot(root: JSONObject, own: Boolean): ProfileState {
        fun posts(key: String) = root.optJSONArray(key).jsonObjects().map(HeikaPost::from)
        val profileJson = root.optJSONObject("profile") ?: JSONObject()
        return ProfileState(
            profile = profileJson.toProfile(profileJson.optString("id")), posts = posts("posts"), bookmarks = posts("bookmarks"),
            liked = posts("liked"), drafts = posts("drafts"),
            hasMoreWorks = root.optBoolean("hasMoreWorks"), hasMoreBookmarks = root.optBoolean("hasMoreBookmarks"),
            hasMoreLiked = root.optBoolean("hasMoreLiked"),
            stats = root.optJSONObject("stats")?.let { ProfileStats(it.optInt("totalOpened"), it.optInt("streak"), it.optInt("bookmarks"), it.optInt("experience"), it.optInt("level", 1), it.optInt("progress")) } ?: ProfileStats(),
            loading = false, own = own,
        )
    }

    private fun encodeSnapshot(state: ProfileState) = JSONObject()
        .put("profile", JSONObject().put("id", state.profile?.id).put("nickname", state.profile?.nickname).put("bio", state.profile?.bio).put("avatar_url", state.profile?.avatar).put("membership_tier", state.profile?.tier).put("show_bookmarks", state.profile?.showBookmarks))
        .put("posts", JSONArray(state.posts.map { JSONObject(it.rawJson) }))
        .put("bookmarks", JSONArray(state.bookmarks.map { JSONObject(it.rawJson) }))
        .put("liked", JSONArray(state.liked.map { JSONObject(it.rawJson) }))
        .put("drafts", JSONArray(state.drafts.map { JSONObject(it.rawJson) }))
        .put("hasMoreWorks", state.hasMoreWorks).put("hasMoreBookmarks", state.hasMoreBookmarks).put("hasMoreLiked", state.hasMoreLiked)
        .put("stats", JSONObject().put("totalOpened", state.stats.totalOpened).put("streak", state.stats.streak).put("bookmarks", state.stats.bookmarks).put("experience", state.stats.experience).put("level", state.stats.level).put("progress", state.stats.progress))

    private fun JSONObject.toProfile(idFallback: String) = NativeProfile(
        id = optString("id").ifBlank { idFallback }, nickname = optString("nickname").ifBlank { "探索者" },
        bio = optString("bio"), avatar = optString("avatar_url").takeIf(String::isNotBlank),
        tier = optString("membership_tier", "free"), showBookmarks = optBoolean("show_bookmarks"),
    )

    private fun calculateStreak(dates: Set<String>): Int {
        var day = LocalDate.now()
        if (day.toString() !in dates) day = day.minusDays(1)
        var count = 0
        while (day.toString() in dates) { count++; day = day.minusDays(1) }
        return count
    }

    private data class ProfileLoadResult(
        val profile: NativeProfile, val posts: List<HeikaPost>, val bookmarks: List<HeikaPost>,
        val liked: List<HeikaPost>, val drafts: List<HeikaPost>, val stats: ProfileStats, val follow: JSONObject,
        val hasMoreWorks: Boolean = false, val hasMoreBookmarks: Boolean = false, val hasMoreLiked: Boolean = false,
    )
}
