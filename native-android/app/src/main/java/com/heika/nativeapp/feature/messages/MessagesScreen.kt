package com.heika.nativeapp.feature.messages

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil3.compose.AsyncImage
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.LocalHeikaImageLoader

@Composable
fun MessagesScreen(
    initialConversationId: String? = null,
    initialPeerId: String? = null,
    onBack: () -> Unit,
    onProfile: (String) -> Unit,
    onLogin: () -> Unit,
    onNotifications: () -> Unit = {},
    onConversationChange: (Boolean) -> Unit = {},
    viewModel: MessagesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val inboxListState = rememberLazyListState()
    val peopleListState = rememberLazyListState()
    val conversationListState = rememberLazyListState()
    var peopleMode by remember { mutableStateOf(false) }
    var unreadOnly by remember { mutableStateOf(false) }
    LaunchedEffect(initialConversationId, initialPeerId) {
        if (!initialPeerId.isNullOrBlank()) {
            viewModel.load()
            viewModel.startWithPeer(initialPeerId)
        } else viewModel.load(initialConversationId)
    }
    LaunchedEffect(state.activeId) { onConversationChange(state.activeId != null) }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) viewModel.startForegroundSync()
            if (event == Lifecycle.Event.ON_STOP) viewModel.stopForegroundSync()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer); viewModel.stopForegroundSync() }
    }
    BackHandler(enabled = true) {
        if (state.activeId != null) viewModel.closeConversation() else onBack()
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (state.activeId == null) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("消息", color = MaterialTheme.colorScheme.onBackground, fontSize = 23.sp, fontWeight = FontWeight.SemiBold)
                    val unreadCount = state.conversations.sumOf { it.unread }
                    Text("$unreadCount 条未读", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
                IconButton(onClick = onNotifications) { Icon(HeikaIcons.Notifications, "通知", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                IconButton(onClick = { viewModel.load() }) { Icon(HeikaIcons.Retry, "刷新消息", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            if (state.error?.contains("登录") == true) {
                Column(Modifier.fillMaxWidth().padding(26.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(state.error!!, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = onLogin) { Text("登录") }
                }
            } else {
                Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    Text("会话 ${state.conversations.size}", Modifier.clickable { peopleMode = false; viewModel.setQuery("") }.padding(vertical = 10.dp), color = if (!peopleMode) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = if (!peopleMode) FontWeight.SemiBold else FontWeight.Normal)
                    Text("找人", Modifier.clickable { peopleMode = true; viewModel.setQuery("") }.padding(vertical = 10.dp), color = if (peopleMode) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = if (peopleMode) FontWeight.SemiBold else FontWeight.Normal)
                }
                OutlinedTextField(value = state.query, onValueChange = { if (peopleMode) viewModel.search(it) else viewModel.setQuery(it) }, modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp), placeholder = { Text(if (peopleMode) "搜索昵称，发现新朋友" else "搜索会话昵称或最近消息") }, leadingIcon = { Icon(if (peopleMode) HeikaIcons.Profile else HeikaIcons.Search, null) }, singleLine = true)
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
                    LazyColumn(state = peopleListState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                        items(state.people, key = { it.id }) { peer -> PeerRow(peer) { viewModel.openPeer(peer) } }
                    }
                } else if (!peopleMode && state.loading && state.conversations.isEmpty()) {
                    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                } else if (peopleMode && state.query.length < 2) {
                    Text("搜索昵称，发现新朋友", Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.weight(1f))
                } else if (peopleMode && state.query.length >= 2 && state.people.isEmpty() && !state.loading) {
                    Text("没有找到用户", Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.weight(1f))
                } else if (!peopleMode && state.conversations.isEmpty()) {
                    Column(Modifier.fillMaxWidth().padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("暂无会话", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                    }
                    Spacer(Modifier.weight(1f))
                } else {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                        Text("全部", Modifier.clickable { unreadOnly = false }.padding(vertical = 6.dp), color = if (!unreadOnly) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = if (!unreadOnly) FontWeight.SemiBold else FontWeight.Normal)
                        Text("未读${state.conversations.sumOf { it.unread }.takeIf { it > 0 }?.let { " · $it" }.orEmpty()}", Modifier.clickable { unreadOnly = true }.padding(vertical = 6.dp), color = if (unreadOnly) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = if (unreadOnly) FontWeight.SemiBold else FontWeight.Normal)
                    }
                    LazyColumn(state = inboxListState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 15.dp, vertical = 8.dp)) {
                        val query = state.query.trim().lowercase()
                        val conversations = state.conversations.filter { item ->
                            (!unreadOnly || item.unread > 0) && (query.isEmpty() || item.peer.name.lowercase().contains(query) || item.latest.lowercase().contains(query))
                        }
                        items(conversations, key = { it.id }) { item ->
                            Column(Modifier.animateItem()) { ConversationRow(item) { viewModel.openConversation(item) }; androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .25f), thickness = .5.dp) }
                        }
                    }
                }
            }
        } else {
            val peer = state.activePeer
            Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButton(onClick = { viewModel.closeConversation() }) { Icon(HeikaIcons.Back, "返回会话列表") }
                if (peer != null) PeerAvatar(peer)
                Column(Modifier.weight(1f).clickable(enabled = peer != null) { peer?.let { onProfile(it.id) } }) {
                    Text(peer?.name ?: "私信", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text("个人主页", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
                IconButton(onClick = { peer?.let { onProfile(it.id) } }, enabled = peer != null) { Icon(HeikaIcons.More, "会话选项") }
            }
            state.error?.let { Text(it, Modifier.padding(horizontal = 16.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
            LazyColumn(state = conversationListState, modifier = Modifier.weight(1f).fillMaxWidth(), reverseLayout = false, contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                if (state.historyHasMore) item {
                    Text(if (state.loadingHistory) "正在加载…" else "加载更早消息", Modifier.fillMaxWidth().clickable(enabled = !state.loadingHistory) { viewModel.loadOlderMessages() }.padding(9.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                }
                itemsIndexed(state.messages, key = { _, it -> it.id }) { index, message ->
                    val mine = message.senderId == state.userId
                    val day = message.createdAt.take(10)
                    val previousDay = state.messages.getOrNull(index - 1)?.createdAt?.take(10)
                    Column(Modifier.fillMaxWidth().animateItem(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (day != previousDay) Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            androidx.compose.material3.HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outline.copy(alpha = .3f))
                            Text(day, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            androidx.compose.material3.HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outline.copy(alpha = .3f))
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Bottom) {
                            if (!mine && peer != null) PeerAvatar(peer)
                            Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
                        Text(messageTime(message.createdAt), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                                Text(message.body, Modifier.clip(RoundedCornerShape(12.dp)).background(if (mine) MaterialTheme.colorScheme.primary.copy(alpha = .17f) else MaterialTheme.colorScheme.surface).padding(horizontal = 13.dp, vertical = 9.dp), color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, lineHeight = 19.sp)
                            }
                            if (mine) Text(state.userId?.take(1)?.uppercase().orEmpty(), Modifier.padding(start = 6.dp).size(32.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).padding(top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                        }
                    }
                }
                items(state.pendingMessages, key = { "pending-${it.nonce}" }) { pending ->
                    if (pending.conversationId == state.activeId && pending.failed) {
                        Text("${pending.body}  ·  发送失败，点此重试", Modifier.fillMaxWidth().clickable { viewModel.retryMessage(pending.nonce) }.padding(8.dp), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                    }
                }
                if (state.messages.isEmpty() && !state.loading) item { Text("发送第一条消息，开始交流。", Modifier.fillMaxWidth().padding(vertical = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
            }
            Row(Modifier.fillMaxWidth().imePadding().background(MaterialTheme.colorScheme.surface).padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = state.draft, onValueChange = viewModel::setDraft, modifier = Modifier.weight(1f), placeholder = { Text("发送消息") }, maxLines = 4)
                IconButton(enabled = state.draft.isNotBlank() && !state.sending, onClick = viewModel::send) {
                    if (state.sending) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Icon(HeikaIcons.Send, "发送", tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun ConversationRow(item: NativeConversation, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        PeerAvatar(item.peer)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(item.peer.name, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(item.latest.ifBlank { "开启一段新的交流" }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(messageDate(item.createdAt), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
        if (item.unread > 0) Text(item.unread.coerceAtMost(99).toString(), Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 6.dp, vertical = 3.dp), color = MaterialTheme.colorScheme.onPrimary, fontSize = 9.sp)
    }
}

private fun messageDate(value: String): String = runCatching {
    java.time.Instant.parse(value).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("M/d"))
}.getOrElse { value.take(10) }

private fun messageTime(value: String): String = runCatching {
    java.time.Instant.parse(value).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
}.getOrElse { value.takeLast(8).take(5) }

@Composable
private fun PeerRow(peer: NativePeer, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PeerAvatar(peer)
        Column {
            Text(peer.name, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            if (peer.bio.isNotBlank()) Text(peer.bio, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1)
        }
    }
}

@Composable
private fun PeerAvatar(peer: NativePeer) {
    if (peer.avatar != null) AsyncImage(peer.avatar, peer.name, imageLoader = LocalHeikaImageLoader.current, modifier = Modifier.size(43.dp).clip(CircleShape))
    else Text(peer.name.take(1), Modifier.size(43.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface).padding(top = 11.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
}
