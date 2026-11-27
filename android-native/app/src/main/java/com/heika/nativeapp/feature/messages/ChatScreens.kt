package com.heika.nativeapp.feature.messages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.heika.nativeapp.ui.HeikaAlertDialog
import com.heika.nativeapp.ui.HeikaAvatar
import com.heika.nativeapp.ui.HeikaGlassSurface
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.HeikaSpacing
import com.heika.nativeapp.ui.HeikaType
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.LocalHeikaMotion
import org.json.JSONObject

internal const val SAFETY_NOTICE = "安全提醒：谨慎进行站外联系，注意保护个人隐私及财产安全。"
internal val QUICK_REACTIONS = listOf("👍", "❤️", "😄", "😮", "😢", "🙏")

@Composable
internal fun chatMotionMs(base: Int): Int {
    val motion = LocalHeikaMotion.current
    return HeikaMotion.scaled(base, motion.mode, motion.speed)
}

@Composable
internal fun ChatSubHeader(title: String, onBack: () -> Unit, trailing: (@Composable () -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().height(HeikaSpacing.headerHeight).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        IconButton(onClick = onBack, modifier = Modifier.size(44.dp)) {
            Icon(HeikaIcons.Back, "返回", modifier = Modifier.size(22.dp), tint = MaterialTheme.colorScheme.onBackground)
        }
        Text(title, Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = HeikaType.headerTitle, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        trailing?.invoke()
    }
}

@Composable
internal fun ChatToggleRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String? = null,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable { onCheckedChange(!checked) }.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(Modifier.weight(1f)) {
            Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
            subtitle?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp) }
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
internal fun ChatEntryRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String? = null, badge: Int = 0, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(Modifier.weight(1f)) {
            Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
            subtitle?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp) }
        }
        if (badge > 0) {
            Text(badge.coerceAtMost(99).toString(), Modifier.clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.primary).padding(horizontal = 7.dp, vertical = 2.dp), color = MaterialTheme.colorScheme.onPrimary, fontSize = 10.sp)
        }
        Icon(HeikaIcons.Forward, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun ChatSectionTitle(text: String) {
    Text(text, Modifier.fillMaxWidth().padding(start = 16.dp, top = 16.dp, bottom = 6.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
}

@Composable
internal fun ChatChoiceChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        Modifier.clip(RoundedCornerShape(14.dp))
            .background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .16f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 12.sp,
        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
    )
}

/** 装扮预览用的颜色全部从 colorScheme 派生，不硬编码色值。 */
@Composable
internal fun chatDecorationColors(theme: String, bubble: String): Pair<androidx.compose.ui.graphics.Color, androidx.compose.ui.graphics.Color> {
    val scheme = MaterialTheme.colorScheme
    val background = when (theme) {
        "paper" -> scheme.background
        "ocean" -> scheme.surface
        "twilight" -> scheme.surfaceVariant
        else -> scheme.background
    }
    val bubbleTint = when (bubble) {
        "amber" -> scheme.primary
        "teal" -> scheme.secondary
        "violet" -> scheme.tertiary
        else -> scheme.primary
    }
    return background to bubbleTint
}

// ---------------------------------------------------------------------------
// 会话详情设置
// ---------------------------------------------------------------------------

@Composable
internal fun ChatSettingsScreen(
    state: MessagesState,
    onBack: () -> Unit,
    onOpenMedia: () -> Unit,
    onOpenRequests: () -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenPrivacy: () -> Unit,
    viewModel: MessagesViewModel,
) {
    val room = state.activeId
    var confirmArchive by remember { mutableStateOf(false) }
    var confirmUnread by remember { mutableStateOf(false) }
    LaunchedEffect(room) { if (room != null) viewModel.loadActiveSettings(room) }
    val settings = state.activeSettings
    val decor = state.decoration
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        ChatSubHeader("聊天设置", onBack)
        LazyColumn(Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 28.dp)) {
            item { ChatSectionTitle("会话管理") }
            item {
                ChatToggleRow(HeikaIcons.StarFilled, "置顶会话", "置顶后显示在消息列表顶部", settings?.pinned ?: false) { viewModel.togglePin(room) }
                ChatToggleRow(HeikaIcons.VolumeOff, "免打扰", "关闭该会话的新消息提示", settings?.muted ?: false) { viewModel.setMuted(room, it) }
                ChatToggleRow(HeikaIcons.Info, "标记为未读", "下次进入时显示未读标记", settings?.manualUnread ?: false) { confirmUnread = true }
                ChatEntryRow(HeikaIcons.Storage, "归档此会话", "归档后不再出现在消息列表", onClick = { confirmArchive = true })
            }
            item { ChatSectionTitle("聊天装扮") }
            item {
                val (previewBackground, bubbleTint) = chatDecorationColors(decor.theme, decor.bubble)
                Box(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
                        .clip(RoundedCornerShape(16.dp)).background(previewBackground)
                        .padding(18.dp),
                ) {
                    Column(horizontalAlignment = Alignment.End, modifier = Modifier.fillMaxWidth()) {
                        Text("这是一条消息预览", Modifier.clip(RoundedCornerShape(14.dp)).background(bubbleTint.copy(alpha = .24f)).padding(horizontal = 12.dp, vertical = 9.dp), color = MaterialTheme.colorScheme.onSurface, fontSize = (14f * decor.scale).sp)
                        Text("10:24", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    }
                }
                Text("主题", Modifier.padding(start = 16.dp, top = 6.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    ChatDecoration.THEMES.forEach { theme ->
                        ChatChoiceChip(ChatDecoration.THEME_NAMES[theme] ?: theme, decor.theme == theme) { viewModel.setDecoration(theme = theme) }
                    }
                }
                Text("气泡颜色", Modifier.padding(start = 16.dp, top = 6.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    ChatDecoration.BUBBLES.forEach { bubble ->
                        ChatChoiceChip(ChatDecoration.BUBBLE_NAMES[bubble] ?: bubble, decor.bubble == bubble) { viewModel.setDecoration(bubble = bubble) }
                    }
                }
                Text("字号", Modifier.padding(start = 16.dp, top = 6.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    val labels = listOf("标准", "稍大", "大", "超大")
                    ChatDecoration.SCALES.forEachIndexed { index, scale ->
                        ChatChoiceChip(labels.getOrElse(index) { "${scale}x" }, decor.scale == scale) { viewModel.setDecoration(scale = scale) }
                    }
                }
            }
            item { ChatSectionTitle("更多") }
            item {
                ChatEntryRow(HeikaIcons.Image, "聊天媒体资源库", "图片、视频、文件与分享内容") { onOpenMedia() }
                ChatEntryRow(HeikaIcons.SaveFilled, "消息收藏", "查看收藏的消息") { onOpenFavorites() }
                ChatEntryRow(HeikaIcons.UserSearch, "陌生人消息请求", "收到的请求与发出请求", state.pendingRequestCount) { onOpenRequests() }
                ChatEntryRow(HeikaIcons.Privacy, "隐私与已读设置", "谁可以私信、已读回执与输入状态") { onOpenPrivacy() }
            }
        }
    }
    if (confirmArchive) {
        HeikaAlertDialog(
            onDismissRequest = { confirmArchive = false },
            title = { Text("归档会话") },
            text = { Text("归档后该会话不再出现在消息列表，对方仍可继续发消息。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp) },
            confirmButton = { TextButton(onClick = { confirmArchive = false; viewModel.setArchived(room, true) }) { Text("归档") } },
            dismissButton = { TextButton(onClick = { confirmArchive = false }) { Text("取消") } },
        )
    }
    if (confirmUnread) {
        HeikaAlertDialog(
            onDismissRequest = { confirmUnread = false },
            title = { Text("标记为未读") },
            text = { Text("该会话将显示未读标记，直到你再次打开它。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp) },
            confirmButton = { TextButton(onClick = { confirmUnread = false; viewModel.markUnread(room, true) }) { Text("标记") } },
            dismissButton = { TextButton(onClick = { confirmUnread = false }) { Text("取消") } },
        )
    }
}

// ---------------------------------------------------------------------------
// 隐私与已读
// ---------------------------------------------------------------------------

@Composable
internal fun ChatPrivacyScreen(state: MessagesState, onBack: () -> Unit, viewModel: MessagesViewModel) {
    LaunchedEffect(Unit) { viewModel.loadPrivacy() }
    val privacy = state.privacy
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        ChatSubHeader("隐私与已读", onBack)
        if (privacy == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(Modifier.weight(1f)) {
                item { ChatSectionTitle("私信权限") }
                item {
                    val choices = listOf("everyone" to "所有人", "mutual" to "互相关注", "nobody" to "不接收私信")
                    choices.forEach { (value, label) ->
                        Row(Modifier.fillMaxWidth().clickable { viewModel.updatePrivacy(JSONObject().put("dm_permission", value)) }.padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(label, Modifier.weight(1f), color = if (privacy.dmPermission == value) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                            if (privacy.dmPermission == value) Icon(HeikaIcons.Check, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
                item { ChatSectionTitle("互动设置") }
                item {
                    ChatToggleRow(HeikaIcons.Check, "已读回执", "对方可以看到消息是否已读", privacy.readReceipt) { viewModel.updatePrivacy(JSONObject().put("read_receipt", it)) }
                    ChatToggleRow(HeikaIcons.TextFields, "输入状态", "双方可以看到对方正在输入", privacy.typingIndicator) { viewModel.updatePrivacy(JSONObject().put("typing_indicator", it)) }
                }
                item { ChatSectionTitle("在线状态可见范围") }
                item {
                    val choices = listOf("everyone" to "所有人", "following" to "我关注的人", "nobody" to "不公开")
                    choices.forEach { (value, label) ->
                        Row(Modifier.fillMaxWidth().clickable { viewModel.updatePrivacy(JSONObject().put("online_visibility", value)) }.padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(label, Modifier.weight(1f), color = if (privacy.onlineVisibility == value) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                            if (privacy.onlineVisibility == value) Icon(HeikaIcons.Check, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 媒体资源库
// ---------------------------------------------------------------------------

@Composable
internal fun ChatMediaLibraryScreen(state: MessagesState, onBack: () -> Unit, viewModel: MessagesViewModel) {
    var preview by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(state.mediaKind) { viewModel.loadMedia(state.mediaKind) }
    val kinds = listOf("all" to "全部", "image" to "图片", "video" to "视频", "file" to "文件", "work" to "作品", "collection" to "合集")
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        ChatSubHeader("聊天资源库", onBack)
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            kinds.forEach { (value, label) -> ChatChoiceChip(label, state.mediaKind == value) { viewModel.loadMedia(value) } }
        }
        if (state.loadingMedia && state.mediaItems.isEmpty()) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.mediaItems, key = { it.id }) { item ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .5f))
                            .clickable { item.url?.let { preview = it } }
                            .padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(11.dp),
                    ) {
                        if (!item.url.isNullOrBlank() && item.messageType in setOf("image", "video")) {
                            AsyncImage(model = item.url, contentDescription = null, contentScale = ContentScale.Crop, imageLoader = LocalHeikaImageLoader.current, modifier = Modifier.size(52.dp).clip(RoundedCornerShape(9.dp)))
                        } else {
                            Box(Modifier.size(52.dp).clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.surface), contentAlignment = Alignment.Center) {
                                Icon(if (item.messageType == "work" || item.messageType == "collection") HeikaIcons.Bag else HeikaIcons.Content, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
                            }
                        }
                        Column(Modifier.weight(1f)) {
                            Text(item.body.ifBlank { "分享内容" }, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(messageDate(item.createdAt), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                    }
                }
                if (state.mediaItems.isEmpty()) item { Text("该会话还没有相关资源", Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
            }
        }
    }
    preview?.let { url ->
        androidx.compose.ui.window.Dialog(onDismissRequest = { preview = null }) {
            Box(Modifier.fillMaxWidth().heightIn(max = 520.dp).clickable { preview = null }, contentAlignment = Alignment.Center) {
                AsyncImage(model = url, contentDescription = "资源预览", contentScale = ContentScale.Fit, imageLoader = LocalHeikaImageLoader.current, modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp))
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 陌生人消息请求
// ---------------------------------------------------------------------------

@Composable
internal fun ChatRequestsScreen(
    state: MessagesState,
    onBack: () -> Unit,
    viewModel: MessagesViewModel,
    onOpenConversation: (String) -> Unit,
) {
    var tab by remember { mutableStateOf(0) }
    var peerId by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { viewModel.loadRequests() }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        ChatSubHeader("消息请求", onBack)
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ChatChoiceChip("收到的 · ${state.pendingRequestCount}", tab == 0) { tab = 0 }
            ChatChoiceChip("发出的 · ${state.requestsSent.size}", tab == 1) { tab = 1 }
        }
        if (state.loadingRequests && state.requestsReceived.isEmpty()) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (tab == 0) {
                    items(state.requestsReceived, key = { it.id }) { request ->
                        HeikaGlassSurface(hazeState = null, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), drawTopHighlight = false) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                                HeikaAvatar(request.peer.avatar, request.peer.name, 38.dp)
                                Column(Modifier.weight(1f)) {
                                    Text(request.peer.name, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                    Text(request.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                                    request.safetyFlag?.let { SafetyNoticeText() }
                                }
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                TextButton(onClick = { viewModel.updateRequest(request.id, "ignored") }) { Text("忽略") }
                                TextButton(onClick = { viewModel.updateRequest(request.id, "deleted") }) { Text("删除") }
                                Button(onClick = {
                                    viewModel.acceptRequest(request.id, request.peer)
                                    onBack()
                                }) { Text("接受") }
                            }
                        }
                    }
                    if (state.requestsReceived.isEmpty()) item { Text("暂时没有收到新的私信请求", Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
                } else {
                    items(state.requestsSent, key = { it.id }) { request ->
                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                            HeikaAvatar(request.peer.avatar, request.peer.name, 36.dp)
                            Column(Modifier.weight(1f)) {
                                Text(request.peer.name, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp)
                                Text(request.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            Text(when (request.status) { "pending" -> "待处理"; "accepted" -> "已接受"; "ignored" -> "已忽略"; else -> request.status }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                        }
                    }
                    if (state.requestsSent.isEmpty()) item { Text("还没有发出私信请求", Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
                }
                item {
                    Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("发起私信请求", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        TextField(value = peerId, onValueChange = { peerId = it.take(60) }, modifier = Modifier.fillMaxWidth(), singleLine = true, label = { Text("对方用户编号") })
                        TextField(value = content, onValueChange = { content = it.take(200) }, modifier = Modifier.fillMaxWidth().heightIn(min = 72.dp), label = { Text("附言") })
                        Button(onClick = { viewModel.sendRequest(peerId.trim(), content); peerId = ""; content = "" }, enabled = peerId.isNotBlank() && content.isNotBlank()) { Text("发送请求") }
                    }
                }
            }
        }
    }
}

@Composable
internal fun SafetyNoticeText() {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 3.dp)) {
        Icon(HeikaIcons.Shield, contentDescription = null, tint = MaterialTheme.colorScheme.primary.copy(alpha = .7f), modifier = Modifier.size(11.dp))
        Text(SAFETY_NOTICE, color = MaterialTheme.colorScheme.primary.copy(alpha = .8f), fontSize = 10.sp, lineHeight = 13.sp, maxLines = 2)
    }
}

// ---------------------------------------------------------------------------
// 收藏
// ---------------------------------------------------------------------------

@Composable
internal fun ChatFavoritesScreen(
    state: MessagesState,
    onBack: () -> Unit,
    viewModel: MessagesViewModel,
    onOpenConversation: (String) -> Unit,
) {
    LaunchedEffect(Unit) { viewModel.loadFavorites() }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        ChatSubHeader("消息收藏", onBack)
        if (state.loadingFavorites && state.favorites.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.favorites, key = { it.messageId }) { favorite ->
                    val room = favorite.message?.conversationId
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .5f))
                            .clickable(enabled = !room.isNullOrBlank()) { if (!room.isNullOrBlank()) { onOpenConversation(room); onBack() } }
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        if (favorite.unavailable || favorite.message == null) {
                            Text("原消息已删除或撤回", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        } else {
                            Text(favorite.message.body, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
                            Text(messageDate(favorite.message.createdAt), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                    }
                }
                if (state.favorites.isEmpty()) item { Text("还没有收藏的消息", Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 聊天记录搜索
// ---------------------------------------------------------------------------

@Composable
internal fun ChatSearchScreen(
    state: MessagesState,
    onBack: () -> Unit,
    initialQuery: String,
    scopeConversationId: String?,
    viewModel: MessagesViewModel,
    onOpenConversation: (String) -> Unit,
) {
    var query by remember { mutableStateOf(initialQuery) }
    var scope by remember { mutableStateOf(scopeConversationId) }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        ChatSubHeader("搜索聊天记录", onBack)
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextField(value = query, onValueChange = { query = it.take(60) }, modifier = Modifier.weight(1f), singleLine = true, label = { Text("搜索消息内容") })
            Button(onClick = { viewModel.searchMessages(query, scope) }, enabled = query.trim().length >= 1) { Text("搜索") }
        }
        Row(Modifier.padding(horizontal = 14.dp, vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            ChatChoiceChip("全部会话", scope == null) { scope = null }
            if (scopeConversationId != null) ChatChoiceChip("当前会话", scope == scopeConversationId) { scope = scopeConversationId }
        }
        if (state.searchingMessages) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.searchResults, key = { it.id }) { hit ->
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .5f))
                            .clickable { onOpenConversation(hit.conversationId); onBack() }
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(hit.peerName, color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Text(hit.body, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        Text(messageDate(hit.createdAt), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    }
                }
                if (state.searchResults.isEmpty() && query.isNotBlank()) {
                    item { Text("没有找到相关消息", Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
                }
            }
        }
    }
}
