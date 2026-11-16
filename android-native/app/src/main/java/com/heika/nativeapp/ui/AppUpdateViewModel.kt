package com.heika.nativeapp.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.data.HeikaRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AppUpdate(
    val version: String,
    val code: Int,
    val notes: List<String>,
    val sizeBytes: Long,
    val pageUrl: String,
)

/**
 * 启动时向服务端确认是否有新版本。只有服务端版本号高于当前安装包时才提示，
 * 用户选择「稍后」会记住该版本，避免每次打开都弹。
 */
@HiltViewModel
class AppUpdateViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val preferences: NativePreferences,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val mutableUpdate = MutableStateFlow<AppUpdate?>(null)
    val update = mutableUpdate.asStateFlow()
    private var started = false

    fun checkForUpdate() {
        if (started) return
        started = true
        viewModelScope.launch {
            val payload = runCatching { repository.appVersion() }.getOrNull() ?: return@launch
            val code = payload.optInt("code")
            if (code <= BuildConfig.VERSION_CODE) return@launch
            if (runCatching { preferences.skippedUpdateCode() }.getOrDefault(0) == code) return@launch
            val notes = payload.optJSONArray("notes")?.let { array ->
                (0 until array.length()).mapNotNull { index -> array.optString(index).takeIf(String::isNotBlank) }
            } ?: emptyList()
            mutableUpdate.value = AppUpdate(
                version = payload.optString("version").ifBlank { "新版本" },
                code = code,
                notes = notes,
                sizeBytes = payload.optLong("size"),
                pageUrl = payload.optString("page").ifBlank { "https://moonclean.shop/download" },
            )
        }
    }

    fun openDownloadPage() {
        val target = mutableUpdate.value?.pageUrl ?: "https://moonclean.shop/download"
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        mutableUpdate.value = null
    }

    fun snooze() {
        val current = mutableUpdate.value ?: return
        mutableUpdate.value = null
        viewModelScope.launch { runCatching { preferences.markUpdateSkipped(current.code) } }
    }
}
