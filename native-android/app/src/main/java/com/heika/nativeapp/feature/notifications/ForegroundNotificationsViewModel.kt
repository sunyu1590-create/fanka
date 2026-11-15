package com.heika.nativeapp.feature.notifications

import androidx.lifecycle.ViewModel
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaNotification
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

/** Foreground-only sync for the existing in-app notification API. It is not a push transport. */
data class ForegroundNotificationsState(val queue: List<HeikaNotification> = emptyList()) {
    val current: HeikaNotification? get() = queue.firstOrNull()
}

@HiltViewModel
class ForegroundNotificationsViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(ForegroundNotificationsState())
    val state = mutableState.asStateFlow()
    private val pollMutex = Mutex()
    private val seenIds = linkedSetOf<String>()
    private var accountId: String? = null
    private var initializedForAccount = false

    suspend fun pollForeground() = pollMutex.withLock {
        val user = runCatching { auth.restore()?.userId }.getOrNull()
        if (user != accountId) {
            accountId = user
            initializedForAccount = false
            seenIds.clear()
            mutableState.value = ForegroundNotificationsState()
        }
        if (user == null) return@withLock

        val response = runCatching { repository.loadNotifications() }.getOrNull() ?: return@withLock
        val activeUser = runCatching { auth.restore()?.userId }.getOrNull()
        if (activeUser != user) {
            accountId = activeUser
            initializedForAccount = false
            seenIds.clear()
            mutableState.value = ForegroundNotificationsState()
            return@withLock
        }
        val items = response.optJSONArray("items").jsonObjects()
            .map(HeikaNotification::from)
            .filter { it.id.isNotBlank() }
        if (!initializedForAccount) {
            seenIds.addAll(items.map(HeikaNotification::id))
            initializedForAccount = true
            return@withLock
        }

        val newUnread = items.filter { it.readAt == null && it.id !in seenIds }
        seenIds.addAll(items.map(HeikaNotification::id))
        if (newUnread.isNotEmpty()) {
            mutableState.update { current ->
                val queuedIds = current.queue.mapTo(mutableSetOf(), HeikaNotification::id)
                current.copy(queue = (current.queue + newUnread.filterNot { it.id in queuedIds }).take(8))
            }
        }
    }

    fun dismiss(id: String) {
        mutableState.update { current -> current.copy(queue = current.queue.filterNot { it.id == id }) }
    }

    fun markReadAndDismiss(id: String) {
        dismiss(id)
        viewModelScope.launch { runCatching { repository.markNotification(id = id) } }
    }
}
