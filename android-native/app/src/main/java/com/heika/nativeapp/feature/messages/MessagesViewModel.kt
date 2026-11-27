package com.heika.nativeapp.feature.messages

import com.heika.nativeapp.ui.HeikaCoroutineGuard
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.feature.profile.NativeBadge
import com.heika.nativeapp.data.jsonObjects
import com.heika.nativeapp.ui.NativePreferences
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

data class NativePeer(val id: String, val name: String, val avatar: String?, val bio: String, val badges: List<NativeBadge> = emptyList())

data class NativeConversation(
    val id: String,
    val peer: NativePeer,
    val latest: String,
    val unread: Int,
    val createdAt: String,
    val pinned: Boolean = false,
    val pinnedAt: String? = null,
    val muted: Boolean = false,
    val manualUnread: Boolean = false,
    val latestType: String = "text",
    val latestSafety: String? = null,
)

data class MessageReaction(val emoji: String, val count: Int, val mine: Boolean)

data class NativeMessage(
    val id: String,
    val conversationId: String,
    val senderId: String,
    val body: String,
    val createdAt: String,
    val messageType: String = "text",
    val mediaPath: String? = null,
    val replyTo: String? = null,
    val editedAt: String? = null,
    val editCount: Int = 0,
    val recalled: Boolean = false,
    val safetyFlag: String? = null,
    val metadata: JSONObject? = null,
    val reactions: List<MessageReaction> = emptyList(),
)

data class PendingMessage(
    val nonce: String,
    val conversationId: String,
    val body: String,
    val failed: Boolean = false,
    val replyTo: String? = null,
    val kind: String = "text",
)

data class ChatSettings(
    val pinned: Boolean = false,
    val pinnedAt: String? = null,
    val muted: Boolean = false,
    val archived: Boolean = false,
    val manualUnread: Boolean = false,
    val keepArchived: Boolean = false,
    val theme: String? = null,
    val backgroundPath: String? = null,
    val bubbleColor: String? = null,
    val fontScale: Float = 1f,
)

data class ChatSearchHit(
    val id: String,
    val conversationId: String,
    val senderId: String,
    val body: String,
    val createdAt: String,
    val messageType: String,
    val mediaPath: String?,
    val safetyFlag: String?,
    val peerName: String,
    val peerAvatar: String?,
)

data class ChatMediaItem(
    val id: String,
    val senderId: String,
    val body: String,
    val createdAt: String,
    val messageType: String,
    val mediaPath: String?,
    val metadata: JSONObject?,
    val url: String?,
)

data class ChatRequest(
    val id: String,
    val senderId: String,
    val recipientId: String,
    val body: String,
    val mediaPath: String?,
    val safetyFlag: String?,
    val status: String,
    val createdAt: String,
    val peer: NativePeer,
)

data class ChatFavorite(
    val messageId: String,
    val favoritedAt: String,
    val message: NativeMessage?,
    val peerId: String?,
    val unavailable: Boolean,
)

data class ChatPrivacy(
    val dmPermission: String = "everyone",
    val readReceipt: Boolean = true,
    val typingIndicator: Boolean = true,
    val onlineVisibility: String = "everyone",
)

/** 聊天装扮：主题、气泡色与字号，按账号保存在 DataStore。 */
data class ChatDecoration(
    val theme: String = "graphite",
    val bubble: String = "default",
    val scale: Float = 1f,
) {
    companion object {
        val THEMES = listOf("graphite", "paper", "ocean", "twilight")
        val THEME_NAMES = mapOf(
            "graphite" to "石墨黑", "paper" to "纸质白", "ocean" to "深海蓝", "twilight" to "暮光紫",
        )
        val BUBBLES = listOf("default", "amber", "teal", "violet")
        val BUBBLE_NAMES = mapOf(
            "default" to "默认", "amber" to "琥珀", "teal" to "青灰", "violet" to "暮紫",
        )
        val SCALES = listOf(0.9f, 1f, 1.1f, 1.2f)
        fun normalizeTheme(value: String?) = value?.takeIf { it in THEMES } ?: "graphite"
        fun normalizeBubble(value: String?) = value?.takeIf { it in BUBBLES } ?: "default"
        fun normalizeScale(value: Float) = value.takeIf { it in SCALES } ?: 1f
    }
}

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
    // Chat 2.0
    val activeSettings: ChatSettings? = null,
    val replyTo: NativeMessage? = null,
    val editing: NativeMessage? = null,
    val multiSelect: Boolean = false,
    val selectedIds: Set<String> = emptySet(),
    val favoriteIds: Set<String> = emptySet(),
    val decoration: ChatDecoration = ChatDecoration(),
    val searchResults: List<ChatSearchHit> = emptyList(),
    val searchingMessages: Boolean = false,
    val mediaItems: List<ChatMediaItem> = emptyList(),
    val mediaKind: String = "all",
    val loadingMedia: Boolean = false,
    val requestsReceived: List<ChatRequest> = emptyList(),
    val requestsSent: List<ChatRequest> = emptyList(),
    val pendingRequestCount: Int = 0,
    val loadingRequests: Boolean = false,
    val favorites: List<ChatFavorite> = emptyList(),
    val loadingFavorites: Boolean = false,
    val privacy: ChatPrivacy? = null,
    val loadingPrivacy: Boolean = false,
)

@HiltViewModel
class MessagesViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
    private val preferences: NativePreferences,
) : ViewModel() {
    private val mutableState = MutableStateFlow(MessagesState())
    val state = mutableState.asStateFlow()
    private var searchJob: Job? = null
    private var openingPeerId: String? = null
    private var authInitialized = false
    private var observedUserId: String? = null
    private var pollingJob: Job? = null
    private val sendMutex = Mutex()
    private val inboxMutex = Mutex()
    private val conversationMutex = Mutex()
    private var conversationGeneration = 0L
    @Volatile private var pendingConversationId: String? = null
    private var retryReadFor: String? = null
    private var avatarLookupAttemptedFor: String? = null
    private var decorLoadedFor: String? = null
    private var requestsCheckedFor: String? = null

    init {
        viewModelScope.launch(HeikaCoroutineGuard) {
            auth.session.collect { session ->
                if (!authInitialized) return@collect
                val currentUserId = mutableState.value.userId
                if (currentUserId != session?.userId && observedUserId != session?.userId) {
                    // Account switch: drop all account-scoped cache before loading the new one.
                    currentUserId?.let { previous -> runCatching { repository.clearUserCache(previous) } }
                    pollingJob?.cancel()
                    conversationGeneration++
                    retryReadFor = null
                    observedUserId = session?.userId
                    avatarLookupAttemptedFor = null
                    decorLoadedFor = null
                    requestsCheckedFor = null
                    mutableState.value = MessagesState(loading = session != null, userId = session?.userId, error = if (session == null) "登录后查看私信" else null)
                    if (session != null) {
                        loadDecoration(session.userId)
                        load()
                    }
                }
            }
        }
    }

    fun load(initialConversation: String? = null) = viewModelScope.launch(HeikaCoroutineGuard) {
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
            if (decorLoadedFor != requestUser) loadDecoration(requestUser)
            if (avatarLookupAttemptedFor != requestUser) {
                avatarLookupAttemptedFor = requestUser
                viewModelScope.launch(HeikaCoroutineGuard) {
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
                    if (requestsCheckedFor != requestUser) {
                        requestsCheckedFor = requestUser
                        loadRequests()
                    }
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

    fun refreshActive() = viewModelScope.launch(HeikaCoroutineGuard) {
        val id = mutableState.value.activeId ?: return@launch
        loadConversation(id)
        loadActiveSettings(id)
    }

    fun startForegroundSync() {
        if (pollingJob?.isActive == true) return
        pollingJob = viewModelScope.launch(HeikaCoroutineGuard) {
            while (true) {
                val active = mutableState.value.activeId
                if (active == null) load() else refreshActive()
                delay(if (active == null) 20_000 else 12_000)
            }
        }
    }

    fun stopForegroundSync() { pollingJob?.cancel(); pollingJob = null }

    private suspend fun loadConversation(id: String) {
        // 慢网络下会话请求会排队，这里用循环而不是递归重试，
        // 避免 generation 连续变化时堆栈无限增长导致崩溃。
        var target: String? = id
        var hops = 0
        while (target != null && hops < 3) {
            hops++
            target = loadConversationOnce(target)
        }
    }

    private suspend fun loadConversationOnce(id: String): String? {
        if (!conversationMutex.tryLock()) { pendingConversationId = id; return null }
        val requestGeneration = conversationGeneration
        val requestUserId = mutableState.value.userId
        try {
            // Cold start: show the account-isolated cache first, then reconcile with the server.
            if (mutableState.value.messages.none { it.conversationId == id } && requestUserId != null) {
                val cached = runCatching { repository.cachedConversation(requestUserId, id) }.getOrNull()
                if (cached != null && requestGeneration == conversationGeneration && mutableState.value.activeId == id) {
                    val cachedRows = parseMessages(cached)
                    mutableState.update { state ->
                        if (state.activeId != id || state.messages.any { it.conversationId == id }) state
                        else state.copy(messages = cachedRows.sortedBy { it.createdAt }, loading = false)
                    }
                }
            }
            runCatching { repository.conversation(id) }.onSuccess { data ->
                if (requestGeneration != conversationGeneration || mutableState.value.activeId != id || mutableState.value.userId != requestUserId) return@onSuccess
                saveConversationCache(requestUserId, id, data)
                val rows = parseMessages(data)
                val existingIds = mutableState.value.messages.asSequence().filter { it.conversationId == id }.map { it.id }.toSet()
                val userId = requestUserId
                val receivedNewMessage = rows.any { it.senderId != userId && it.id !in existingIds }
                mutableState.update { state ->
                    if (state.activeId != id) return@update state
                    val messages = (state.messages + rows).distinctBy { it.id }.sortedBy { it.createdAt }
                    state.copy(messages = messages, historyHasMore = data.optBoolean("has_more"), loadingHistory = false, loading = false, error = null)
                }
                loadReactions(id)
                if (receivedNewMessage || retryReadFor == id) {
                    runCatching { repository.markConversationRead(id) }
                        .onSuccess {
                            retryReadFor = null
                            mutableState.update { state ->
                                if (state.activeId != id) state else state.copy(conversations = state.conversations.map { row ->
                                    if (row.id == id) row.copy(unread = 0, manualUnread = false) else row
                                })
                            }
                        }
                    .onFailure { retryReadFor = id }
                }
            }.onFailure { error ->
                if (requestGeneration == conversationGeneration && mutableState.value.activeId == id) {
                    mutableState.update { it.copy(loading = false, error = error.message ?: "会话加载失败") }
                }
            }
        } finally {
            conversationMutex.unlock()
        }
        val pending = pendingConversationId
        pendingConversationId = null
        val active = mutableState.value.activeId
        return when {
            pending != null && pending == active -> pending
            requestGeneration != conversationGeneration && active != null -> active
            else -> null
        }
    }

    private fun saveConversationCache(userId: String?, id: String, data: JSONObject) {
        if (userId.isNullOrBlank()) return
        viewModelScope.launch(HeikaCoroutineGuard) { runCatching { repository.saveConversationCache(userId, id, data) } }
    }

    fun loadOlderMessages() = viewModelScope.launch(HeikaCoroutineGuard) {
        val current = mutableState.value
        val id = current.activeId ?: return@launch
        val before = current.messages.firstOrNull()?.createdAt ?: return@launch
        if (!current.historyHasMore || current.loadingHistory) return@launch
        mutableState.update { it.copy(loadingHistory = true) }
        runCatching { repository.conversation(id, before) }.onSuccess { data ->
            val older = parseMessages(data)
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
        searchJob = viewModelScope.launch(HeikaCoroutineGuard) {
            delay(250)
            runCatching { repository.searchPeople(requested) }.onSuccess { data ->
                if (mutableState.value.query.trim() != requested) return@onSuccess
                val people = data.optJSONArray("items").jsonObjects().map(::parsePeer).filter { it.id.isNotBlank() }.distinctBy { it.id }
                mutableState.update { it.copy(people = people, searchingPeople = false) }
            }.onFailure { error -> if (mutableState.value.query.trim() == requested) mutableState.update { it.copy(searchingPeople = false, error = error.message ?: "用户搜索失败") } }
        }
    }

    fun setQuery(query: String) = mutableState.update { it.copy(query = query.take(60), people = emptyList(), searchingPeople = false, error = null) }

    fun openPeer(peer: NativePeer) = viewModelScope.launch(HeikaCoroutineGuard) {
        if (openingPeerId == peer.id || mutableState.value.activePeer?.id == peer.id) return@launch
        openingPeerId = peer.id
        try {
            mutableState.update { it.copy(loading = true, error = null) }
            val result = runCatching { repository.openConversation(peer.id) }
            result.onSuccess { data ->
                val id = data.optString("conversation_id")
                if (id.isBlank()) mutableState.update { it.copy(loading = false, error = "会话未创建") }
                else {
                    mutableState.update { it.copy(activeId = id, activePeer = peer, messages = emptyList(), loading = false, replyTo = null) }
                    conversationGeneration++
                    loadConversation(id)
                    loadActiveSettings(id)
                    load()
                }
            }.onFailure { error -> mutableState.update { it.copy(loading = false, error = error.message ?: "无法打开会话") } }
        } finally {
            openingPeerId = null
        }
    }

    fun startWithPeer(userId: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        if (userId.isBlank()) return@launch
        runCatching { repository.profile(userId) }.onSuccess { data ->
            val peer = parsePeer(data.optJSONObject("profile") ?: JSONObject())
            if (peer.id.isNotBlank()) openPeer(peer) else mutableState.update { it.copy(error = "用户不存在") }
        }.onFailure { error -> mutableState.update { it.copy(loading = false, error = error.message ?: "无法打开用户资料") } }
    }

    fun openConversation(item: NativeConversation) = openConversationInternal(item.id, item.peer)

    fun openConversationById(id: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        if (id.isBlank()) return@launch
        val item = mutableState.value.conversations.firstOrNull { it.id == id }
        if (item != null) {
            openConversationInternal(id, item.peer)
        } else {
            runCatching { repository.inbox() }.onSuccess { data ->
                parseInbox(data).firstOrNull { it.id == id }?.let { openConversationInternal(id, it.peer) }
                    ?: mutableState.update { it.copy(error = "会话不存在或已归档") }
            }.onFailure { error -> mutableState.update { it.copy(error = error.message ?: "会话打开失败") } }
        }
    }

    private fun openConversationInternal(id: String, peer: NativePeer?) = viewModelScope.launch(HeikaCoroutineGuard) {
        conversationGeneration++
        retryReadFor = null
        mutableState.update {
            it.copy(
                activeId = id, activePeer = peer, messages = emptyList(), loading = true, error = null,
                replyTo = null, editing = null, multiSelect = false, selectedIds = emptySet(),
            )
        }
        loadConversation(id)
        loadActiveSettings(id)
    }

    fun closeConversation() {
        conversationGeneration++
        retryReadFor = null
        mutableState.update {
            it.copy(activeId = null, activePeer = null, messages = emptyList(), draft = "",
                replyTo = null, editing = null, multiSelect = false, selectedIds = emptySet())
        }
    }
    fun setDraft(value: String) = mutableState.update { it.copy(draft = value.take(2000)) }
    fun setReplyTo(message: NativeMessage?) = mutableState.update { it.copy(replyTo = message) }

    fun send() = viewModelScope.launch(HeikaCoroutineGuard) {
        val current = mutableState.value
        val id = current.activeId ?: return@launch
        val text = current.draft.trim()
        if (text.isEmpty() || current.sending) return@launch
        sendWithNonce(id, text, UUID.randomUUID().toString(), current.replyTo?.id, "text")
    }

    fun retryMessage(nonce: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        val item = mutableState.value.pendingMessages.firstOrNull { it.nonce == nonce && it.failed } ?: return@launch
        // Same nonce => server-side idempotent replay; never mint a new id on retry.
        sendWithNonce(item.conversationId, item.body, item.nonce, item.replyTo, item.kind)
    }

    /**
     * 撤回自己发出的消息：双方同时消失，只允许发送后 3 分钟内操作。
     * 先本地移除让气泡立刻消失，失败再整段回滚，避免长按后没有任何反馈。
     */
    fun recallMessage(messageId: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        val current = mutableState.value
        val conversationId = current.activeId ?: return@launch
        val target = current.messages.firstOrNull { it.id == messageId } ?: return@launch
        if (current.userId != null && target.senderId != current.userId) {
            mutableState.update { it.copy(error = "只能撤回自己发送的消息") }
            return@launch
        }
        if (recallRemainingSeconds(target.createdAt) <= 0) {
            mutableState.update { it.copy(error = "超过 3 分钟，这条消息已经无法撤回") }
            return@launch
        }
        val snapshot = current.messages
        mutableState.update {
            it.copy(messages = it.messages.filterNot { m -> m.id == messageId },
                favoriteIds = it.favoriteIds - messageId, replyTo = if (it.replyTo?.id == messageId) null else it.replyTo,
                editing = if (it.editing?.id == messageId) null else it.editing, error = null)
        }
        runCatching { repository.recallMessage(conversationId, messageId) }
            .onFailure { error ->
                mutableState.update {
                    if (it.activeId == conversationId) it.copy(messages = snapshot, error = error.message ?: "撤回失败，请重试") else it
                }
            }
    }

    private suspend fun sendWithNonce(id: String, text: String, nonce: String, replyTo: String?, kind: String) = sendMutex.withLock {
        val owner = mutableState.value.userId ?: return@withLock
        mutableState.update {
            it.copy(
                sending = true, error = null,
                pendingMessages = (it.pendingMessages.filterNot { p -> p.nonce == nonce } +
                    PendingMessage(nonce, id, text, replyTo = replyTo, kind = kind)),
            )
        }
        val result = runCatching { repository.sendMessage2(id, text, nonce, kind, replyTo) }
        if (runCatching { auth.current()?.userId }.getOrNull() != owner || mutableState.value.activeId != id) return@withLock
        result.onSuccess {
            mutableState.update { s ->
                s.copy(draft = if (s.draft.trim() == text) "" else s.draft, sending = false,
                    replyTo = null, pendingMessages = s.pendingMessages.filterNot { p -> p.nonce == nonce })
            }
            loadConversation(id); load()
        }.onFailure { error ->
            mutableState.update { s ->
                s.copy(sending = false, pendingMessages = s.pendingMessages.map { p ->
                    if (p.nonce == nonce) p.copy(failed = true) else p
                }, error = error.message ?: "发送失败，可长按重试")
            }
        }
    }

    // -----------------------------------------------------------------
    // Settings / conversation actions
    // -----------------------------------------------------------------

    private fun roomId(explicit: String?): String? =
        explicit?.takeIf(String::isNotBlank) ?: mutableState.value.activeId

    fun loadActiveSettings(id: String? = null) = viewModelScope.launch(HeikaCoroutineGuard) {
        val room = roomId(id) ?: return@launch
        val userId = mutableState.value.userId ?: return@launch
        val cached = runCatching { repository.cachedChatSettings(userId, room) }.getOrNull()
        if (cached != null) {
            mutableState.update { it.copy(activeSettings = parseSettings(cached)) }
        }
        runCatching { repository.chatSettings(room) }.onSuccess { data ->
            runCatching { repository.saveChatSettingsCache(userId, room, data) }
            mutableState.update { state ->
                if (state.activeId != room) state else state.copy(activeSettings = parseSettings(data))
            }
            refreshConversationFlags(room, data)
        }.onFailure { error ->
            mutableState.update { it.copy(error = error.message ?: "会话设置加载失败") }
        }
    }

    private fun refreshConversationFlags(room: String, settings: JSONObject) {
        val pinned = settings.optBoolean("pinned")
        val muted = settings.optBoolean("muted")
        val manualUnread = settings.optBoolean("manual_unread")
        mutableState.update { state ->
            state.copy(conversations = state.conversations.map { row ->
                if (row.id == room) row.copy(pinned = pinned, muted = muted, manualUnread = manualUnread) else row
            })
        }
    }

    fun togglePin(id: String? = null) = viewModelScope.launch(HeikaCoroutineGuard) {
        changeSetting(id, "pinned", !(mutableState.value.activeSettings?.pinned ?: roomConversation(id)?.pinned ?: false))
    }

    fun setMuted(id: String? = null, muted: Boolean) = viewModelScope.launch(HeikaCoroutineGuard) {
        changeSetting(id, "muted", muted)
    }

    fun setArchived(id: String? = null, archived: Boolean) = viewModelScope.launch(HeikaCoroutineGuard) {
        val room = roomId(id) ?: return@launch
        runCatching { repository.updateChatSettings(room, JSONObject().put("archived", archived)) }
            .onSuccess {
                mutableState.update { state ->
                    val remaining = state.conversations.filterNot { it.id == room }
                    if (state.activeId == room) state.copy(conversations = remaining, activeId = null, activePeer = null, messages = emptyList(), activeSettings = null)
                    else state.copy(conversations = remaining)
                }
                load()
            }
            .onFailure { error -> mutableState.update { it.copy(error = error.message ?: "归档失败，请重试") } }
    }

    fun markUnread(id: String? = null, unread: Boolean) = viewModelScope.launch(HeikaCoroutineGuard) {
        val room = roomId(id) ?: return@launch
        runCatching { repository.markConversationUnread(room, unread) }
            .onSuccess {
                mutableState.update { state ->
                    state.copy(
                        conversations = state.conversations.map { row -> if (row.id == room) row.copy(manualUnread = unread) else row },
                        activeSettings = if (state.activeId == room) (state.activeSettings ?: ChatSettings()).copy(manualUnread = unread) else state.activeSettings,
                    )
                }
                load()
            }
            .onFailure { error -> mutableState.update { it.copy(error = error.message ?: "标记失败，请重试") } }
    }

    private fun roomConversation(id: String?): NativeConversation? {
        val room = roomId(id) ?: return null
        return mutableState.value.conversations.firstOrNull { it.id == room }
    }

    private suspend fun changeSetting(id: String?, key: String, value: Boolean) {
        val room = roomId(id) ?: return
        val payload = JSONObject().put(key, value)
        runCatching { repository.updateChatSettings(room, payload) }
            .onSuccess { data ->
                mutableState.update { state ->
                    state.copy(
                        activeSettings = if (state.activeId == room) (state.activeSettings ?: ChatSettings()).copy(
                            pinned = if (key == "pinned") value else (state.activeSettings?.pinned ?: false),
                            muted = if (key == "muted") value else (state.activeSettings?.muted ?: false),
                            manualUnread = if (key == "manual_unread") value else (state.activeSettings?.manualUnread ?: false),
                        ) else state.activeSettings,
                        conversations = state.conversations.map { row ->
                            if (row.id == room) row.copy(
                                pinned = if (key == "pinned") value else row.pinned,
                                muted = if (key == "muted") value else row.muted,
                                manualUnread = if (key == "manual_unread") value else row.manualUnread,
                                pinnedAt = if (key == "pinned" && !value) null else row.pinnedAt,
                            ) else row
                        }.let { rows ->
                            if (key == "pinned") rows.sortedWith(
                                compareByDescending<NativeConversation> { it.pinned }
                                    .thenByDescending { it.pinnedAt ?: "" }
                                    .thenByDescending { it.createdAt },
                            ) else rows
                        },
                    )
                }
                load()
            }
            .onFailure { error -> mutableState.update { it.copy(error = error.message ?: "设置保存失败，请重试") } }
    }

    // -----------------------------------------------------------------
    // Message actions
    // -----------------------------------------------------------------

    fun startEdit(message: NativeMessage) = mutableState.update {
        if (message.senderId != it.userId || message.recalled || message.messageType != "text") it
        else it.copy(editing = message, replyTo = null)
    }

    fun cancelEdit() = mutableState.update { it.copy(editing = null) }

    fun submitEdit(content: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        val current = mutableState.value
        val target = current.editing ?: return@launch
        val room = current.activeId ?: return@launch
        val text = content.trim()
        if (text.isBlank()) {
            mutableState.update { it.copy(error = "消息内容不能为空") }
            return@launch
        }
        runCatching { repository.editMessage(room, target.id, text, target.editCount) }
            .onSuccess { data ->
                val updated = parseMessage(data)
                mutableState.update { state ->
                    state.copy(
                        editing = null, error = null,
                        messages = state.messages.map { m ->
                            if (m.id != target.id) m else updated?.copy(reactions = m.reactions)
                                ?: m.copy(body = text, editedAt = data.optString("edited_at"), editCount = target.editCount + 1)
                        },
                    )
                }
            }
            .onFailure { error -> mutableState.update { it.copy(error = error.message ?: "编辑失败，请重试") } }
    }

    fun reactMessage(messageId: String, emoji: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        val room = mutableState.value.activeId ?: return@launch
        runCatching { repository.reactMessage(room, messageId, emoji) }
            .onSuccess { loadReactions(room) }
            .onFailure { error -> mutableState.update { it.copy(error = error.message ?: "回应失败，请重试") } }
    }

    private fun loadReactions(room: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        runCatching { repository.chatReactions(room) }.onSuccess { data ->
            val mine = data.optString("mine")
            val grouped = data.optJSONArray("items").jsonObjects()
                .groupBy { it.optString("message_id") }
                .mapValues { (_, rows) ->
                    rows.groupBy { row -> row.optString("emoji") }.map { (emoji, entries) ->
                        MessageReaction(emoji, entries.size, entries.any { it.optString("user_id") == mine })
                    }
                }
            mutableState.update { state ->
                if (state.activeId != room) state else state.copy(messages = state.messages.map { m ->
                    if (m.reactions == grouped[m.id].orEmpty()) m else m.copy(reactions = grouped[m.id].orEmpty())
                })
            }
        }
    }

    fun favoriteMessage(messageId: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        val room = mutableState.value.activeId ?: return@launch
        runCatching { repository.favoriteMessage(room, messageId) }
            .onSuccess { data ->
                val active = data.optBoolean("favorite")
                mutableState.update { state ->
                    val next = if (active) state.favoriteIds + messageId else state.favoriteIds - messageId
                    state.copy(favoriteIds = next)
                }
            }
            .onFailure { error -> mutableState.update { it.copy(error = error.message ?: "收藏失败，请重试") } }
    }

    /** 举报具体私信消息：保留消息上下文，走既有 dm_reports 管理流程。 */
    fun reportMessage(messageId: String, reason: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        val room = mutableState.value.activeId ?: return@launch
        if (reason.trim().length < 3) {
            mutableState.update { it.copy(error = "举报原因至少需要 3 个字") }
            return@launch
        }
        runCatching {
            repository.messageAction(
                JSONObject().put("action", "report_message").put("conversation", room)
                    .put("message", messageId).put("reason", reason.trim())
            )
        }.onSuccess {
            mutableState.update { it.copy(error = "举报已提交，等待管理员处理") }
        }.onFailure { error ->
            mutableState.update { it.copy(error = error.message ?: "举报失败，请重试") }
        }
    }

    fun toggleMultiSelect() = mutableState.update {
        it.copy(multiSelect = !it.multiSelect, selectedIds = emptySet(), replyTo = null, editing = null)
    }

    fun toggleMessageSelection(messageId: String) = mutableState.update { state ->
        val next = if (messageId in state.selectedIds) state.selectedIds - messageId else state.selectedIds + messageId
        state.copy(selectedIds = next)
    }

    fun forwardMessages(targetConversationId: String, sourceIds: List<String>? = null) = viewModelScope.launch(HeikaCoroutineGuard) {
        val current = mutableState.value
        val ids = sourceIds?.takeIf(List<String>::isNotEmpty) ?: if (current.selectedIds.isNotEmpty()) current.selectedIds.toList()
            else current.replyTo?.id?.let { listOf(it) }.orEmpty()
        if (ids.isEmpty() || targetConversationId.isBlank()) return@launch
        var failures = 0
        ids.forEach { id ->
            runCatching { repository.forwardMessage(targetConversationId, id, UUID.randomUUID().toString()) }
                .onFailure { failures++ }
        }
        mutableState.update {
            it.copy(multiSelect = false, selectedIds = emptySet(), replyTo = null,
                error = if (failures > 0) "$failures 条消息转发失败" else null)
        }
        load(); loadConversation(targetConversationId)
    }

    fun favoriteSelected() = viewModelScope.launch(HeikaCoroutineGuard) {
        val current = mutableState.value
        val room = current.activeId ?: return@launch
        val ids = current.selectedIds.toList()
        if (ids.isEmpty()) return@launch
        ids.forEach { id -> runCatching { repository.favoriteMessage(room, id) } }
        mutableState.update { it.copy(multiSelect = false, selectedIds = emptySet()) }
        loadFavorites()
    }

    // -----------------------------------------------------------------
    // Secondary views: search / media / requests / favorites / privacy
    // -----------------------------------------------------------------

    fun searchMessages(query: String, conversationId: String? = null) = viewModelScope.launch(HeikaCoroutineGuard) {
        val term = query.trim()
        if (term.isBlank() || term.length > 60) return@launch
        mutableState.update { it.copy(searchingMessages = true, error = null) }
        runCatching { repository.chatSearch(term, conversationId) }
            .onSuccess { data ->
                val hits = data.optJSONArray("items").jsonObjects().map { row ->
                    ChatSearchHit(
                        row.optString("id"), row.optString("conversation_id"), row.optString("sender_id"),
                        row.optString("body"), row.optString("created_at"),
                        row.optString("message_type").ifBlank { "text" },
                        row.optString("media_path").takeIf(String::isNotBlank),
                        row.optString("safety_flag").takeIf(String::isNotBlank),
                        row.optString("peer_name").ifBlank { "探索者" },
                        row.optString("peer_avatar").takeIf(String::isNotBlank),
                    )
                }.filter { it.id.isNotBlank() }
                mutableState.update { it.copy(searchResults = hits, searchingMessages = false) }
            }
            .onFailure { error -> mutableState.update { it.copy(searchingMessages = false, error = error.message ?: "搜索失败，请重试") } }
    }

    fun clearSearchResults() = mutableState.update { it.copy(searchResults = emptyList(), searchingMessages = false) }

    fun loadMedia(kind: String = mutableState.value.mediaKind) = viewModelScope.launch(HeikaCoroutineGuard) {
        val room = mutableState.value.activeId ?: return@launch
        mutableState.update { it.copy(mediaKind = kind, loadingMedia = true, error = null) }
        runCatching { repository.chatMedia(room, kind) }
            .onSuccess { data ->
                val items = data.optJSONArray("items").jsonObjects().map { row ->
                    ChatMediaItem(
                        row.optString("id"), row.optString("sender_id"), row.optString("body"), row.optString("created_at"),
                        row.optString("message_type").ifBlank { "text" },
                        row.optString("media_path").takeIf(String::isNotBlank),
                        parseMetadata(row.opt("metadata")),
                        row.optString("url").takeIf(String::isNotBlank),
                    )
                }.filter { it.id.isNotBlank() }
                mutableState.update { it.copy(mediaItems = items, loadingMedia = false) }
            }
            .onFailure { error -> mutableState.update { it.copy(loadingMedia = false, error = error.message ?: "资源库加载失败") } }
    }

    fun loadRequests() = viewModelScope.launch(HeikaCoroutineGuard) {
        mutableState.update { it.copy(loadingRequests = true) }
        runCatching { repository.chatRequests() }
            .onSuccess { data ->
                mutableState.update {
                    it.copy(
                        requestsReceived = data.optJSONArray("received").jsonObjects().map(::parseRequest),
                        requestsSent = data.optJSONArray("sent").jsonObjects().map(::parseRequest),
                        pendingRequestCount = data.optInt("pending_count"),
                        loadingRequests = false,
                    )
                }
            }
            .onFailure { error -> mutableState.update { it.copy(loadingRequests = false, error = error.message ?: "消息请求加载失败") } }
    }

    fun acceptRequest(requestId: String, peer: NativePeer) = viewModelScope.launch(HeikaCoroutineGuard) {
        runCatching { repository.acceptMessageRequest(requestId) }.onSuccess { data ->
            val id = data.optString("conversation_id")
            loadRequests()
            if (id.isNotBlank()) openConversationInternal(id, peer)
        }.onFailure { error -> mutableState.update { it.copy(error = error.message ?: "接受失败，请重试") } }
    }

    fun updateRequest(requestId: String, status: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        runCatching { repository.updateMessageRequest(requestId, status) }
            .onSuccess { loadRequests() }
            .onFailure { error -> mutableState.update { it.copy(error = error.message ?: "操作失败，请重试") } }
    }

    fun sendRequest(peerId: String, content: String) = viewModelScope.launch(HeikaCoroutineGuard) {
        val text = content.trim()
        if (peerId.isBlank() || text.isBlank()) return@launch
        runCatching { repository.sendMessageRequest(peerId, text) }
            .onSuccess { loadRequests() }
            .onFailure { error -> mutableState.update { it.copy(error = error.message ?: "请求发送失败，请重试") } }
    }

    fun loadFavorites() = viewModelScope.launch(HeikaCoroutineGuard) {
        mutableState.update { it.copy(loadingFavorites = true) }
        runCatching { repository.chatFavorites() }
            .onSuccess { data ->
                val items = data.optJSONArray("items").jsonObjects().map { row ->
                    ChatFavorite(
                        row.optString("message_id"), row.optString("favorited_at"),
                        row.optJSONObject("message")?.let(::parseMessage),
                        row.optString("peer_id").takeIf(String::isNotBlank),
                        row.optBoolean("unavailable"),
                    )
                }.filter { it.messageId.isNotBlank() }
                mutableState.update {
                    it.copy(favorites = items, loadingFavorites = false, favoriteIds = items.map { item -> item.messageId }.toSet())
                }
            }
            .onFailure { error -> mutableState.update { it.copy(loadingFavorites = false, error = error.message ?: "收藏加载失败") } }
    }

    fun loadPrivacy() = viewModelScope.launch(HeikaCoroutineGuard) {
        mutableState.update { it.copy(loadingPrivacy = true) }
        runCatching { repository.chatPrivacy() }.onSuccess { data ->
            mutableState.update { it.copy(privacy = parsePrivacy(data), loadingPrivacy = false) }
        }.onFailure { error -> mutableState.update { it.copy(loadingPrivacy = false, error = error.message ?: "隐私设置加载失败") } }
    }

    fun updatePrivacy(patch: JSONObject) = viewModelScope.launch(HeikaCoroutineGuard) {
        runCatching { repository.updatePrivacy(patch) }.onSuccess {
            mutableState.update { state ->
                state.privacy?.let { current ->
                    state.copy(privacy = current.copy(
                        dmPermission = patch.optString("dm_permission", current.dmPermission),
                        readReceipt = patch.optBoolean("read_receipt", current.readReceipt),
                        typingIndicator = patch.optBoolean("typing_indicator", current.typingIndicator),
                        onlineVisibility = patch.optString("online_visibility", current.onlineVisibility),
                    ))
                } ?: state
            }
        }.onFailure { error -> mutableState.update { it.copy(error = error.message ?: "隐私设置保存失败") } }
    }

    // -----------------------------------------------------------------
    // Decoration
    // -----------------------------------------------------------------

    private fun loadDecoration(userId: String) {
        decorLoadedFor = userId
        viewModelScope.launch(HeikaCoroutineGuard) {
            runCatching { preferences.chatDecorJson(userId) }.getOrNull()?.let { raw ->
                runCatching {
                    val json = JSONObject(raw)
                    ChatDecoration(
                        ChatDecoration.normalizeTheme(json.optString("theme")),
                        ChatDecoration.normalizeBubble(json.optString("bubble")),
                        runCatching { json.optDouble("scale", 1.0).toFloat() }.getOrDefault(1f),
                    )
                }.getOrNull()?.let { decor ->
                    mutableState.update { if (it.userId == userId) it.copy(decoration = decor) else it }
                }
            }
        }
    }

    fun setDecoration(theme: String? = null, bubble: String? = null, scale: Float? = null) {
        val userId = mutableState.value.userId ?: return
        val next = mutableState.value.decoration.copy(
            theme = theme?.let(ChatDecoration::normalizeTheme) ?: mutableState.value.decoration.theme,
            bubble = bubble?.let(ChatDecoration::normalizeBubble) ?: mutableState.value.decoration.bubble,
            scale = scale?.let(ChatDecoration::normalizeScale) ?: mutableState.value.decoration.scale,
        )
        mutableState.update { it.copy(decoration = next) }
        viewModelScope.launch(HeikaCoroutineGuard) {
            runCatching { preferences.setChatDecorJson(userId, next.theme, next.bubble, next.scale) }
        }
    }

    // -----------------------------------------------------------------
    // Parsers
    // -----------------------------------------------------------------

    private fun parsePeer(json: JSONObject) = NativePeer(
        json.optString("id"),
        json.optString("nickname").ifBlank { "探索者" },
        json.optString("avatar_url").takeIf(String::isNotBlank),
        json.optString("bio"),
        json.optJSONArray("badges").jsonObjects().map { row -> NativeBadge(row.optString("id"), row.optString("label"), row.optString("description"), row.optString("color")) },
    )

    private fun parseInbox(data: JSONObject): List<NativeConversation> = data.optJSONArray("items").jsonObjects().map { row ->
        val peer = parsePeer(row.optJSONObject("peer") ?: JSONObject())
        NativeConversation(
            row.optString("conversation_id"), peer, row.optString("latest_body"), row.optInt("unread"), row.optString("created_at"),
            pinned = row.optBoolean("pinned"),
            pinnedAt = row.optString("pinned_at").takeIf(String::isNotBlank),
            muted = row.optBoolean("muted"),
            manualUnread = row.optBoolean("manual_unread"),
            latestType = row.optString("latest_type").ifBlank { "text" },
            latestSafety = row.optString("latest_safety").takeIf(String::isNotBlank),
        )
    }.filter { it.id.isNotBlank() }.distinctBy { it.id }.sortedWith(
        compareByDescending<NativeConversation> { it.pinned }
            .thenByDescending { it.pinnedAt ?: "" }
            .thenByDescending { it.createdAt },
    )

    private fun parseMessages(data: JSONObject): List<NativeMessage> =
        data.optJSONArray("items").jsonObjects().mapNotNull(::parseMessage)

    private fun parseMessage(row: JSONObject): NativeMessage? {
        val id = row.optString("id")
        if (id.isBlank() || row.optBoolean("recalled")) return null
        return NativeMessage(
            id = id,
            conversationId = row.optString("conversation_id"),
            senderId = row.optString("sender_id"),
            body = row.optString("body"),
            createdAt = row.optString("created_at"),
            messageType = row.optString("message_type").ifBlank { "text" },
            mediaPath = row.optString("media_path").takeIf(String::isNotBlank),
            replyTo = row.optString("reply_to").takeIf(String::isNotBlank),
            editedAt = row.optString("edited_at").takeIf(String::isNotBlank),
            editCount = row.optInt("edit_count"),
            recalled = row.optBoolean("recalled"),
            safetyFlag = row.optString("safety_flag").takeIf(String::isNotBlank),
            metadata = parseMetadata(row.opt("metadata")),
        )
    }

    private fun parseMetadata(value: Any?): JSONObject? = when (value) {
        is JSONObject -> value
        is String -> runCatching { JSONObject(value) }.getOrNull()
        else -> null
    }

    private fun parseRequest(row: JSONObject) = ChatRequest(
        row.optString("id"), row.optString("sender_id"), row.optString("recipient_id"), row.optString("body"),
        row.optString("media_path").takeIf(String::isNotBlank),
        row.optString("safety_flag").takeIf(String::isNotBlank),
        row.optString("status"), row.optString("created_at"),
        parsePeer(row.optJSONObject("peer") ?: JSONObject()),
    )

    private fun parseSettings(json: JSONObject) = ChatSettings(
        pinned = json.optBoolean("pinned"),
        pinnedAt = json.optString("pinned_at").takeIf(String::isNotBlank),
        muted = json.optBoolean("muted"),
        archived = json.optBoolean("archived"),
        manualUnread = json.optBoolean("manual_unread"),
        keepArchived = json.optBoolean("keep_archived"),
        theme = json.optString("theme").takeIf(String::isNotBlank),
        backgroundPath = json.optString("background_path").takeIf(String::isNotBlank),
        bubbleColor = json.optString("bubble_color").takeIf(String::isNotBlank),
        fontScale = runCatching { json.optDouble("font_scale", 1.0).toFloat() }.getOrDefault(1f),
    )

    private fun parsePrivacy(json: JSONObject) = ChatPrivacy(
        dmPermission = json.optString("dm_permission").ifBlank { "everyone" },
        readReceipt = json.optBoolean("read_receipt", true),
        typingIndicator = json.optBoolean("typing_indicator", true),
        onlineVisibility = json.optString("online_visibility").ifBlank { "everyone" },
    )
}

/** 撤回窗口：180 秒，和服务端一致。返回剩余秒数，<=0 表示已超时。 */
internal fun recallRemainingSeconds(createdAt: String, nowMillis: Long = System.currentTimeMillis()): Long {
    val sentAt = runCatching { java.time.Instant.parse(createdAt).toEpochMilli() }.getOrNull() ?: return 0
    return ((sentAt + 180_000L) - nowMillis) / 1000L
}

/** 编辑窗口：15 分钟，与服务端 dm_edit_v2 一致。 */
internal fun editRemainingSeconds(createdAt: String, nowMillis: Long = System.currentTimeMillis()): Long {
    val sentAt = runCatching { java.time.Instant.parse(createdAt).toEpochMilli() }.getOrNull() ?: return 0
    return ((sentAt + 900_000L) - nowMillis) / 1000L
}
