package com.heika.nativeapp.feature.notifications

import com.heika.nativeapp.ui.HeikaIcons
import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.heika.nativeapp.HeikaApplication
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaAvatar
import com.heika.nativeapp.ui.HeikaNoticeBus

@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    onLogin: () -> Unit,
    onContent: (String, Boolean) -> Unit,
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    var permissionRefresh by remember { mutableIntStateOf(0) }
    var selectedFilter by remember { mutableStateOf("all") }
    val filteredItems = remember(state.items, selectedFilter) {
        state.items.filter { item ->
            when (selectedFilter) {
                "social" -> item.type in setOf("comment", "reply", "like", "bookmark")
                "moderation" -> item.type == "moderation"
                "unread" -> item.readAt == null
                else -> true
            }
        }
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { permissionRefresh++ }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) permissionRefresh++ }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(Unit) { viewModel.load() }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("通知中心", onBack) {
            androidx.compose.material3.IconButton(onClick = { viewModel.load(force = true) }, enabled = !state.refreshing) {
                Icon(HeikaIcons.Retry, contentDescription = "刷新", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 21.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("${state.unread} 条未读", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                Text("最近动态", color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
            }
            if (state.unread > 0) Text("全部已读", Modifier.clickable(onClick = viewModel::markAllRead).padding(8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            listOf("all" to "全部", "social" to "互动", "moderation" to "审核", "unread" to "未读").forEach { (key, label) ->
                val selected = selectedFilter == key
                Text(
                    label,
                    Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp))
                        .background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .14f) else MaterialTheme.colorScheme.surface.copy(alpha = .42f))
                        .clickable {
                            if (selectedFilter != key) {
                                selectedFilter = key
                                HeikaNoticeBus.showSelection("通知筛选：$label")
                            }
                        }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                )
            }
        }
        SystemPermissionNotice(context = context, refreshKey = permissionRefresh, onRequest = {
            if (Build.VERSION.SDK_INT >= 33) permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            else openNotificationSettings(context)
        })
        Text(
            "此处同步黑卡账号的站内通知；远程系统推送服务尚未接通。",
            Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 4.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 10.sp,
        )
        state.error?.let { Text(it, Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
        when {
            state.loading && state.items.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(23.dp), color = MaterialTheme.colorScheme.primary, strokeWidth = 2.dp) }
            !state.signedIn -> Column(Modifier.fillMaxWidth().padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("登录后查看评论、回复和互动通知。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                Text("登录 / 注册", Modifier.clickable(onClick = onLogin).padding(8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            state.items.isEmpty() -> Column(Modifier.fillMaxWidth().padding(35.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Icon(HeikaIcons.Notifications, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(32.dp))
                Text("暂时没有新通知", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            }
            filteredItems.isEmpty() -> Text(
                if (selectedFilter == "unread") "没有未读通知" else "该分类暂无通知",
                Modifier.fillMaxWidth().padding(35.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
            )
            else -> LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(0.dp)) {
                items(filteredItems, key = { it.id }) { item ->
                    Column {
                        NotificationRow(item, onClick = {
                            if (item.readAt == null) viewModel.markRead(item.id)
                            item.postId?.let { onContent(it, true) } ?: item.actorId?.let { onContent(it, false) }
                        })
                        androidx.compose.material3.HorizontalDivider(Modifier.padding(start = 72.dp, end = 18.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = .28f), thickness = .5.dp)
                    }
                }
                item { Text("目前显示 ${filteredItems.size} 条通知", Modifier.fillMaxWidth().padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
            }
        }
    }
}

private fun openNotificationSettings(context: Context) {
    val intent = android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName)
    runCatching { context.startActivity(intent) }.onFailure {
        context.startActivity(android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:${context.packageName}")))
    }
}

@Composable
fun SystemPermissionNotice(context: Context, refreshKey: Int = 0, onRequest: () -> Unit) {
    val enabled = remember(context, refreshKey) { NotificationManagerCompat.from(context).areNotificationsEnabled() }
    val channelEnabled = remember(context, refreshKey) { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.getSystemService(NotificationManager::class.java).getNotificationChannel(HeikaApplication.NOTIFICATION_CHANNEL_ID)?.importance != NotificationManager.IMPORTANCE_NONE
    } else true }
    if (!enabled || !channelEnabled) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 21.dp, vertical = 8.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).clickable(onClick = onRequest).padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(HeikaIcons.Notifications, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            Column(Modifier.weight(1f).padding(horizontal = 11.dp)) {
                Text("系统通知未开启", color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Text("点击查看 Android 通知权限", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
            }
            Text("设置", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
        }
    }
}

@Composable
private fun NotificationRow(item: com.heika.nativeapp.data.HeikaNotification, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick)
            .background(if (item.readAt == null) MaterialTheme.colorScheme.surface.copy(alpha = .30f) else MaterialTheme.colorScheme.background)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(11.dp),
        verticalAlignment = Alignment.Top,
    ) {
        HeikaAvatar(item.actorAvatar, item.actorName, 40.dp, contentDescription = "${item.actorName}头像")
        Column(Modifier.weight(1f)) {
            val action = when (item.type) {
                "comment" -> "评论了你的作品"
                "reply" -> "回复了你的评论"
                "like" -> "赞了你的作品"
                "bookmark" -> "收藏了你的作品"
                "moderation" -> "有一条内容审核通知"
                else -> item.title.ifBlank { "有一条新动态" }
            }
            Text("${item.actorName}　$action", color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, lineHeight = 18.sp)
            Text(item.postTitle ?: item.title.ifBlank { "打开查看动态" }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
            Text(item.createdAt.take(16).replace('T', ' '), color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .72f), fontSize = 10.sp, modifier = Modifier.padding(top = 5.dp))
        }
        if (item.readAt == null) Box(Modifier.padding(top = 5.dp).size(6.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
    }
}
