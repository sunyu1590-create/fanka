package com.heika.nativeapp.feature.messages

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import kotlinx.coroutines.delay
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.heika.nativeapp.ui.HeikaIcons
import androidx.compose.ui.zIndex
import com.heika.nativeapp.ui.HeikaAlertDialog
import com.heika.nativeapp.ui.HeikaSpacing
import com.heika.nativeapp.ui.HeikaType
import com.heika.nativeapp.ui.HeikaAvatar
import com.heika.nativeapp.ui.HeikaGlassSurface
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.HeikaPulseDot
import com.heika.nativeapp.ui.HeikaPulsePage
import com.heika.nativeapp.ui.HeikaPulseLines
import coil3.compose.AsyncImage
import dev.chrisbanes.haze.HazeState

private enum class ChatOverlay { Settings, Media, Requests, Favorites, Search, Privacy, Forward }

@Composable
@OptIn(ExperimentalFoundationApi::class)
fun MessagesScreen(
    initialConversationId: String? = null,
    initialPeerId: String? = null,
    onBack: () -> Unit,
    onProfile: (String) -> Unit,
    onLogin: () -> Unit,
    onNotifications: () -> Unit = {},
    onConversationChange: (Boolean) -> Unit = {},
    hazeState: HazeState? = null,
    onOpenContent: (String) -> Unit = {},
    onReport: (String) -> Unit = {},
    viewModel: MessagesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val inboxListState = rememberLazyListState()
    val peopleListState = rememberLazyListState()
    val conversationListState = rememberLazyListState()
    var peopleMode by remember { mutableStateOf(false) }
    var unreadOnly by remember { mutableStateOf(false) }
    var overlay by remember { mutableStateOf<ChatOverlay?>(null) }
    var overlayQuery by remember { mutableStateOf("") }
    var searchScope by remember { mutableStateOf<String?>(null) }
    var forwardSourceId by remember { mutableStateOf<String?>(null) }
    var conversationActionTarget by remember { mutableStateOf<NativeConversation?>(null) }
    var reportTargetId by remember { mutableStateOf<String?>(null) }
    var reportReason by remember { mutableStateOf("") }
    LaunchedEffect(initialConversationId, initialPeerId) {
        if (!initialPeerId.isNullOrBlank()) {
            viewModel.load()
            viewModel.startWithPeer(initialPeerId)
        } else viewModel.load(initialConversationId)
    }
    LaunchedEffect(state.activeId) {
        onConversationChange(state.activeId != null)
        // 归档等设置可能让会话从当前页消失，二级页要一起退出。
        if (state.activeId == null) overlay = null
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) viewModel.startForegroundSync()
            if (event == Lifecycle.Event.ON_STOP) viewModel.stopForegroundSync()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer); viewModel.stopForegroundSync() }
    }
    BackHandler(enabled = true) {
        when {
            overlay != null -> overlay = null
            state.activeId != null -> viewModel.closeConversation()
            else -> onBack()
        }
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (overlay != null) {
            when (overlay) {
                ChatOverlay.Settings -> ChatSettingsScreen(
                    state = state,
                    onBack = { overlay = null },
                    onOpenMedia = { overlay = ChatOverlay.Media },
                    onOpenRequests = { overlay = ChatOverlay.Requests },
                    onOpenFavorites = { overlay = ChatOverlay.Favorites },
                    onOpenPrivacy = { overlay = ChatOverlay.Privacy },
                    viewModel = viewModel,
                )
                ChatOverlay.Media -> ChatMediaLibraryScreen(state, { overlay = null }, viewModel)
                ChatOverlay.Requests -> ChatRequestsScreen(state, { overlay = null }, viewModel) { viewModel.openConversationById(it) }
                ChatOverlay.Favorites -> ChatFavoritesScreen(state, { overlay = null }, viewModel) { viewModel.openConversationById(it) }
                ChatOverlay.Privacy -> ChatPrivacyScreen(state, { overlay = null }, viewModel)
                ChatOverlay.Search -> ChatSearchScreen(
                    state = state, onBack = { overlay = null }, initialQuery = overlayQuery,
                    scopeConversationId = searchScope, viewModel = viewModel,
                    onOpenConversation = { viewModel.openConversationById(it) },
                )
                ChatOverlay.Forward -> ForwardPicker(state, { overlay = null }) { target ->
                    val ids = if (state.selectedIds.isNotEmpty()) state.selectedIds.toList()
                        else forwardSourceId?.let { listOf(it) }.orEmpty()
                    viewModel.forwardMessages(target, ids)
                    overlay = null
                }
                null -> Unit
            }
        } else if (state.activeId == null) {
            Row(Modifier.fillMaxWidth().height(HeikaSpacing.headerHeight).padding(horizontal = HeikaSpacing.pageHorizontal), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text("消息", color = MaterialTheme.colorScheme.onBackground, fontSize = HeikaType.sectionTitle, fontWeight = FontWeight.SemiBold, letterSpacing = .2.sp)
                    val unreadCount = state.conversations.sumOf { it.unread }
                    if (unreadCount > 0) Text("$unreadCount 条未读", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                }
                Box {
                    IconButton(onClick = { overlay = ChatOverlay.Requests }, modifier = Modifier.size(36.dp)) {
                        Icon(HeikaIcons.UserSearch, "消息请求", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(19.dp))
                    }
                    if (state.pendingRequestCount > 0) {
                        Box(Modifier.size(7.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary).align(Alignment.TopEnd))
                    }
                }
                IconButton(onClick = onNotifications, modifier = Modifier.size(36.dp)) { Icon(HeikaIcons.Notifications, "通知", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(19.dp)) }
                IconButton(onClick = { viewModel.load() }, modifier = Modifier.size(36.dp)) { Icon(HeikaIcons.Retry, "刷新消息", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(19.dp)) }
            }
            if (state.error?.contains("登录") == true) {
                Column(Modifier.fillMaxWidth().padding(26.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(state.error!!, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = onLogin) { Text("登录") }
                }
            } else {
                HeikaGlassSurface(
                    hazeState = hazeState,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 5.dp),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 11.dp),
                    drawTopHighlight = false,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(if (peopleMode) HeikaIcons.Profile else HeikaIcons.Search, null, modifier = Modifier.size(19.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Box(Modifier.weight(1f)) {
                            if (state.query.isBlank()) Text(
                                if (peopleMode) "搜索昵称，发现新朋友" else "搜索会话昵称或最近消息",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 13.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            BasicTextField(
                                value = state.query,
                                onValueChange = { if (peopleMode) viewModel.search(it) else viewModel.setQuery(it) },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                textStyle = TextStyle(color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp),
                                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            )
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 6.dp, bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    val unreadCount = state.conversations.sumOf { it.unread }
                    val tabs = listOf(
                        Triple("全部消息", !peopleMode && !unreadOnly, { peopleMode = false; unreadOnly = false }),
                        Triple(if (unreadCount > 0) "未读 · $unreadCount" else "未读", !peopleMode && unreadOnly, { peopleMode = false; unreadOnly = true }),
                        Triple("找人", peopleMode, { peopleMode = true }),
                    )
                    tabs.forEach { (label, active, select) ->
                        Text(
                            label,
                            Modifier.weight(1f, fill = false).clip(RoundedCornerShape(10.dp))
                                .background(if (active) MaterialTheme.colorScheme.primary.copy(alpha = .13f) else Color.Transparent)
                                .clickable { select(); viewModel.setQuery("") }
                                .padding(horizontal = 13.dp, vertical = 7.dp),
                            color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                if (!peopleMode && state.query.trim().length >= 2) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 4.dp)
                            .clip(RoundedCornerShape(11.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = .08f))
                            .clickable { overlayQuery = state.query.trim(); searchScope = null; overlay = ChatOverlay.Search }
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(HeikaIcons.Search, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                        Text("在聊天记录中搜索「${state.query.trim()}」", Modifier.weight(1f), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Icon(HeikaIcons.Forward, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                    }
                }
                state.error?.let { message ->
                    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 3.dp, bottom = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(message, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                        TextButton(onClick = {
                            if (state.query.trim().length >= 2) viewModel.search(state.query) else viewModel.load()
                        }) { Text("重试") }
                    }
                }
                if (peopleMode && state.query.length >= 2 && state.people.isNotEmpty()) {
                    Text("用户", Modifier.padding(start = 21.dp, top = 14.dp, bottom = 5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    LazyColumn(state = peopleListState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 128.dp)) {
                        items(state.people.distinctBy { it.id }, key = { it.id }) { peer -> PeerRow(peer) { viewModel.openPeer(peer) } }
                    }
                } else if (peopleMode && state.query.length >= 2 && state.searchingPeople) {
                    HeikaPulseLines(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp), lines = 4, lineHeight = 12.dp)
                } else if (!peopleMode && state.loading && state.conversations.isEmpty()) {
                    HeikaPulsePage(Modifier.fillMaxSize(), cards = 4, cardHeight = 64.dp, horizontalPadding = 16.dp)
                } else if (peopleMode && state.query.length < 2) {
                    Text("搜索昵称，发现新朋友", Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.weight(1f))
                } else if (peopleMode && state.query.length >= 2 && state.people.isEmpty() && !state.searchingPeople) {
                    Text("没有找到用户", Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.weight(1f))
                } else if (!peopleMode && state.conversations.isEmpty()) {
                    Column(Modifier.fillMaxWidth().padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("暂无会话", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                    }
                    Spacer(Modifier.weight(1f))
                } else {
                    LazyColumn(state = inboxListState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(start = 15.dp, end = 15.dp, top = 8.dp, bottom = 128.dp)) {
                        val query = state.query.trim().lowercase()
                        val conversations = state.conversations.filter { item ->
                            (!unreadOnly || item.unread > 0 || item.manualUnread) &&
                                (query.isEmpty() || item.peer.name.lowercase().contains(query) || item.latest.lowercase().contains(query))
                        }.distinctBy { it.id }
                        items(conversations, key = { it.id }) { item ->
                            Column(Modifier.animateItem()) {
                                ConversationRow(item, onClick = { viewModel.openConversation(item) }, onLongClick = { conversationActionTarget = item })
                                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .25f), thickness = .5.dp)
                            }
                        }
                    }
                }
            }
        } else {
            val peer = state.activePeer
            val context = LocalContext.current
            var actionTarget by remember(state.activeId) { mutableStateOf<NativeMessage?>(null) }
            var didInitialScroll by remember(state.activeId) { mutableStateOf(false) }
            LaunchedEffect(state.activeId, state.messages.lastOrNull()?.id) {
                if (state.activeId != null && state.messages.isNotEmpty()) {
                    val lastIndex = state.messages.lastIndex + if (state.historyHasMore) 1 else 0
                    if (!didInitialScroll) {
                        conversationListState.scrollToItem(lastIndex)
                        didInitialScroll = true
                    } else {
                        val visibleLast = conversationListState.layoutInfo.visibleItemsInfo.maxOfOrNull { it.index } ?: -1
                        if (visibleLast >= lastIndex - 2) conversationListState.animateScrollToItem(lastIndex)
                    }
                }
            }
            Row(Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                IconButton(onClick = { viewModel.closeConversation() }, modifier = Modifier.size(44.dp)) { Icon(HeikaIcons.Back, "返回会话列表", modifier = Modifier.size(22.dp), tint = MaterialTheme.colorScheme.onBackground) }
                if (peer != null) HeikaAvatar(peer.avatar, peer.name, 40.dp)
                Column(Modifier.weight(1f).clickable(enabled = peer != null) { peer?.let { onProfile(it.id) } }) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(peer?.name ?: "私信", Modifier.weight(1f, fill = false), color = MaterialTheme.colorScheme.onBackground, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        BadgeMarks(peer?.badges.orEmpty())
                        if (state.activeSettings?.muted == true) Icon(HeikaIcons.VolumeOff, "免打扰", Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("个人主页", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                }
                IconButton(onClick = { overlayQuery = ""; searchScope = state.activeId; overlay = ChatOverlay.Search }) { Icon(HeikaIcons.Search, "搜索聊天记录", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                IconButton(onClick = { overlay = ChatOverlay.Settings }, enabled = peer != null) { Icon(HeikaIcons.More, "会话设置", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            state.error?.let { Text(it, Modifier.padding(horizontal = 16.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
            val chatThemeBackground = chatDecorationColors(state.decoration.theme, state.decoration.bubble).first
            LazyColumn(state = conversationListState, modifier = Modifier.weight(1f).fillMaxWidth().background(chatThemeBackground), reverseLayout = false, contentPadding = PaddingValues(start = 14.dp, top = 10.dp, end = 14.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                if (state.historyHasMore) item {
                    Text(if (state.loadingHistory) "正在加载…" else "加载更早消息", Modifier.fillMaxWidth().clickable(enabled = !state.loadingHistory) { viewModel.loadOlderMessages() }.padding(9.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, textAlign = TextAlign.Center)
                }
                itemsIndexed(state.messages, key = { index, it -> if (it.id.isBlank()) "blank-$index" else it.id }) { index, message ->
                    val mine = message.senderId == state.userId
                    val day = message.createdAt.take(10)
                    val previousDay = state.messages.getOrNull(index - 1)?.createdAt?.take(10)
                    val original = message.replyTo?.let { id -> state.messages.firstOrNull { it.id == id } }
                    val replyPreview = original?.let { o ->
                        val who = if (o.senderId == state.userId) "我" else (peer?.name ?: "对方")
                        "回复 $who：${o.body.take(60)}"
                    }
                    Column(Modifier.fillMaxWidth().animateItem(), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        if (day != previousDay) {
                            Text(messageDay(day), Modifier.fillMaxWidth().padding(vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, textAlign = TextAlign.Center)
                        }
                        MessageBubble(
                            message = message,
                            mine = mine,
                            peer = peer,
                            myAvatar = state.currentUserAvatarUrl,
                            scale = state.decoration.scale,
                            bubbleTint = chatDecorationColors(state.decoration.theme, state.decoration.bubble).second,
                            multiSelect = state.multiSelect,
                            selected = message.id in state.selectedIds,
                            replyPreview = replyPreview,
                            favorited = message.id in state.favoriteIds,
                            onToggleSelection = { viewModel.toggleMessageSelection(message.id) },
                            onLongClick = { actionTarget = message },
                            onReaction = { viewModel.reactMessage(message.id, it) },
                            onOpenContent = { onOpenContent(it) },
                        )
                    }
                }
                items(state.pendingMessages, key = { "pending-${it.nonce}" }) { pending ->
                    if (pending.conversationId == state.activeId && pending.failed) {
                        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("${pending.body}  ·  发送失败", Modifier.fillMaxWidth().padding(horizontal = 6.dp), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                            Row {
                                TextButton(onClick = { viewModel.retryMessage(pending.nonce) }) { Text("重试发送") }
                                if (peer != null) TextButton(onClick = { viewModel.sendRequest(peer.id, pending.body) }) { Text("改发私信请求") }
                            }
                        }
                    }
                }
                if (state.messages.isEmpty() && !state.loading) item { Text("发送第一条消息，开始交流。", Modifier.fillMaxWidth().padding(vertical = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
            }
            if (state.multiSelect) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { viewModel.toggleMultiSelect() }) { Text("取消") }
                    Text("已选 ${state.selectedIds.size} 条", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, textAlign = TextAlign.Center)
                    TextButton(onClick = { viewModel.favoriteSelected() }, enabled = state.selectedIds.isNotEmpty()) { Text("收藏") }
                    Button(onClick = { overlay = ChatOverlay.Forward }, enabled = state.selectedIds.isNotEmpty()) { Text("转发") }
                }
            }
            state.replyTo?.let { target ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp).clip(RoundedCornerShape(11.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .6f)).padding(horizontal = 11.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("回复 ${if (target.senderId == state.userId) "我" else (peer?.name ?: "对方")}：${target.body.take(50)}", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    IconButton(onClick = { viewModel.setReplyTo(null) }, modifier = Modifier.size(28.dp)) { Icon(HeikaIcons.Close, "取消引用", Modifier.size(15.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            state.editing?.let { target ->
                var editText by remember(target.id) { mutableStateOf(target.body) }
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    TextField(value = editText, onValueChange = { editText = it.take(2000) }, modifier = Modifier.weight(1f).heightIn(max = 110.dp), label = { Text("编辑消息") })
                    TextButton(onClick = { viewModel.cancelEdit() }) { Text("取消") }
                    Button(onClick = { viewModel.submitEdit(editText) }, enabled = editText.isNotBlank()) { Text("保存") }
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                HeikaGlassSurface(
                    hazeState = hazeState,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(28.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    drawTopHighlight = false,
                ) {
                    BasicTextField(
                        value = state.draft,
                        onValueChange = viewModel::setDraft,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 24.dp, max = 112.dp),
                        textStyle = TextStyle(color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, lineHeight = 20.sp),
                        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                        maxLines = 5,
                        decorationBox = { inner ->
                            Box {
                                if (state.draft.isBlank()) Text("发送消息", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp)
                                inner()
                            }
                        },
                    )
                }
                val sendReady = state.draft.isNotBlank() && !state.sending && state.editing == null && !state.multiSelect
                Box(
                    Modifier.size(48.dp).clip(CircleShape)
                        .background(if (sendReady) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f))
                        .clickable(enabled = sendReady, onClick = viewModel::send),
                    contentAlignment = Alignment.Center,
                ) {
                    when {
                        state.sending -> HeikaPulseDot(size = 18.dp, color = MaterialTheme.colorScheme.onPrimary)
                        else -> Icon(HeikaIcons.ArrowUp, contentDescription = "发送", tint = if (sendReady) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(21.dp))
                    }
                }
            }
            actionTarget?.let { target ->
                val mine = state.userId != null && target.senderId == state.userId
                var remaining by remember(target.id) {
                    mutableStateOf(if (mine) recallRemainingSeconds(target.createdAt) else 0L)
                }
                LaunchedEffect(target.id) {
                    while (mine && remaining > 0) {
                        delay(1_000)
                        remaining = recallRemainingSeconds(target.createdAt)
                    }
                }
                HeikaAlertDialog(
                    onDismissRequest = { actionTarget = null },
                    title = { Text("消息操作") },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                            Text(
                                if (mine) {
                                    if (remaining > 0) "撤回后你和对方都会看不到这条消息，超过 3 分钟就无法撤回。"
                                    else "这条消息已超过 3 分钟，无法撤回。"
                                } else "可以对这条消息进行复制、引用、回应、收藏或举报。",
                                color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp,
                            )
                            Text(target.body, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, lineHeight = 19.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
                            Text("表情回应", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                QUICK_REACTIONS.forEach { emoji ->
                                    Text(emoji, Modifier.clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surfaceVariant).clickable {
                                        viewModel.reactMessage(target.id, emoji); actionTarget = null
                                    }.padding(horizontal = 9.dp, vertical = 5.dp), fontSize = 17.sp)
                                }
                            }
                        }
                    },
                    confirmButton = {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                TextButton(onClick = {
                                    val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
                                    clipboard?.setPrimaryClip(android.content.ClipData.newPlainText("消息", target.body)); actionTarget = null
                                }) { Text("复制") }
                                TextButton(onClick = { viewModel.setReplyTo(target); actionTarget = null }) { Text("引用") }
                                TextButton(onClick = { viewModel.favoriteMessage(target.id); actionTarget = null }) { Text("收藏") }
                                TextButton(onClick = { forwardSourceId = target.id; overlay = ChatOverlay.Forward; actionTarget = null }) { Text("转发") }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                                TextButton(onClick = { viewModel.toggleMultiSelect(); viewModel.toggleMessageSelection(target.id); actionTarget = null }) { Text("多选") }
                                TextButton(onClick = { reportTargetId = target.id; reportReason = ""; actionTarget = null }) { Text("举报") }
                                if (mine && target.messageType == "text" && editRemainingSeconds(target.createdAt) > 0 && !target.recalled) {
                                    TextButton(onClick = { viewModel.startEdit(target); actionTarget = null }) { Text("编辑") }
                                }
                                if (mine) {
                                    TextButton(
                                        enabled = remaining > 0,
                                        onClick = { viewModel.recallMessage(target.id); actionTarget = null },
                                    ) {
                                        val clock = String.format("%02d:%02d", remaining / 60, remaining % 60)
                                        Text(if (remaining > 0) "撤回 · $clock" else "已无法撤回", color = if (remaining > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    },
                    dismissButton = { TextButton(onClick = { actionTarget = null }) { Text("取消") } },
                )
            }
        }
    }
    conversationActionTarget?.let { item ->
        HeikaAlertDialog(
            onDismissRequest = { conversationActionTarget = null },
            title = { Text(item.peer.name) },
            text = { Text("对该会话进行管理，设置会同步到你的其他设备。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) },
            confirmButton = {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row {
                        TextButton(onClick = { viewModel.togglePin(item.id); conversationActionTarget = null }) { Text(if (item.pinned) "取消置顶" else "置顶") }
                        TextButton(onClick = { viewModel.setMuted(item.id, !item.muted); conversationActionTarget = null }) { Text(if (item.muted) "取消免打扰" else "免打扰") }
                    }
                    Row {
                        TextButton(onClick = { viewModel.markUnread(item.id, !item.manualUnread); conversationActionTarget = null }) { Text(if (item.manualUnread) "取消未读" else "标记未读") }
                        TextButton(onClick = { viewModel.setArchived(item.id, true); conversationActionTarget = null }) { Text("归档") }
                    }
                }
            },
            dismissButton = { TextButton(onClick = { conversationActionTarget = null }) { Text("取消") } },
        )
    }
    reportTargetId?.let { targetId ->
        HeikaAlertDialog(
            onDismissRequest = { reportTargetId = null },
            title = { Text("举报消息") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("请说明举报原因（至少 3 个字），管理员会结合原消息上下文处理。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 12.dp, vertical = 10.dp)) {
                        if (reportReason.isBlank()) Text("输入举报原因", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                        BasicTextField(value = reportReason, onValueChange = { reportReason = it.take(500) }, singleLine = false, maxLines = 4,
                            textStyle = TextStyle(color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp),
                            cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary), modifier = Modifier.fillMaxWidth())
                    }
                }
            },
            confirmButton = {
                TextButton(enabled = reportReason.trim().length >= 3, onClick = {
                    viewModel.reportMessage(targetId, reportReason)
                    reportTargetId = null
                }) { Text("提交举报") }
            },
            dismissButton = { TextButton(onClick = { reportTargetId = null }) { Text("取消") } },
        )
    }
}

@Composable
private fun ForwardPicker(state: MessagesState, onBack: () -> Unit, onPick: (String) -> Unit) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        ChatSubHeader("转发到会话", onBack)
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)) {
            items(state.conversations.filter { it.id != state.activeId }, key = { it.id }) { item ->
                Row(Modifier.fillMaxWidth().clickable { onPick(item.id) }.padding(horizontal = 6.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                    PeerAvatar(item.peer)
                    Text(item.peer.name, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (state.conversations.size <= 1) item { Text("还没有其他可以转发的会话", Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
        }
    }
}

@Composable
@OptIn(ExperimentalFoundationApi::class)
private fun MessageBubble(
    message: NativeMessage,
    mine: Boolean,
    peer: NativePeer?,
    myAvatar: String?,
    scale: Float,
    bubbleTint: Color,
    multiSelect: Boolean,
    selected: Boolean,
    replyPreview: String?,
    favorited: Boolean,
    onToggleSelection: () -> Unit,
    onLongClick: () -> Unit,
    onReaction: (String) -> Unit,
    onOpenContent: (String) -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val bubbleMaxWidth = maxWidth * .76f
        Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Top) {
            if (multiSelect) {
                Checkbox(checked = selected, onCheckedChange = { onToggleSelection() }, modifier = Modifier.align(Alignment.CenterVertically))
            }
            if (!mine && peer != null) HeikaAvatar(peer.avatar, peer.name, 32.dp, modifier = Modifier.padding(top = 17.dp, end = 7.dp))
            Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start, modifier = Modifier.widthIn(max = bubbleMaxWidth)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.padding(horizontal = 3.dp, vertical = 2.dp)) {
                    Text(messageTime(message.createdAt), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    if (message.editCount > 0) Text("已编辑", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                    if (favorited) Icon(HeikaIcons.SaveFilled, "已收藏", Modifier.size(11.dp), tint = MaterialTheme.colorScheme.primary)
                }
                if (!replyPreview.isNullOrBlank()) {
                    Text(replyPreview, Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .08f)).padding(horizontal = 8.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                val interaction = remember { MutableInteractionSource() }
                val pressed by interaction.collectIsPressedAsState()
                val bubbleScale by animateFloatAsState(if (pressed) .975f else 1f, tween(chatMotionMs(HeikaMotion.quick)), label = "bubble-press")
                val shape = RoundedCornerShape(18.dp)
                val background = if (mine) bubbleTint.copy(alpha = .20f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .92f)
                val bubbleModifier = Modifier.graphicsLayer { scaleX = bubbleScale; scaleY = bubbleScale }
                    .clip(shape)
                    .combinedClickable(interactionSource = interaction, indication = LocalIndication.current, onClick = {}, onLongClick = onLongClick)
                    .background(background)
                    .padding(horizontal = 13.dp, vertical = 10.dp)
                if (message.messageType in setOf("work", "collection", "image", "video", "file", "ai_resource", "profile", "profile_share", "collection_share")) {
                    val title = message.metadata?.optString("title")?.takeIf(String::isNotBlank) ?: message.body
                    val label = when (message.messageType) {
                        "work" -> "黑卡作品"; "collection" -> "作品合集"; "ai_resource" -> "AI 资源"
                        "profile", "profile_share" -> "用户名片"; "image" -> "图片"; "video" -> "视频"; "file" -> "文件"
                        else -> "分享内容"
                    }
                    val link = message.metadata?.optString("id")?.takeIf(String::isNotBlank)
                        ?: message.metadata?.optString("url")?.takeIf(String::isNotBlank)
                    Column(bubbleModifier, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Icon(if (message.messageType == "collection") HeikaIcons.Album else HeikaIcons.Bag, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary)
                            Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = (13f * scale).sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        if (!link.isNullOrBlank()) {
                            Text("查看$label ›", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, modifier = Modifier.clickable { onOpenContent(link) })
                        }
                    }
                } else {
                    Text(message.body, bubbleModifier, color = MaterialTheme.colorScheme.onSurface, fontSize = (15f * scale).sp, lineHeight = (21f * scale).sp)
                }
                // 安全提醒只在该消息气泡下方出现一次，不拦截、不修改原文、不弹窗。
                if (message.safetyFlag != null && !message.recalled) SafetyNoticeText()
                if (message.reactions.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 3.dp)) {
                        message.reactions.forEach { reaction ->
                            Row(
                                Modifier.clip(RoundedCornerShape(10.dp))
                                    .background(if (reaction.mine) MaterialTheme.colorScheme.primary.copy(alpha = .16f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .6f))
                                    .clickable { onReaction(reaction.emoji) }
                                    .padding(horizontal = 7.dp, vertical = 3.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) { Text("${reaction.emoji} ${reaction.count}", color = MaterialTheme.colorScheme.onSurface, fontSize = 11.sp) }
                        }
                    }
                }
            }
            if (mine) HeikaAvatar(myAvatar, "我", 32.dp, modifier = Modifier.padding(top = 17.dp, start = 7.dp))
        }
    }
}

@Composable
private fun ConversationRow(item: NativeConversation, onClick: () -> Unit, onLongClick: () -> Unit) {
    val unread = item.unread > 0
    val showDot = item.manualUnread && !unread
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 6.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        PeerAvatar(item.peer)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (item.pinned) Icon(HeikaIcons.SaveFilled, "已置顶", Modifier.size(13.dp), tint = MaterialTheme.colorScheme.primary)
                Text(item.peer.name, Modifier.weight(1f, fill = false), color = if (unread || showDot) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp, fontWeight = if (unread || showDot) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
                BadgeMarks(item.peer.badges)
                if (item.muted) Icon(HeikaIcons.VolumeOff, "免打扰", Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(item.latest.ifBlank { "开启一段新的交流" }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, lineHeight = 16.sp)
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(messageDate(item.createdAt), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1)
            if (unread) Text(item.unread.coerceAtMost(99).toString(), Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 6.dp, vertical = 2.dp), color = MaterialTheme.colorScheme.onPrimary, fontSize = 9.sp, lineHeight = 11.sp)
            else if (showDot) Box(Modifier.size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
        }
    }
}

internal fun messageDate(value: String): String = runCatching {
    java.time.Instant.parse(value).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("M/d"))
}.getOrElse { value.take(10) }

private fun messageTime(value: String): String = runCatching {
    java.time.Instant.parse(value).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
}.getOrElse { value.takeLast(8).take(5) }

private fun messageDay(value: String): String = value.take(10).split('-').takeIf { it.size == 3 }
    ?.let { "${it[0]}年${it[1]}月${it[2]}日" } ?: value.take(10)

@Composable
private fun PeerRow(peer: NativePeer, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PeerAvatar(peer)
        Column {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(peer.name, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                BadgeMarks(peer.badges)
            }
            if (peer.bio.isNotBlank()) Text(peer.bio, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 1)
        }
    }
}

@Composable
private fun BadgeMarks(badges: List<com.heika.nativeapp.feature.profile.NativeBadge>) {
    if (badges.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        badges.take(3).forEach { badge ->
            val badgeTint = runCatching { Color(android.graphics.Color.parseColor(badge.color)) }.getOrDefault(MaterialTheme.colorScheme.primary)
            Icon(HeikaIcons.Shield, contentDescription = "${badge.label}认证", tint = badgeTint, modifier = Modifier.size(13.dp))
        }
        if (badges.size > 3) Text("+${badges.size - 3}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
    }
}

@Composable
private fun PeerAvatar(peer: NativePeer) {
    HeikaAvatar(peer.avatar, peer.name, 48.dp)
}
