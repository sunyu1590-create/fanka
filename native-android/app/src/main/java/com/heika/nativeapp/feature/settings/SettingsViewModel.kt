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
    private val mutableCommentsEnabled = kotlinx.coroutines.flow.MutableStateFlow(true)
    val commentsEnabled = mutableCommentsEnabled.asStateFlow()
    private val mutableNotificationsLoading = kotlinx.coroutines.flow.MutableStateFlow(false)
    val notificationsLoading = mutableNotificationsLoading.asStateFlow()
    private val mutableCacheClearing = kotlinx.coroutines.flow.MutableStateFlow(false)
    val cacheClearing = mutableCacheClearing.asStateFlow()

    fun loadNotificationSettings() = viewModelScope.launch {
        if (auth.restore() == null) return@launch
        mutableNotificationsLoading.value = true
        runCatching { repository.notificationSettings() }
            .onSuccess { mutableCommentsEnabled.value = it.optBoolean("commentsEnabled", true) }
            .also { mutableNotificationsLoading.value = false }
    }

    fun setCommentsEnabled(value: Boolean) = viewModelScope.launch {
        if (auth.restore() == null) return@launch
        val previous = mutableCommentsEnabled.value
        mutableCommentsEnabled.value = value
        runCatching { repository.setCommentNotifications(value) }
            .onFailure { mutableCommentsEnabled.value = previous }
    }

    fun setTheme(value: String) = viewModelScope.launch { preferences.setTheme(value) }
    fun setCacheCapacity(value: Int) = viewModelScope.launch { imageCache.resize(value) }
    fun clearImageCache() = viewModelScope.launch {
        if (mutableCacheClearing.value) return@launch
        mutableCacheClearing.value = true
        try { imageCache.clear() } finally { mutableCacheClearing.value = false }
    }
    fun signOut(onDone: () -> Unit) = viewModelScope.launch {
        runCatching { auth.signOut() }
        onDone()
    }
}
