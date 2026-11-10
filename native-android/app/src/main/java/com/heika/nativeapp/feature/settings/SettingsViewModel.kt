package com.heika.nativeapp.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.ui.HeikaImageCache
import com.heika.nativeapp.ui.NativePreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val preferences: NativePreferences,
    private val imageCache: HeikaImageCache,
    private val auth: AuthRepository,
    private val repository: HeikaRepository,
) : ViewModel() {
    val theme = preferences.theme.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "dark")
    val imageCacheMb = preferences.imageCacheMb.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 256)
    val feedLayout = preferences.feedLayout.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "waterfall")
    val readingMode = preferences.readingMode.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "standard")
    private val mutableCommentsEnabled = kotlinx.coroutines.flow.MutableStateFlow<Boolean?>(null)
    val commentsEnabled = mutableCommentsEnabled.asStateFlow()
    private val mutableNotificationsLoading = kotlinx.coroutines.flow.MutableStateFlow(false)
    val notificationsLoading = mutableNotificationsLoading.asStateFlow()
    private val mutableNotificationError = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)
    val notificationError = mutableNotificationError.asStateFlow()
    private val mutableCacheClearing = kotlinx.coroutines.flow.MutableStateFlow(false)
    val cacheClearing = mutableCacheClearing.asStateFlow()
    private val mutableCacheBytes = kotlinx.coroutines.flow.MutableStateFlow(0L)
    val cacheBytes = mutableCacheBytes.asStateFlow()
    private val mutableMessage = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)
    val message = mutableMessage.asStateFlow()
    private val mutableBookmarksVisible = kotlinx.coroutines.flow.MutableStateFlow<Boolean?>(null)
    val bookmarksVisible = mutableBookmarksVisible.asStateFlow()
    private val mutablePrivacyLoading = kotlinx.coroutines.flow.MutableStateFlow(false)
    val privacyLoading = mutablePrivacyLoading.asStateFlow()
    private val mutablePrivacyError = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)
    val privacyError = mutablePrivacyError.asStateFlow()
    private var activeUserId: String? = null
    private var notificationSettingsLoadedFor: String? = null
    private var privacySettingsLoadedFor: String? = null
    private var notificationRequestGeneration = 0L
    private var privacyRequestGeneration = 0L
    private var notificationRequestUserId: String? = null
    private var privacyRequestUserId: String? = null

    init {
        viewModelScope.launch {
            auth.session.collect { session ->
                if (session?.userId != activeUserId) {
                    activeUserId = session?.userId
                    notificationSettingsLoadedFor = null
                    privacySettingsLoadedFor = null
                    notificationRequestGeneration++
                    privacyRequestGeneration++
                    notificationRequestUserId = null
                    privacyRequestUserId = null
                    mutableNotificationsLoading.value = false
                    mutablePrivacyLoading.value = false
                    mutableCommentsEnabled.value = null
                    mutableBookmarksVisible.value = null
                    mutableNotificationError.value = null
                    mutablePrivacyError.value = null
                }
            }
        }
    }

    fun loadNotificationSettings(force: Boolean = false) = viewModelScope.launch {
        val userId = auth.restore()?.userId
        if (userId == null) { mutableNotificationError.value = "登录后同步站内通知偏好"; return@launch }
        if (!force && notificationSettingsLoadedFor == userId && mutableCommentsEnabled.value != null) return@launch
        if (mutableNotificationsLoading.value && notificationRequestUserId == userId) return@launch
        val requestId = ++notificationRequestGeneration
        notificationRequestUserId = userId
        mutableNotificationsLoading.value = true
        try {
            val settings = repository.notificationSettings()
            if (requestId == notificationRequestGeneration && auth.current()?.userId == userId) {
                mutableCommentsEnabled.value = settings.optBoolean("commentsEnabled", true)
                notificationSettingsLoadedFor = userId
                mutableNotificationError.value = null
            }
        } catch (error: Exception) {
            if (requestId == notificationRequestGeneration && auth.current()?.userId == userId) {
                mutableNotificationError.value = error.message ?: "通知偏好读取失败"
            }
        } finally {
            if (requestId == notificationRequestGeneration) {
                notificationRequestUserId = null
                mutableNotificationsLoading.value = false
            }
        }
    }

    fun loadPrivacySettings(force: Boolean = false) = viewModelScope.launch {
        val userId = auth.restore()?.userId
        if (userId == null) { mutablePrivacyError.value = "登录后管理账号隐私偏好"; return@launch }
        if (!force && privacySettingsLoadedFor == userId && mutableBookmarksVisible.value != null) return@launch
        if (mutablePrivacyLoading.value && privacyRequestUserId == userId) return@launch
        val requestId = ++privacyRequestGeneration
        privacyRequestUserId = userId
        mutablePrivacyLoading.value = true
        val cached = runCatching { repository.cachedMyProfile(userId) }.getOrNull()
        if (requestId == privacyRequestGeneration && auth.current()?.userId == userId) cached?.let { data ->
            val profile = data.optJSONObject("profile") ?: data
            mutableBookmarksVisible.value = profile.optBoolean("show_bookmarks")
        }
        try {
            val data = repository.myProfile()
            if (requestId == privacyRequestGeneration && auth.current()?.userId == userId) {
                mutableBookmarksVisible.value = (data.optJSONObject("profile") ?: data).optBoolean("show_bookmarks")
                privacySettingsLoadedFor = userId
                mutablePrivacyError.value = null
            }
        } catch (error: Exception) {
            if (requestId == privacyRequestGeneration && auth.current()?.userId == userId) {
                mutablePrivacyError.value = error.message ?: "隐私偏好读取失败"
            }
        } finally {
            if (requestId == privacyRequestGeneration) {
                privacyRequestUserId = null
                mutablePrivacyLoading.value = false
            }
        }
    }

    fun setBookmarksVisible(value: Boolean) = viewModelScope.launch {
        if (auth.restore() == null) { mutablePrivacyError.value = "登录后管理账号隐私偏好"; return@launch }
        val previous = mutableBookmarksVisible.value ?: return@launch
        mutableBookmarksVisible.value = value
        runCatching { repository.updateBookmarksVisibility(value) }
            .onSuccess { result ->
                mutableBookmarksVisible.value = (result.optJSONObject("profile") ?: result).optBoolean("show_bookmarks", value)
                mutablePrivacyError.value = null
                auth.current()?.userId?.let { id ->
                    runCatching { repository.cachedMyProfile(id) }.getOrNull()?.let { cached ->
                        val profile = cached.optJSONObject("profile") ?: return@let
                        profile.put("show_bookmarks", value)
                        repository.saveMyProfileCache(id, cached)
                    }
                }
            }
            .onFailure { mutableBookmarksVisible.value = previous; mutablePrivacyError.value = it.message ?: "隐私偏好保存失败" }
    }

    fun setCommentsEnabled(value: Boolean) = viewModelScope.launch {
        if (auth.restore() == null) { mutableNotificationError.value = "登录后同步站内通知偏好"; return@launch }
        val previous = mutableCommentsEnabled.value ?: return@launch
        mutableCommentsEnabled.value = value
        runCatching { repository.setCommentNotifications(value) }
            .onFailure { mutableCommentsEnabled.value = previous; mutableNotificationError.value = it.message ?: "通知偏好保存失败" }
    }

    fun setTheme(value: String) = viewModelScope.launch { preferences.setTheme(value) }
    fun setFeedLayout(value: String) = viewModelScope.launch { preferences.setFeedLayout(value) }
    fun setReadingMode(value: String) = viewModelScope.launch { preferences.setReadingMode(value) }
    fun setCacheCapacity(value: Int) = viewModelScope.launch { imageCache.resize(value) }
    fun refreshCacheUsage() = viewModelScope.launch { mutableCacheBytes.value = imageCache.sizeBytes() }
    fun clearImageCache() = viewModelScope.launch {
        if (mutableCacheClearing.value) return@launch
        mutableCacheClearing.value = true
        try { imageCache.clear(); mutableCacheBytes.value = imageCache.sizeBytes(); mutableMessage.value = "已清理可重新下载的图片缓存" }
        catch (error: Exception) { mutableMessage.value = error.message ?: "缓存清理失败" }
        finally { mutableCacheClearing.value = false }
    }
    fun signOut(onDone: () -> Unit) = viewModelScope.launch {
        runCatching { auth.signOut() }
        onDone()
    }
}
