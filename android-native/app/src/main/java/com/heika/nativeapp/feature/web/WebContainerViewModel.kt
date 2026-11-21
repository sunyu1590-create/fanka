package com.heika.nativeapp.feature.web

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * 为网页容器准备登录态。
 *
 * 原生与网页共用同一个 Supabase 账号体系，但两者的会话存储不同：
 * 这里把当前会话通过 JS 接口交给网页，由网页调用 setSession 接上，
 * 令牌只走内存中的桥接调用，不拼进 URL，也不写进页面源码。
 */
@HiltViewModel
class WebContainerViewModel @Inject constructor(
    private val auth: AuthRepository,
) : ViewModel() {
    private val _session = MutableStateFlow<String?>(null)
    val session: StateFlow<String?> = _session

    init {
        viewModelScope.launch {
            val current = runCatching { auth.restore() }.getOrNull()
            _session.value = current?.let {
                JSONObject()
                    .put("access_token", it.accessToken)
                    .put("refresh_token", it.refreshToken)
                    .put("user_id", it.userId)
                    .toString()
            }
        }
    }
}
