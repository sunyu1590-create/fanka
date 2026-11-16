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
    private val mutableChecking = MutableStateFlow(false)
    val checking = mutableChecking.asStateFlow()
    private val mutableManualMessage = MutableStateFlow<String?>(null)
    val manualMessage = mutableManualMessage.asStateFlow()
    private var started = false

    /** force 为 true 时由「关于」页手动触发：忽略「稍后提醒」记录，并回报已是最新的结果。 */
    fun checkForUpdate(force: Boolean = false) {
        if (!force && started) return
        started = true
        if (force) {
            mutableChecking.value = true
            mutableManualMessage.value = null
        }
        viewModelScope.launch {
            val payload = runCatching { repository.appVersion() }.getOrNull()
            if (force) mutableChecking.value = false
            if (payload == null) {
                if (force) mutableManualMessage.value = "检查更新失败，请检查网络后重试"
                return@launch
            }
            val code = payload.optInt("code")
            if (code <= BuildConfig.VERSION_CODE) {
                if (force) mutableManualMessage.value = "已是最新版本"
                return@launch
            }
            if (!force && runCatching { preferences.skippedUpdateCode() }.getOrDefault(0) == code) return@launch
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

    fun consumeManualMessage() { mutableManualMessage.value = null }

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
