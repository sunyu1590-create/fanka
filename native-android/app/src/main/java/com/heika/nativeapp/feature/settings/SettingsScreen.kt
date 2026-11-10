package com.heika.nativeapp.feature.settings

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ColorLens
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.FilterChip
import java.util.Locale

data class SettingsEntry(val key: String, val title: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val SettingGroups = listOf(
    "账号" to listOf(SettingsEntry("account", "账号与安全", Icons.Outlined.AccountCircle), SettingsEntry("membership", "会员与支持", Icons.Outlined.StarOutline)),
    "偏好" to listOf(SettingsEntry("appearance", "外观与阅读", Icons.Outlined.ColorLens), SettingsEntry("notifications", "通知与消息", Icons.Outlined.NotificationsNone), SettingsEntry("storage", "存储与缓存", Icons.Outlined.Storage)),
    "其他" to listOf(SettingsEntry("privacy", "隐私与权限", Icons.Outlined.PrivacyTip), SettingsEntry("about", "关于黑卡", Icons.Outlined.Info)),
)

@Composable
fun SettingsScreen(onBack: () -> Unit, onSection: (String) -> Unit) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("设置", onBack)
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, top = 8.dp, end = 20.dp, bottom = 110.dp)) {
            SettingGroups.forEach { (heading, entries) ->
                item(key = "heading-$heading") {
                    Text(heading, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 22.dp, bottom = 9.dp))
                }
                item(key = "group-$heading") {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 12.dp)) {
                        entries.forEachIndexed { index, entry ->
                            Row(
                                Modifier.fillMaxWidth().clickable { onSection(entry.key) }.padding(vertical = 11.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                androidx.compose.material3.Icon(
                                    entry.icon,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(8.dp),
                                )
                                Text(entry.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                                IconChevron()
                            }
                            if (index < entries.lastIndex) androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .42f), modifier = Modifier.padding(start = 48.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun IconChevron() = androidx.compose.material3.Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .7f), modifier = Modifier.size(18.dp))

@Composable
fun SettingsDetailScreen(
    section: String,
    onBack: () -> Unit,
    onAccount: () -> Unit,
    onEditProfile: () -> Unit,
    onMembership: () -> Unit,
    onAbout: () -> Unit,
    onNotifications: () -> Unit,
    onSection: (String) -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val theme by viewModel.theme.collectAsStateWithLifecycle()
    val layout by viewModel.feedLayout.collectAsStateWithLifecycle()
    val reading by viewModel.readingMode.collectAsStateWithLifecycle()
    val pageTransition by viewModel.pageTransition.collectAsStateWithLifecycle()
    val fontChoice by viewModel.fontChoice.collectAsStateWithLifecycle()
    val capacity by viewModel.imageCacheMb.collectAsStateWithLifecycle()
    val comments by viewModel.commentsEnabled.collectAsStateWithLifecycle()
    val notificationError by viewModel.notificationError.collectAsStateWithLifecycle()
    val notificationsLoading by viewModel.notificationsLoading.collectAsStateWithLifecycle()
    val cacheBytes by viewModel.cacheBytes.collectAsStateWithLifecycle()
    val cacheClearing by viewModel.cacheClearing.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val bookmarksVisible by viewModel.bookmarksVisible.collectAsStateWithLifecycle()
    val privacyLoading by viewModel.privacyLoading.collectAsStateWithLifecycle()
    val privacyError by viewModel.privacyError.collectAsStateWithLifecycle()
    var permissionRefresh by remember { mutableIntStateOf(0) }
    val notificationsAllowed = remember(context, permissionRefresh) { NotificationManagerCompat.from(context).areNotificationsEnabled() }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { permissionRefresh++ }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) permissionRefresh++ }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(section) {
        if (section == "notifications") viewModel.loadNotificationSettings()
        if (section == "storage") viewModel.refreshCacheUsage()
        if (section == "privacy") viewModel.loadPrivacySettings()
    }
    val title = SettingGroups.flatMap { it.second }.firstOrNull { it.key == section }?.title ?: when (section) {
        "transition" -> "页面切换动画"
        "font" -> "字体"
        else -> "设置"
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(title, onBack)
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, top = 7.dp, end = 20.dp, bottom = 110.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            when (section) {
                "account" -> {
                    item { SettingAction("编辑个人资料", "更新头像、昵称和简介", onEditProfile) }
                    item { SettingAction("账号与安全", "查看当前登录状态、切换账号或退出", onAccount) }
                    item { SettingAction("会员与支持", "查看账号当前权益", onMembership) }
                }
                "membership" -> item { SettingAction("会员与支持中心", "打开黑卡现有会员与支持页面", onMembership) }
                "appearance" -> {
                    item { DetailHeading("主题") }
                    item { ChoiceRow(listOf("system" to "跟随系统", "light" to "浅色", "dark" to "深色"), theme, viewModel::setTheme) }
                    item { DetailHeading("内容布局") }
                    item { ChoiceRow(listOf("waterfall" to "双列瀑布流", "single" to "单列列表"), layout, viewModel::setFeedLayout) }
                    item { DetailHeading("阅读偏好") }
                    item { ChoiceRow(listOf("standard" to "标准", "focus" to "专注", "night" to "夜读"), reading, viewModel::setReadingMode) }
                    item { DetailHeading("交互") }
                    item { SettingAction("页面切换动画", transitionLabel(pageTransition), { onSection("transition") }) }
                    item { SettingAction("字体", "系统默认", { onSection("font") }) }
                }
                "transition" -> {
                    item { DetailHeading("选择页面切换方式") }
                    item { ChoiceList(listOf("lift" to "上下浮", "crossfade" to "叠化", "shared" to "连续开关"), pageTransition, viewModel::setPageTransition) }
                }
                "font" -> {
                    item { DetailHeading("字体") }
                    item { ChoiceList(listOf("system" to "系统默认"), fontChoice, viewModel::setFontChoice) }
                }
                "notifications" -> {
                    item { SettingAction("Android 系统通知", if (notificationsAllowed) "系统通知权限已开启" else "系统通知权限未开启", { requestOrOpenNotificationPermission(context, permissionLauncher::launch) }) }
                    item { DetailHeading("站内通知偏好") }
                    item { SwitchSetting("评论与回复", if (notificationsLoading) "正在读取网站账号偏好…" else "此开关与网站账号偏好同步", comments == true, enabled = comments != null) { viewModel.setCommentsEnabled(it) } }
                    notificationError?.let { error -> item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(error, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                            TextButton(onClick = { viewModel.loadNotificationSettings(force = true) }) { Text("重试") }
                        }
                    } }
                    item { Text("当前后端偏好接口仅提供评论与回复提醒；点赞、收藏和私信的独立偏好尚未接入。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 17.sp, modifier = Modifier.padding(vertical = 10.dp)) }
                    item { SettingAction("通知中心", "查看站内通知与未读状态", onNotifications) }
                }
                "storage" -> {
                    item { DetailHeading("图片磁盘缓存") }
                    item { Text("${formatBytes(cacheBytes)} / $capacity MB", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 8.dp)) }
                    item { ChoiceRow(listOf("256" to "256 MB", "512" to "512 MB"), capacity.toString()) { viewModel.setCacheCapacity(it.toInt()) } }
                    item { SettingAction(if (cacheClearing) "正在清理…" else "清理图片缓存", "只清理可重新下载的图片，不影响翻卡记录、草稿与账号资料", { if (!cacheClearing) viewModel.clearImageCache() }, enabled = !cacheClearing) }
                    message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, modifier = Modifier.padding(vertical = 8.dp)) } }
                }
                "privacy" -> {
                    item { SettingAction("系统应用权限", "在 Android 设置中查看和管理 HEIKA 权限", { openAppSettings(context) }) }
                    item { DetailHeading("账号隐私偏好") }
                    item { SwitchSetting("公开我的收藏", if (privacyLoading) "正在读取账号设置…" else "与当前 HEIKA 账号的公开设置同步", bookmarksVisible == true, enabled = bookmarksVisible != null && !privacyLoading) { viewModel.setBookmarksVisible(it) } }
                    privacyError?.let { error -> item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(error, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                            TextButton(onClick = { viewModel.loadPrivacySettings(force = true) }) { Text("重试") }
                        }
                    } }
                    item { Text("用户协议与隐私政策暂未在当前网站提供可用文本入口；因此此处不展示无效链接。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 17.sp, modifier = Modifier.padding(vertical = 12.dp)) }
                }
                "about" -> item { SettingAction("关于黑卡", "版本、项目链接与意见反馈", onAbout) }
            }
        }
    }
}

@Composable
private fun DetailHeading(title: String) {
    Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 17.dp, bottom = 6.dp))
}

@Composable
private fun ChoiceRow(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        options.forEach { (value, label) -> FilterChip(label, selected == value, { onSelect(value) }, Modifier.weight(1f)) }
    }
}

@Composable
private fun ChoiceList(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 12.dp)) {
        options.forEachIndexed { index, (value, title) ->
            Row(
                Modifier.fillMaxWidth().clickable { onSelect(value) }.padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                RadioButton(selected = selected == value, onClick = { onSelect(value) })
            }
            if (index < options.lastIndex) androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .38f))
        }
    }
}

private fun transitionLabel(value: String) = when (value) {
    "crossfade" -> "叠化"
    "shared" -> "连续开关"
    else -> "上下浮"
}

@Composable
private fun SettingAction(title: String, subtitle: String, onClick: () -> Unit, enabled: Boolean = true) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(enabled, onClick = onClick).padding(vertical = 13.dp, horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 3.dp))
        }
        IconChevron()
    }
}

@Composable
private fun SwitchSetting(title: String, subtitle: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
        }
        Switch(checked = checked, enabled = enabled, onCheckedChange = onChange)
    }
}

private fun requestOrOpenNotificationPermission(context: Context, launch: (String) -> Unit) {
    if (Build.VERSION.SDK_INT >= 33 && !NotificationManagerCompat.from(context).areNotificationsEnabled()) {
        val activity = context as? Activity
        if (activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)) openNotificationSettings(context)
        else launch(Manifest.permission.POST_NOTIFICATIONS)
    } else openNotificationSettings(context)
}

private fun openNotificationSettings(context: Context) {
    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    runCatching { context.startActivity(intent) }.onFailure { openAppSettings(context) }
}

private fun openAppSettings(context: Context) {
    context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
}

private fun formatBytes(value: Long) = String.format(Locale.US, "%.1f MB", value / (1024f * 1024f))
