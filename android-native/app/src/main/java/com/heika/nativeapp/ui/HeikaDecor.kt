package com.heika.nativeapp.ui

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.DecorConfig
import com.heika.nativeapp.data.DecorRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

/**
 * 当前生效的装扮。原生各处只读这个值，不各自维护一份，
 * 保证底栏、卡片与网页端看到的是同一套配置。
 */
val LocalDecor = staticCompositionLocalOf { DecorConfig.DEFAULT }

@HiltViewModel
class DecorViewModel @Inject constructor(
    private val repository: DecorRepository,
) : ViewModel() {
    val config: StateFlow<DecorConfig> = repository.config
    val lastError: StateFlow<String?> = repository.lastError

    /** 网页保存装扮后，原生完成刷新渲染即发一次版本号，供网页宣告「APP 已应用」。 */
    private val _appliedTick = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val appliedTick: SharedFlow<String> = _appliedTick.asSharedFlow()

    fun start() {
        viewModelScope.launch {
            repository.restore()
            repository.refresh(force = true)
        }
    }

    /** 回到前台时调用：只有账号里的装扮变了才会触发重组。 */
    fun refresh() {
        viewModelScope.launch { repository.refresh(force = false) }
    }

    /**
     * 网页在 APP 内保存装扮后的强制同步（4.2）：
     * 失效缓存 → 重新拉取 → 渲染完成后把配置版本回执给网页。
     * 失败时 DecorRepository 保留上一套可用装扮，网页侧会显示「APP 待同步」。
     */
    fun syncFromWeb() {
        viewModelScope.launch {
            repository.invalidate()
            val ok = repository.refresh(force = true)
            if (ok) {
                val version = repository.config.value.syncVersion.ifEmpty { System.currentTimeMillis().toString() }
                _appliedTick.tryEmit(version)
            }
        }
    }

    fun invalidate() = repository.invalidate()

    fun resetAfterSignOut() {
        viewModelScope.launch { repository.reset() }
    }
}
