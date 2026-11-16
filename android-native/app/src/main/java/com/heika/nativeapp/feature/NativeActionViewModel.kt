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
import org.json.JSONArray
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
        // 经验值单独存放在进度接口，会员接口只返回权益快照，两者需要一起拉取。
        val progression = runCatching { repository.progression() }.getOrDefault(JSONObject())
        runCatching { repository.membershipState() }.onSuccess { data ->
            val snapshot = normalizeMembership(data, progression.optInt("total"))
            mutableState.update {
                it.copy(
                    loading = false,
                    membershipLoaded = true,
                    tier = snapshot.optString("tier", "free"),
                    experience = snapshot.optInt("experience"),
                    membershipData = snapshot,
                    error = null,
                )
            }
        }.onFailure { error -> mutableState.update { it.copy(loading = false, membershipLoaded = false, error = error.message ?: "会员信息加载失败") } }
    }

    /**
     * 会员接口把快照放在 membership 子对象里，套餐字段用 snake_case，界面按扁平字段渲染。
     * 这里统一成界面需要的形状，避免逐处兜底判断。
     */
    private fun normalizeMembership(raw: JSONObject, experience: Int): JSONObject {
        val membership = raw.optJSONObject("membership") ?: JSONObject()
        val allowance = membership.optInt("dailyFlipAllowance", raw.optInt("dailyFlipAllowance", 5))
        val used = membership.optInt("dailyFlipsUsed", raw.optInt("dailyFlipsUsed"))
        val expiry = membership.optString("expiresAt").takeIf { it.isNotBlank() && it != "null" }
        val plans = JSONArray()
        val rows = raw.optJSONArray("plans") ?: JSONArray()
        for (index in 0 until rows.length()) {
            val row = rows.optJSONObject(index) ?: continue
            val tier = row.optString("tier")
            if (tier.isBlank()) continue
            plans.put(JSONObject().apply {
                put("tier", tier)
                put("display_name", row.optString("name", tier.uppercase()))
                put("daily_flips", row.optInt("daily_flip_allowance", row.optInt("dailyFlips", 5)))
                put("support_price_cents", row.optInt("price_cents", row.optInt("priceCents")))
                put("duration_days", row.optInt("duration_days", row.optInt("durationDays", 30)))
                put("benefits", row.optJSONArray("benefits") ?: JSONArray())
            })
        }
        return JSONObject().apply {
            put("tier", membership.optString("tier", raw.optString("tier", "free")).ifBlank { "free" })
            put("experience", experience)
            put("dailyAllowance", allowance)
            put("remaining", (allowance - used).coerceAtLeast(0))
            put("expiresAt", expiry ?: JSONObject.NULL)
            put("plans", plans)
        }
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
