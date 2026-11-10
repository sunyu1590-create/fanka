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
import kotlinx.coroutines.Job
import org.json.JSONObject

data class NotificationsUiState(
    val items: List<HeikaNotification> = emptyList(),
    val unread: Int = 0,
    val total: Int = 0,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val signedIn: Boolean = false,
    val accountId: String? = null,
)

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(NotificationsUiState())
    val state = mutableState.asStateFlow()
    private var loadJob: Job? = null
    private var loadAccountId: String? = null
    private var lastLoadedAccountId: String? = null
    private var lastLoadedAt = 0L
    private var requestGeneration = 0L

    fun load(force: Boolean = false): Job {
        val requestedAccountId = auth.restore()?.userId
        if (!force && loadJob?.isActive == true && loadAccountId == requestedAccountId) return loadJob!!
        val generation = ++requestGeneration
        val job = viewModelScope.launch {
            val session = auth.restore()
            if (session == null) {
                mutableState.value = NotificationsUiState(loading = false, signedIn = false)
                return@launch
            }
            val userId = session.userId
            if (mutableState.value.accountId != userId) mutableState.value = NotificationsUiState(accountId = userId, signedIn = true)
            if (mutableState.value.items.isEmpty()) {
                runCatching { repository.cachedNotifications(userId) }.getOrNull()?.let { cached ->
                    if (generation != requestGeneration) return@launch
                    mutableState.update { it.copy(
                        items = cached.optJSONArray("items").jsonObjects().map(HeikaNotification::from),
                        unread = cached.optInt("unread"), total = cached.optInt("total"), loading = false,
                    ) }
                }
            }
            if (!force && lastLoadedAccountId == userId && System.currentTimeMillis() - lastLoadedAt < 45_000L && mutableState.value.error == null) return@launch
            mutableState.update { it.copy(loading = it.items.isEmpty(), refreshing = it.items.isNotEmpty(), signedIn = true, accountId = userId, error = null) }
            runCatching { repository.loadNotifications() }
                .onSuccess { data ->
                    if (generation != requestGeneration || runCatching { auth.current()?.userId }.getOrNull() != userId || mutableState.value.accountId != userId) return@onSuccess
                    mutableState.update {
                        it.copy(
                            items = data.optJSONArray("items").jsonObjects().map(HeikaNotification::from),
                            unread = data.optInt("unread"), total = data.optInt("total"), loading = false, refreshing = false,
                        )
                    }
                    runCatching { repository.saveNotificationsCache(userId, data) }
                    lastLoadedAccountId = userId
                    lastLoadedAt = System.currentTimeMillis()
                }
                .onFailure { error -> if (generation == requestGeneration && mutableState.value.accountId == userId) mutableState.update { it.copy(loading = false, refreshing = false, error = error.message ?: "通知暂时无法加载") } }
        }
        loadJob = job
        loadAccountId = requestedAccountId
        job.invokeOnCompletion { if (loadJob == job) loadJob = null }
        return job
    }

    fun markAllRead() = viewModelScope.launch {
        val previous = mutableState.value
        mutableState.update { it.copy(unread = 0, items = it.items.map { row -> row.copy(readAt = row.readAt ?: "pending") }) }
        runCatching { repository.markNotification(all = true) }
            .onFailure { error -> mutableState.value = previous.copy(error = error.message ?: "已读状态更新失败") }
            .onSuccess { load(force = true) }
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
            .onSuccess { load(force = true) }
    }
}
