package com.heika.nativeapp.feature.messages

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

data class NativePeer(val id: String, val name: String, val avatar: String?, val bio: String)
data class NativeConversation(val id: String, val peer: NativePeer, val latest: String, val unread: Int, val createdAt: String)
data class NativeMessage(val id: String, val conversationId: String, val senderId: String, val body: String, val createdAt: String)
data class PendingMessage(val nonce: String, val conversationId: String, val body: String, val failed: Boolean = false)
data class MessagesState(
    val conversations: List<NativeConversation> = emptyList(),
    val messages: List<NativeMessage> = emptyList(),
    val pendingMessages: List<PendingMessage> = emptyList(),
    val historyHasMore: Boolean = false,
    val loadingHistory: Boolean = false,
    val people: List<NativePeer> = emptyList(),
    val activeId: String? = null,
    val activePeer: NativePeer? = null,
    val userId: String? = null,
    val currentUserAvatarUrl: String? = null,
    val query: String = "",
    val searchingPeople: Boolean = false,
    val draft: String = "",
    val loading: Boolean = true,
    val sending: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class MessagesViewModel @Inject constructor(private val repository: HeikaRepository, private val auth: AuthRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(MessagesState())
    val state = mutableState.asStateFlow()
    private var searchJob: Job? = null
    private var openingPeerId: String? = null
    private var authInitialized = false
    private var observedUserId: String? = null
    private var pollingJob: Job? = null
    private val sendMutex = kotlinx.coroutines.sync.Mutex()
    private val inboxMutex = Mutex()
    private val conversationMutex = Mutex()
    private var conversationGeneration = 0L
    private var retryReadFor: String? = null
    private var avatarLookupAttemptedFor: String? = null

    init {
        viewModelScope.launch {
            auth.session.collect { session ->
                if (!authInitialized) return@collect
                val currentUserId = mutableState.value.userId
                if (currentUserId != session?.userId && observedUserId != session?.userId) {
                    pollingJob?.cancel()
                    conversationGeneration++
                    retryReadFor = null
                    observedUserId = session?.userId
                    avatarLookupAttemptedFor = null
                    mutableState.value = MessagesState(loading = session != null, userId = session?.userId, error = if (session == null) "登录后查看私信" else null)
                    if (session != null) load()
                }
            }
        }
    }

    fun load(initialConversation: String? = null) = viewModelScope.launch {
        val session = runCatching { auth.current() }.getOrNull()
        if (!authInitialized) {
            authInitialized = true
            observedUserId = session?.userId
        }
        if (session == null) {
            mutableState.value = MessagesState(loading = false, error = "登录后查看私信")
            return@launch
        }
        if (!inboxMutex.tryLock()) return@launch
        val requestUser = session.userId
        try {
            if (mutableState.value.userId != requestUser) {
                conversationGeneration++
                mutableState.value = MessagesState(userId = requestUser, loading = true)
            }
            if (avatarLookupAttemptedFor != requestUser) {
                avatarLookupAttemptedFor = requestUser
                viewModelScope.launch {
                    runCatching { repository.myProfile() }.onSuccess { data ->
                        val profile = data.optJSONObject("profile") ?: data
                        val avatar = profile.optString("avatar_url").takeIf(String::isNotBlank)
                        if (runCatching { auth.current()?.userId }.getOrNull() == requestUser) {
                            mutableState.update { if (it.userId == requestUser) it.copy(currentUserAvatarUrl = avatar) else it }
                        }
                    }
                }
            }
            if (mutableState.value.conversations.isEmpty()) {
                val cached = runCatching { repository.cachedInbox(requestUser) }.getOrNull()
                if (cached != null && mutableState.value.userId == requestUser) {
                    mutableState.update { it.copy(conversations = parseInbox(cached), loading = false) }
                }
            }
            mutableState.update { it.copy(userId = requestUser, loading = it.conversations.isEmpty(), error = null) }
            runCatching { repository.inbox() }
                .onSuccess { data ->
                    if (runCatching { auth.current()?.userId }.getOrNull() != requestUser) return@onSuccess
                    val items = parseInbox(data)
                    mutableState.update { it.copy(conversations = items, loading = false, error = null) }
                    runCatching { repository.saveInboxCache(requestUser, data) }
                    if (!initialConversation.isNullOrBlank() && mutableState.value.activeId != initialConversation) {
                        val existing = items.firstOrNull { it.id == initialConversation }
                        conversationGeneration++
                        mutableState.update { it.copy(activeId = initialConversation, activePeer = existing?.peer) }
                        loadConversation(initialConversation)
                    }
                }
                .onFailure { error ->
                    if (runCatching { auth.current()?.userId }.getOrNull() == requestUser) {
                        mutableState.update { it.copy(loading = false, error = error.message ?: "消息列表加载失败") }
                    }
                }
        } finally {
            inboxMutex.unlock()
        }
    }

    fun refreshActive() = viewModelScope.launch {
        val id = mutableState.value.activeId ?: return@launch
        loadConversation(id)
    }

    fun startForegroundSync() {
        if (pollingJob?.isActive == true) return
        pollingJob = viewModelScope.launch {
            while (true) {
                val active = mutableState.value.activeId
                if (active == null) load() else refreshActive()
                delay(if (active == null) 20_000 else 12_000)
            }
        }
    }

    fun stopForegroundSync() { pollingJob?.cancel(); pollingJob = null }

    private suspend fun loadConversation(id: String) {
        if (!conversationMutex.tryLock()) return
        val requestGeneration = conversationGeneration
        val requestUserId = mutableState.value.userId
        try {
        runCatching { repository.conversation(id) }.onSuccess { data ->
            if (requestGeneration != conversationGeneration || mutableState.value.activeId != id || mutableState.value.userId != requestUserId) return@onSuccess
            val rows = data.optJSONArray("items").jsonObjects().map { row ->
                NativeMessage(row.optString("id"), row.optString("conversation_id"), row.optString("sender_id"), row.optString("body"), row.optString("created_at"))
            }
            val existingIds = mutableState.value.messages.asSequence().filter { it.conversationId == id }.map { it.id }.toSet()
            val userId = requestUserId
            val receivedNewMessage = rows.any { it.senderId != userId && it.id !in existingIds }
            mutableState.update { state ->
                if (state.activeId != id) return@update state
                val messages = if (state.activeId == id) (state.messages + rows).distinctBy { it.id }.sortedBy { it.createdAt } else rows
                state.copy(messages = messages, historyHasMore = data.optBoolean("has_more"), loadingHistory = false, error = null)
            }
            if (receivedNewMessage || retryReadFor == id) {
                runCatching { repository.markConversationRead(id) }
                    .onSuccess {
                        retryReadFor = null
                        mutableState.update { state ->
                            if (state.activeId != id) state else state.copy(conversations = state.conversations.map { row -> if (row.id == id) row.copy(unread = 0) else row })
                        }
                    }
                    .onFailure { retryReadFor = id }
            }
        }.onFailure { error ->
            if (requestGeneration == conversationGeneration && mutableState.value.activeId == id) {
                mutableState.update { it.copy(error = error.message ?: "会话加载失败") }
            }
        }
        } finally {
            conversationMutex.unlock()
            val active = mutableState.value.activeId
            if (requestGeneration != conversationGeneration && active != null) loadConversation(active)
        }
    }

    fun loadOlderMessages() = viewModelScope.launch {
        val current = mutableState.value
        val id = current.activeId ?: return@launch
        val before = current.messages.firstOrNull()?.createdAt ?: return@launch
        if (!current.historyHasMore || current.loadingHistory) return@launch
        mutableState.update { it.copy(loadingHistory = true) }
        runCatching { repository.conversation(id, before) }.onSuccess { data ->
            val older = data.optJSONArray("items").jsonObjects().map { row ->
                NativeMessage(row.optString("id"), row.optString("conversation_id"), row.optString("sender_id"), row.optString("body"), row.optString("created_at"))
            }
            mutableState.update { state ->
                if (state.activeId != id) state else state.copy(messages = (older + state.messages).distinctBy { it.id }.sortedBy { it.createdAt }, historyHasMore = data.optBoolean("has_more"), loadingHistory = false)
            }
        }.onFailure { error -> mutableState.update { it.copy(loadingHistory = false, error = error.message ?: "更早消息加载失败") } }
    }

    fun search(query: String) {
        mutableState.update { it.copy(query = query.take(60), people = emptyList(), error = null, searchingPeople = query.trim().length >= 2) }
        searchJob?.cancel()
        if (query.trim().length < 2) { mutableState.update { it.copy(people = emptyList(), searchingPeople = false) }; return }
        val requested = query.trim().take(60)
        searchJob = viewModelScope.launch {
            delay(250)
            runCatching { repository.searchPeople(requested) }.onSuccess { data ->
                if (mutableState.value.query.trim() != requested) return@onSuccess
                val people = data.optJSONArray("items").jsonObjects().map(::parsePeer)
                mutableState.update { it.copy(people = people, searchingPeople = false) }
            }.onFailure { error -> if (mutableState.value.query.trim() == requested) mutableState.update { it.copy(searchingPeople = false, error = error.message ?: "用户搜索失败") } }
        }
    }

    fun setQuery(query: String) = mutableState.update { it.copy(query = query.take(60), people = emptyList(), searchingPeople = false, error = null) }

    fun openPeer(peer: NativePeer) = viewModelScope.launch {
        if (openingPeerId == peer.id || mutableState.value.activePeer?.id == peer.id) return@launch
        openingPeerId = peer.id
        try {
            mutableState.update { it.copy(loading = true, error = null) }
            val result = runCatching { repository.openConversation(peer.id) }
            result.onSuccess { data ->
                val id = data.optString("conversation_id")
                if (id.isBlank()) mutableState.update { it.copy(loading = false, error = "会话未创建") }
                else {
                    mutableState.update { it.copy(activeId = id, activePeer = peer, messages = emptyList(), loading = false) }
                    conversationGeneration++
                    loadConversation(id)
                    load()
                }
            }.onFailure { error -> mutableState.update { it.copy(loading = false, error = error.message ?: "无法打开会话") } }
        } finally {
            openingPeerId = null
        }
    }

    fun startWithPeer(userId: String) = viewModelScope.launch {
        if (userId.isBlank()) return@launch
        runCatching { repository.profile(userId) }.onSuccess { data ->
            val peer = parsePeer(data.optJSONObject("profile") ?: JSONObject())
            if (peer.id.isNotBlank()) openPeer(peer) else mutableState.update { it.copy(error = "用户不存在") }
        }.onFailure { error -> mutableState.update { it.copy(loading = false, error = error.message ?: "无法打开用户资料") } }
    }

    fun openConversation(item: NativeConversation) = viewModelScope.launch {
        conversationGeneration++
        retryReadFor = null
        mutableState.update { it.copy(activeId = item.id, activePeer = item.peer, messages = emptyList(), loading = true, error = null) }
        loadConversation(item.id)
    }

    fun closeConversation() {
        conversationGeneration++
        retryReadFor = null
        mutableState.update { it.copy(activeId = null, activePeer = null, messages = emptyList(), draft = "") }
    }
    fun setDraft(value: String) = mutableState.update { it.copy(draft = value.take(2000)) }

    fun send() = viewModelScope.launch {
        val current = mutableState.value
        val id = current.activeId ?: return@launch
        val text = current.draft.trim()
        if (text.isEmpty() || current.sending) return@launch
        sendWithNonce(id, text, UUID.randomUUID().toString())
    }

    fun retryMessage(nonce: String) = viewModelScope.launch {
        val item = mutableState.value.pendingMessages.firstOrNull { it.nonce == nonce && it.failed } ?: return@launch
        sendWithNonce(item.conversationId, item.body, item.nonce)
    }

    private suspend fun sendWithNonce(id: String, text: String, nonce: String) = sendMutex.withLock {
        val owner = mutableState.value.userId ?: return@withLock
        mutableState.update { it.copy(sending = true, error = null, pendingMessages = (it.pendingMessages.filterNot { p -> p.nonce == nonce } + PendingMessage(nonce, id, text))) }
        val result = runCatching { repository.sendMessage(id, text, nonce) }
        if (runCatching { auth.current()?.userId }.getOrNull() != owner || mutableState.value.activeId != id) return@withLock
        result.onSuccess {
            mutableState.update { s -> s.copy(draft = if (s.draft.trim() == text) "" else s.draft, sending = false, pendingMessages = s.pendingMessages.filterNot { p -> p.nonce == nonce }) }
            loadConversation(id); load()
        }.onFailure { error ->
            mutableState.update { s -> s.copy(sending = false, pendingMessages = s.pendingMessages.map { p -> if (p.nonce == nonce) p.copy(failed = true) else p }, error = error.message ?: "发送失败，可重试") }
        }
    }

    private fun parsePeer(json: JSONObject) = NativePeer(json.optString("id"), json.optString("nickname").ifBlank { "探索者" }, json.optString("avatar_url").takeIf(String::isNotBlank), json.optString("bio"))

    private fun parseInbox(data: JSONObject): List<NativeConversation> = data.optJSONArray("items").jsonObjects().map { row ->
        val peer = parsePeer(row.optJSONObject("peer") ?: JSONObject())
        NativeConversation(row.optString("conversation_id"), peer, row.optString("latest_body"), row.optInt("unread"), row.optString("created_at"))
    }
}
