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

data class NativeActionState(val loading: Boolean = false, val sending: Boolean = false, val tier: String = "free", val experience: Int = 0, val error: String? = null, val notice: String? = null)

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
        runCatching { repository.progression() }.onSuccess { data ->
            mutableState.update { it.copy(loading = false, tier = data.optString("membershipTier", "free"), experience = data.optInt("total"), error = null) }
        }.onFailure { error -> mutableState.update { it.copy(loading = false, error = error.message ?: "会员信息加载失败") } }
    }

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
