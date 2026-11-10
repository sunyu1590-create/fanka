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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
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
import com.heika.nativeapp.ui.BackHeader

@Composable
fun MessagesScreen(
    initialConversationId: String? = null,
    initialPeerId: String? = null,
    onBack: () -> Unit,
    onProfile: (String) -> Unit,
    onLogin: () -> Unit,
    onConversationChange: (Boolean) -> Unit = {},
    viewModel: MessagesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
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
            BackHeader("消息", onBack, trailing = {
                IconButton(onClick = { viewModel.load() }) { Icon(Icons.Outlined.Refresh, "刷新消息", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            })
            if (state.error?.contains("登录") == true) {
                Column(Modifier.fillMaxWidth().padding(26.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(state.error!!, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = onLogin) { Text("登录") }
                }
            } else {
                OutlinedTextField(value = state.query, onValueChange = viewModel::search, modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp), label = { Text("搜索用户") }, singleLine = true)
                state.error?.let { Text(it, Modifier.padding(horizontal = 20.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                if (state.query.length >= 2 && state.people.isNotEmpty()) {
                    Text("用户", Modifier.padding(start = 21.dp, top = 14.dp, bottom = 5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                        items(state.people, key = { it.id }) { peer -> PeerRow(peer) { viewModel.openPeer(peer) } }
                    }
                } else if (state.loading && state.conversations.isEmpty()) {
                    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                } else if (state.conversations.isEmpty()) {
                    Column(Modifier.fillMaxWidth().padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("从一段交流开始", color = MaterialTheme.colorScheme.onBackground, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        Text("搜索昵称，找到想联系的创作者。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                    Spacer(Modifier.weight(1f))
                } else {
                    LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 15.dp, vertical = 8.dp)) {
                        items(state.conversations, key = { it.id }) { item -> ConversationRow(item) { viewModel.openConversation(item) } }
                    }
                }
            }
        } else {
            val peer = state.activePeer
            BackHeader(peer?.name ?: "私信", { viewModel.closeConversation() }, trailing = if (peer != null) ({ Text("主页", Modifier.clickable { onProfile(peer.id) }.padding(8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp) }) else null)
            state.error?.let { Text(it, Modifier.padding(horizontal = 16.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), reverseLayout = false, contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                if (state.historyHasMore) item {
                    Text(if (state.loadingHistory) "正在加载…" else "加载更早消息", Modifier.fillMaxWidth().clickable(enabled = !state.loadingHistory) { viewModel.loadOlderMessages() }.padding(9.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                }
                items(state.messages, key = { it.id }) { message ->
                    val mine = message.senderId == state.userId
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                        Text(message.body, Modifier.clip(RoundedCornerShape(15.dp)).background(if (mine) MaterialTheme.colorScheme.primary.copy(alpha = .17f) else MaterialTheme.colorScheme.surface).padding(horizontal = 13.dp, vertical = 10.dp), color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, lineHeight = 19.sp)
                    }
                }
                items(state.pendingMessages, key = { "pending-${it.nonce}" }) { pending ->
                    if (pending.conversationId == state.activeId && pending.failed) {
                        Text("${pending.body}  ·  发送失败，点此重试", Modifier.fillMaxWidth().clickable { viewModel.retryMessage(pending.nonce) }.padding(8.dp), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                    }
                }
                if (state.messages.isEmpty() && !state.loading) item { Text("发送第一条消息，开始交流。", Modifier.fillMaxWidth().padding(vertical = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
            }
            Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = state.draft, onValueChange = viewModel::setDraft, modifier = Modifier.weight(1f), placeholder = { Text("发送消息") }, maxLines = 4)
                IconButton(enabled = state.draft.isNotBlank() && !state.sending, onClick = viewModel::send) {
                    if (state.sending) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Icon(Icons.Outlined.Send, "发送", tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun ConversationRow(item: NativeConversation, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 8.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        PeerAvatar(item.peer)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(item.peer.name, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(item.latest.ifBlank { "开启一段新的交流" }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (item.unread > 0) Text(item.unread.coerceAtMost(99).toString(), Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 6.dp, vertical = 3.dp), color = MaterialTheme.colorScheme.onPrimary, fontSize = 9.sp)
    }
}

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
    if (peer.avatar != null) AsyncImage(peer.avatar, peer.name, modifier = Modifier.size(43.dp).clip(CircleShape))
    else Text(peer.name.take(1), Modifier.size(43.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface).padding(top = 11.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
}
