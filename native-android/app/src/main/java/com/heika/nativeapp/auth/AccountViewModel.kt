package com.heika.nativeapp.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.util.WebSessionCleaner
import com.heika.nativeapp.feature.home.HomeUiState
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AccountUiState(
    val session: HeikaSession? = null,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
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
            auth.session.collect { mutableState.value = mutableState.value.copy(session = it, loading = false) }
        }
    }

    fun signIn(email: String, password: String) = viewModelScope.launch {
        mutableState.value = mutableState.value.copy(busy = true, error = null)
        runCatching { auth.signIn(email, password) }
            .onSuccess { mutableState.value = AccountUiState(session = it, loading = false) }
            .onFailure { mutableState.value = mutableState.value.copy(busy = false, error = it.message ?: "登录失败") }
    }

    fun signOut(onDone: () -> Unit) = viewModelScope.launch {
        val userId = auth.current()?.userId
        runCatching { auth.signOut() }
        WebSessionCleaner.clear()
        if (userId != null) repository.clearUserCache(userId)
        mutableState.value = AccountUiState(session = null, loading = false)
        onDone()
    }
}
