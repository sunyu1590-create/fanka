package com.heika.nativeapp.ui

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.DecorConfig
import com.heika.nativeapp.data.DecorRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
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

    fun invalidate() = repository.invalidate()

    fun resetAfterSignOut() {
        viewModelScope.launch { repository.reset() }
    }
}
