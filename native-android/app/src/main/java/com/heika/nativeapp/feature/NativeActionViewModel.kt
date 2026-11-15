package com.heika.nativeapp.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject

data class NativeActionState(val loading: Boolean = false, val sending: Boolean = false, val membershipLoaded: Boolean = false, val tier: String = "free", val experience: Int = 0, val membershipData: JSONObject? = null, val redeemPreview: JSONObject? = null, val redeemResult: JSONObject? = null, val error: String? = null, val notice: String? = null)

@HiltViewModel
class NativeActionViewModel @Inject constructor(private val repository: HeikaRepository, private val auth: AuthRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(NativeActionState())
    val state = mutableState.asStateFlow()

    fun loadMembership() = viewModelScope.launch {
        if (runCatching { auth.current() }.getOrNull() == null) {
            mutableState.update { it.copy(loading = false, error = "登录后查看当前会员等级") }
            return@launch
        }
        mutableState.update { it.copy(loading = true, error = null) }
        runCatching { repository.membershipState() }.onSuccess { data ->
            mutableState.update { it.copy(loading = false, membershipLoaded = true, tier = data.optString("tier", "free"), experience = data.optInt("experience"), membershipData = data, error = null) }
        }.onFailure { error -> mutableState.update { it.copy(loading = false, membershipLoaded = false, error = error.message ?: "会员信息加载失败") } }
    }

    fun previewMembershipCode(code: String) = viewModelScope.launch {
        if (runCatching { auth.current() }.getOrNull() == null) { mutableState.update { it.copy(error = "请先登录后兑换会员激活码") }; return@launch }
        mutableState.update { it.copy(sending = true, error = null, notice = null, redeemPreview = null, redeemResult = null) }
        runCatching { repository.redeemMembership("preview", code.trim().uppercase()) }.onSuccess { data ->
            if (data.optString("status") != "valid" || data.optString("previewToken").isBlank()) {
                val reason = when (data.optString("status")) {
                    "already_redeemed" -> "此激活码已经兑换"
                    "disabled" -> "此激活码已停用"
                    "expired" -> "此激活码已过期"
                    "not_found" -> "没有找到此激活码，请检查输入"
                    "permanent_membership" -> "当前账号已有永久会员，无法兑换"
                    else -> "激活码暂时不可用，请核对卡密或稍后重试"
                }
                mutableState.update { it.copy(sending = false, redeemPreview = null, error = reason) }
            } else mutableState.update { it.copy(sending = false, redeemPreview = data, error = null) }
        }.onFailure { error -> mutableState.update { it.copy(sending = false, error = error.message ?: "激活码验证失败") } }
    }

    fun confirmMembershipCode(code: String) = viewModelScope.launch {
        val previewToken = mutableState.value.redeemPreview?.optString("previewToken").orEmpty()
        if (previewToken.isBlank()) { mutableState.update { it.copy(error = "请先重新验证激活码") }; return@launch }
        mutableState.update { it.copy(sending = true, error = null, notice = null) }
        runCatching { repository.redeemMembership("redeem", previewToken) }.onSuccess { result ->
            if (result.optString("status") != "redeemed") {
                val reason = when (result.optString("status")) {
                    "preview_expired" -> "兑换确认已过期，请重新验证激活码"
                    "already_redeemed" -> "此激活码已经兑换"
                    "disabled" -> "此激活码已停用"
                    "expired" -> "此激活码已过期"
                    "permanent_membership" -> "当前账号已有永久会员，无法兑换"
                    else -> "兑换未完成，请刷新会员状态后重试"
                }
                mutableState.update { it.copy(sending = false, error = reason) }
            } else {
                mutableState.update { it.copy(sending = false, redeemPreview = null, redeemResult = result, tier = result.optString("membershipTier", result.optString("tier", it.tier)), notice = "会员权益已激活", error = null) }
                loadMembership()
            }
        }.onFailure { error -> mutableState.update { it.copy(sending = false, error = error.message ?: "激活码兑换失败，可安全重试") } }
    }

    fun clearMembershipRedemption() = mutableState.update { it.copy(redeemPreview = null, redeemResult = null, error = null) }

    fun submitFeedback(category: String, message: String) = viewModelScope.launch {
        if (runCatching { auth.current() }.getOrNull() == null) {
            mutableState.update { it.copy(error = "请先登录后提交意见反馈") }
            return@launch
        }
        mutableState.update { it.copy(sending = true, error = null, notice = null) }
        runCatching { repository.submitFeedback(category, message.trim()) }
            .onSuccess { mutableState.update { it.copy(sending = false, notice = "反馈已提交，感谢你的建议。") } }
            .onFailure { error -> mutableState.update { it.copy(sending = false, error = error.message ?: "反馈提交失败") } }
    }
}
