package com.heika.nativeapp.auth

import com.heika.nativeapp.ui.HeikaCoroutineGuard
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AccountFlow { LOGIN, SIGN_UP, RECOVERY_CODE }

data class AccountUiState(
    val session: HeikaSession? = null,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val flow: AccountFlow = AccountFlow.LOGIN,
    val verificationId: String? = null,
    val verificationEmail: String? = null,
    /** 新注册后生成的一次性恢复码。非空时页面必须先展示它，不能直接进入主界面。 */
    val pendingRecoveryCodes: List<String> = emptyList(),
)

@HiltViewModel
class AccountViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val repository: HeikaRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(AccountUiState())
    val state = mutableState.asStateFlow()

    init {
        viewModelScope.launch(HeikaCoroutineGuard) {
            mutableState.value = AccountUiState(session = auth.restore(), loading = false)
            auth.session.collect { session -> mutableState.value = mutableState.value.copy(session = session, loading = false) }
        }
    }

    fun setFlow(flow: AccountFlow) = mutableState.update {
        it.copy(flow = flow, error = null, message = null, verificationId = null, verificationEmail = null)
    }

    fun signIn(email: String, password: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        // 连点两次会并发发出两个登录请求：第一个成功、第二个用同一口令拿到 400，
        // 后到的失败把界面改成"密码不正确"，用户看到的就是"明明对了却报错"。
        if (mutableState.value.busy) return@launch
        if (email.isBlank() || password.isEmpty()) return@launch showError("请输入邮箱和密码")
        perform({ auth.signIn(email, password) }) { session ->
            mutableState.update { it.copy(session = session, loading = false, busy = false, error = null, message = "登录成功") }
        }
    }

    fun signUp(email: String, password: String, confirm: String, nickname: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        if (password != confirm) return@launch showError("两次输入的密码不一致")
        if (password.length < 8) return@launch showError("密码至少需要 8 位")
        if (nickname.trim().length < 2) return@launch showError("昵称至少需要 2 个字")
        // 当前后端注册不需要邮箱验证码，直接建号并登录。
        perform({ auth.signUpWithPasswordFallback(email, password, nickname) }) { session ->
            // 注册成功立刻生成恢复码：目前找回密码只有这一种方式，
            // 让用户"稍后去设置里生成"等于大概率永远不会生成。
            val codes = runCatching { repository.generateRecoveryCodes() }.getOrDefault(emptyList())
            mutableState.value = AccountUiState(
                session = session,
                loading = false,
                message = if (codes.isEmpty()) "账号已创建，欢迎来到黑卡。" else null,
                pendingRecoveryCodes = codes,
            )
        }
    }

    /** 用户确认已保存恢复码后，放行进入主界面。 */
    fun acknowledgeRecoveryCodes() = mutableState.update {
        if (it.pendingRecoveryCodes.isEmpty()) it
        else it.copy(pendingRecoveryCodes = emptyList(), message = "账号已创建，欢迎来到黑卡。")
    }

    fun requestSignUpCode(email: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        mutableState.update { it.copy(busy = true, error = null, message = null) }
        try {
            val id = auth.requestSignUpCode(email)
            mutableState.update {
                it.copy(
                    busy = false,
                    verificationId = id,
                    verificationEmail = email.trim(),
                    message = "验证码已发送到邮箱，请查收。",
                )
            }
        } catch (error: Exception) {
            mutableState.update { it.copy(busy = false, error = error.message ?: "验证码发送失败，请稍后重试。") }
        }
    }

    fun signUpWithCode(email: String, password: String, confirm: String, nickname: String, code: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        if (password != confirm) return@launch showError("两次输入的密码不一致")
        if (code.isBlank()) return@launch showError("请输入邮箱验证码。")
        val current = mutableState.value
        val verificationId = current.verificationId
            ?.takeIf { current.verificationEmail.equals(email.trim(), ignoreCase = true) }
            ?: return@launch showError("请先获取邮箱验证码。")
        perform({ auth.signUpWithCode(email, password, nickname, code, verificationId) }) { session ->
            val codes = runCatching { repository.generateRecoveryCodes() }.getOrDefault(emptyList())
            mutableState.value = AccountUiState(
                session = session,
                loading = false,
                message = if (codes.isEmpty()) "账号已创建，欢迎来到黑卡。" else null,
                pendingRecoveryCodes = codes,
            )
        }
    }

    fun recoverWithCode(email: String, code: String, password: String, confirm: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        if (password != confirm) return@launch showError("两次输入的密码不一致")
        perform({ auth.recoverWithCode(email, code, password) }) {
            mutableState.value = AccountUiState(session = null, loading = false, flow = AccountFlow.LOGIN, message = "密码已更新，请使用新密码登录。")
        }
    }

    fun signOut(onDone: () -> Unit) = viewModelScope.launch(HeikaCoroutineGuard) {
        val userId = auth.current()?.userId
        runCatching { auth.signOut() }
        if (userId != null) runCatching { repository.clearUserCache(userId) }
        mutableState.value = AccountUiState(session = null, loading = false)
        onDone()
    }

    private suspend fun <T> perform(action: suspend () -> T, onSuccess: suspend (T) -> Unit) {
        mutableState.update { it.copy(busy = true, error = null, message = null) }
        try {
            onSuccess(action())
            mutableState.update { it.copy(busy = false) }
        } catch (error: Exception) {
            val message = error.message?.takeIf { it.isNotBlank() } ?: when (error) {
                is java.net.SocketTimeoutException -> "网络超时，请稍后重试"
                is java.io.IOException -> "网络不稳定，请检查网络后重试"
                else -> "操作失败，请重试"
            }
            mutableState.update { it.copy(busy = false, error = message) }
        }
    }

    private fun showError(message: String) = mutableState.update { it.copy(error = message, message = null) }
}
