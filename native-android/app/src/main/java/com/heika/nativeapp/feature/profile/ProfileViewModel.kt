package com.heika.nativeapp.feature.profile

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

data class NativeProfile(
    val id: String,
    val nickname: String,
    val bio: String,
    val avatar: String?,
    val tier: String,
    val showBookmarks: Boolean,
)
data class ProfileState(
    val profile: NativeProfile? = null,
    val posts: List<HeikaPost> = emptyList(),
    val bookmarks: List<HeikaPost> = emptyList(),
    val drafts: List<HeikaPost> = emptyList(),
    val following: Boolean = false,
    val followerCount: Int = 0,
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val own: Boolean = false,
)

private data class ProfileLoadResult(
    val profile: NativeProfile,
    val posts: List<HeikaPost>,
    val bookmarks: List<HeikaPost>,
    val drafts: List<HeikaPost>,
    val follow: JSONObject,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(private val repository: HeikaRepository, private val auth: AuthRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(ProfileState())
    val state = mutableState.asStateFlow()
    private var loadedFor: String? = null

    init {
        viewModelScope.launch {
            auth.session.collect { session ->
                val current = mutableState.value
                if (current.own && loadedFor != session?.userId) {
                    loadedFor = null
                    if (session == null) {
                        mutableState.value = ProfileState(loading = false, error = "登录后查看个人主页")
                    } else {
                        load(null)
                    }
                }
            }
        }
    }

    fun load(requestedId: String?) = viewModelScope.launch {
        val session = runCatching { auth.current() }.getOrNull()
        if (requestedId == null && session == null) {
            mutableState.value = ProfileState(loading = false, error = "登录后查看个人主页")
            return@launch
        }
        val id = requestedId ?: session!!.userId
        if (loadedFor == id && !mutableState.value.loading) return@launch
        loadedFor = id
        mutableState.update { it.copy(loading = true, error = null, own = session?.userId == id) }
        runCatching {
            val data = if (session?.userId == id) repository.myProfile() else repository.profile(id)
            val profile = data.optJSONObject("profile") ?: data
            val model = NativeProfile(
                id = profile.optString("id", id), nickname = profile.optString("nickname").ifBlank { "探索者" },
                bio = profile.optString("bio"), avatar = profile.optString("avatar_url").takeIf(String::isNotBlank),
                tier = profile.optString("membership_tier", "free"), showBookmarks = profile.optBoolean("show_bookmarks"),
            )
            val postsData = if (session?.userId == id) repository.myLibrary("own") else data
            val owned = if (session?.userId == id) postsData.optJSONArray("items").jsonObjects().map(HeikaPost::from) else emptyList()
            val posts = if (session?.userId == id) owned.filter { JSONObject(it.rawJson).optString("status") == "published" } else data.optJSONArray("posts").jsonObjects().map(HeikaPost::from)
            val drafts = owned.filter { JSONObject(it.rawJson).optString("status") == "draft" }
            val bookmarks = if (session?.userId == id) repository.myLibrary("bookmarks").optJSONArray("items").jsonObjects().map(HeikaPost::from) else data.optJSONArray("bookmarks").jsonObjects().map(HeikaPost::from)
            val follow = if (session != null && session.userId != id) runCatching { repository.creatorFollowState(id) }.getOrDefault(JSONObject()) else JSONObject()
            ProfileLoadResult(model, posts, bookmarks, drafts, follow)
        }.onSuccess { (profile, posts, bookmarks, drafts, follow) -> mutableState.update { it.copy(profile = profile, posts = posts, bookmarks = bookmarks, drafts = drafts, following = follow.optBoolean("following"), followerCount = follow.optInt("followerCount"), loading = false, error = null) } }
            .onFailure { error -> mutableState.update { it.copy(loading = false, error = error.message ?: "个人主页加载失败") } }
    }

    fun updateProfile(nickname: String, bio: String) = viewModelScope.launch {
        val previous = mutableState.value.profile ?: return@launch
        mutableState.update { it.copy(saving = true, error = null, notice = null) }
        runCatching { repository.updateMyProfile(nickname.trim(), bio.trim()) }.onSuccess { result ->
            val updated = result.takeIf { it.has("id") } ?: JSONObject().put("id", previous.id).put("nickname", nickname.trim()).put("bio", bio.trim()).put("avatar_url", previous.avatar).put("membership_tier", previous.tier).put("show_bookmarks", previous.showBookmarks)
            mutableState.update { it.copy(profile = previous.copy(nickname = updated.optString("nickname", nickname.trim()), bio = updated.optString("bio", bio.trim()), avatar = updated.optString("avatar_url").takeIf(String::isNotBlank) ?: previous.avatar), saving = false, notice = "资料已保存") }
        }.onFailure { error -> mutableState.update { it.copy(saving = false, error = error.message ?: "资料保存失败") } }
    }

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
}
