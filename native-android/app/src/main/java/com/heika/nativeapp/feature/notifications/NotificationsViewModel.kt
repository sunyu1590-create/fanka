package com.heika.nativeapp.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaNotification
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject

data class NotificationsUiState(
    val items: List<HeikaNotification> = emptyList(),
    val unread: Int = 0,
    val total: Int = 0,
    val loading: Boolean = true,
    val error: String? = null,
    val signedIn: Boolean = false,
)

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(NotificationsUiState())
    val state = mutableState.asStateFlow()

    fun load() = viewModelScope.launch {
        val signedIn = auth.restore() != null
        mutableState.update { it.copy(loading = true, signedIn = signedIn, error = null) }
        if (!signedIn) {
            mutableState.update { it.copy(loading = false, signedIn = false, items = emptyList(), unread = 0, total = 0) }
            return@launch
        }
        runCatching { repository.loadNotifications() }
            .onSuccess { data ->
                mutableState.update {
                    it.copy(
                        items = data.optJSONArray("items").jsonObjects().map(HeikaNotification::from),
                        unread = data.optInt("unread"), total = data.optInt("total"), loading = false,
                    )
                }
            }
            .onFailure { error -> mutableState.update { it.copy(loading = false, error = error.message ?: "通知暂时无法加载") } }
    }

    fun markAllRead() = viewModelScope.launch {
        val previous = mutableState.value
        mutableState.update { it.copy(unread = 0, items = it.items.map { row -> row.copy(readAt = row.readAt ?: "pending") }) }
        runCatching { repository.markNotification(all = true) }
            .onFailure { error -> mutableState.value = previous.copy(error = error.message ?: "已读状态更新失败") }
            .onSuccess { load() }
    }

    fun markRead(id: String) = viewModelScope.launch {
        val previous = mutableState.value
        mutableState.update {
            it.copy(
                unread = (it.unread - if (it.items.any { row -> row.id == id && row.readAt == null }) 1 else 0).coerceAtLeast(0),
                items = it.items.map { row -> if (row.id == id) row.copy(readAt = "pending") else row },
            )
        }
        runCatching { repository.markNotification(id = id) }
            .onFailure { error -> mutableState.value = previous.copy(error = error.message ?: "已读状态更新失败") }
            .onSuccess { load() }
    }
}
