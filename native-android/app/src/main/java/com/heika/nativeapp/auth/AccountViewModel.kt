package com.heika.nativeapp.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class AccountFlow { LOGIN, SIGN_UP, FORGOT, VERIFY_OTP, RECOVERY_CODE, RESET }

data class AccountUiState(
    val session: HeikaSession? = null,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val flow: AccountFlow = AccountFlow.LOGIN,
)

@HiltViewModel
class AccountViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val repository: HeikaRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(AccountUiState())
    val state = mutableState.asStateFlow()

    init {
        viewModelScope.launch {
            mutableState.value = AccountUiState(session = auth.restore(), loading = false)
            auth.session.collect { session -> mutableState.value = mutableState.value.copy(session = session, loading = false) }
        }
    }

    fun setFlow(flow: AccountFlow) = mutableState.update { it.copy(flow = flow, error = null, message = null) }

    fun signIn(email: String, password: String) = viewModelScope.launch {
        perform({ auth.signIn(email, password) }) { session ->
            mutableState.value = AccountUiState(session = session, loading = false, message = "登录成功")
        }
    }

    fun signUp(email: String, password: String, confirm: String, nickname: String) = viewModelScope.launch {
        if (password != confirm) return@launch showError("两次输入的密码不一致")
        perform({ auth.signUp(email, password, nickname) }) { signedIn ->
            mutableState.value = AccountUiState(
                session = if (signedIn) auth.current() else null,
                loading = false,
                flow = AccountFlow.LOGIN,
                message = if (signedIn) "账号已创建，欢迎来到黑卡。" else "确认邮件已发送。请先完成邮箱验证，再回来登录。",
            )
        }
    }

    fun requestOtp(email: String) = viewModelScope.launch {
        perform({ auth.requestPasswordOtp(email) }) {
            mutableState.update { it.copy(flow = AccountFlow.VERIFY_OTP, message = "如果该邮箱已注册，验证码已发送。") }
        }
    }

    fun verifyOtp(email: String, code: String) = viewModelScope.launch {
        perform({ auth.verifyPasswordOtp(email, code) }) { session ->
            mutableState.update { it.copy(session = session, flow = AccountFlow.RESET, message = "邮箱验证成功，请设置新密码。") }
        }
    }

    fun updatePassword(password: String, confirm: String) = viewModelScope.launch {
        if (password != confirm) return@launch showError("两次输入的密码不一致")
        perform({ auth.updatePassword(password) }) {
            mutableState.value = AccountUiState(session = null, loading = false, flow = AccountFlow.LOGIN, message = "密码已更新，请使用新密码登录。")
        }
    }

    fun recoverWithCode(email: String, code: String, password: String, confirm: String) = viewModelScope.launch {
        if (password != confirm) return@launch showError("两次输入的密码不一致")
        perform({ auth.recoverWithCode(email, code, password) }) {
            mutableState.value = AccountUiState(session = null, loading = false, flow = AccountFlow.LOGIN, message = "密码已更新，请使用新密码登录。")
        }
    }

    fun signOut(onDone: () -> Unit) = viewModelScope.launch {
        val userId = auth.current()?.userId
        runCatching { auth.signOut() }
        if (userId != null) repository.clearUserCache(userId)
        mutableState.value = AccountUiState(session = null, loading = false)
        onDone()
    }

    private suspend fun <T> perform(action: suspend () -> T, onSuccess: suspend (T) -> Unit) {
        mutableState.update { it.copy(busy = true, error = null, message = null) }
        try {
            onSuccess(action())
            mutableState.update { it.copy(busy = false) }
        } catch (error: Exception) {
            mutableState.update { it.copy(busy = false, error = error.message ?: "操作失败，请重试") }
        }
    }

    private fun showError(message: String) = mutableState.update { it.copy(error = message, message = null) }
}
