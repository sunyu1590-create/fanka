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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material.icons.outlined.ArrowForwardIos
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.TextFields
import androidx.compose.material.icons.outlined.ViewAgenda
import androidx.compose.material.icons.outlined.AutoAwesomeMotion
import androidx.compose.material.icons.outlined.FontDownload
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Policy
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Feedback
import androidx.compose.material.icons.outlined.Image
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
import androidx.compose.runtime.mutableStateOf
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
import androidx.hilt.navigation.compose.hiltViewModel
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
    val viewModel: SettingsViewModel = hiltViewModel()
    val adminAccess by viewModel.adminAccess.collectAsStateWithLifecycle()
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
            if (adminAccess == true) {
                item(key = "admin-entry-heading") { Text("管理", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 22.dp, bottom = 9.dp)) }
                item(key = "admin-entry") {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 12.dp)) {
                        Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).clickable { onSection("admin") }.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            androidx.compose.material3.Icon(com.heika.nativeapp.ui.HeikaIcons.Settings, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(21.dp))
                            Text("管理员中心", Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            IconChevron()
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
    val privacyData by viewModel.privacyData.collectAsStateWithLifecycle()
    val recoveryCodes by viewModel.recoveryCodes.collectAsStateWithLifecycle()
    val recoveryCodesLoading by viewModel.recoveryCodesLoading.collectAsStateWithLifecycle()
    var permissionRefresh by remember { mutableIntStateOf(0) }
    var pendingNotesPrivate by remember { mutableStateOf<Boolean?>(null) }
    var recoveryConfirm by remember { mutableStateOf(false) }
    var recoveryCodesOpen by remember { mutableStateOf(false) }
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
        if (section.startsWith("privacy")) viewModel.loadPrivacySettings()
    }
    LaunchedEffect(recoveryCodes) { if (recoveryCodes.isNotEmpty()) recoveryCodesOpen = true }
    val title = SettingGroups.flatMap { it.second }.firstOrNull { it.key == section }?.title ?: when (section) {
        "transition" -> "页面切换动画"
        "font" -> "字体"
        "privacy-dm" -> "私信接收范围"
        "privacy-blocked" -> "黑名单"
        "theme" -> "主题模式"
        "layout" -> "内容布局"
        "reading" -> "阅读模式"
        "cache-capacity" -> "缓存容量"
        else -> "设置"
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(title, onBack)
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, top = 7.dp, end = 20.dp, bottom = 110.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            when (section) {
                "account" -> {
                    item { SettingAction("编辑个人资料", "更新头像、昵称和简介", onEditProfile) }
                    item { SettingAction("账号与安全", "查看当前登录状态、切换账号或退出", onAccount) }
                    item { SettingAction(if (recoveryCodesLoading) "正在生成…" else "生成账号恢复码", "生成后旧恢复码将失效，请妥善保存", { if (!recoveryCodesLoading) recoveryConfirm = true }, enabled = !recoveryCodesLoading) }
                    item { SettingAction("会员与支持", "查看账号当前权益", onMembership) }
                    privacyError?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error, fontSize = 11.sp, modifier = Modifier.padding(vertical = 8.dp)) } }
                }
                "membership" -> item { SettingAction("会员与支持中心", "打开黑卡现有会员与支持页面", onMembership) }
                "appearance" -> {
                    item { SettingAction("主题模式", themeLabel(theme), { onSection("theme") }) }
                    item { SettingAction("内容布局", layoutLabel(layout), { onSection("layout") }) }
                    item { SettingAction("阅读模式", readingLabel(reading), { onSection("reading") }) }
                    item { SettingAction("页面切换动画", transitionLabel(pageTransition), { onSection("transition") }) }
                    item { SettingAction("字体", "系统默认", { onSection("font") }) }
                }
                "theme" -> item { ChoiceList(listOf("system" to "跟随系统", "light" to "浅色", "dark" to "深色"), theme, viewModel::setTheme) }
                "layout" -> item { ChoiceList(listOf("waterfall" to "双列瀑布流", "single" to "单列列表"), layout, viewModel::setFeedLayout) }
                "reading" -> item { ChoiceList(listOf("standard" to "标准", "focus" to "专注", "night" to "夜读"), reading, viewModel::setReadingMode) }
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
                    item { SettingAction("图片磁盘缓存", "${formatBytes(cacheBytes)} / $capacity MB", { onSection("cache-capacity") }) }
                    item { SettingAction(if (cacheClearing) "正在清理…" else "清理图片缓存", "只清理可重新下载的图片，不影响翻卡记录、草稿与账号资料", { if (!cacheClearing) viewModel.clearImageCache() }, enabled = !cacheClearing) }
                    message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, modifier = Modifier.padding(vertical = 8.dp)) } }
                }
                "cache-capacity" -> item { ChoiceList(listOf("256" to "256 MB", "512" to "512 MB"), capacity.toString()) { viewModel.setCacheCapacity(it.toInt()) } }
                "privacy" -> {
                    item { SettingAction("系统应用权限", "在 Android 设置中查看和管理 HEIKA 权限", { openAppSettings(context) }) }
                    item { DetailHeading("账号隐私偏好") }
                    item { SwitchSetting("公开我的收藏", if (privacyLoading) "正在读取账号设置…" else "与当前 HEIKA 账号的公开设置同步", bookmarksVisible == true, enabled = bookmarksVisible != null && !privacyLoading) { viewModel.setBookmarksVisible(it) } }
                    item { SwitchSetting("作品仅自己可见", "控制个人作品的公开范围", privacyData?.optBoolean("notes_private") == true, enabled = privacyData != null && !privacyLoading) { pendingNotesPrivate = it } }
                    item { SettingAction("私信接收范围", if (privacyLoading) "正在读取账号设置…" else if (privacyData?.optString("dm_permission") == "nobody") "不接收私信" else "所有人可私信", { onSection("privacy-dm") }, enabled = privacyData != null) }
                    item { SettingAction("黑名单", "管理已屏蔽的账号", { onSection("privacy-blocked") }) }
                    privacyError?.let { error -> item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(error, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                            TextButton(onClick = { viewModel.loadPrivacySettings(force = true) }) { Text("重试") }
                        }
                    } }
                }
                "privacy-dm" -> item { ChoiceList(listOf("everyone" to "所有人", "nobody" to "不接收私信"), privacyData?.optString("dm_permission").orEmpty(), viewModel::setDmPermission) }
                "privacy-blocked" -> {
                    val blocked = privacyData?.optJSONArray("blocked")
                    if (blocked == null) item { Text("登录后读取黑名单", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(12.dp)) }
                    else if (blocked.length() == 0) item { Text("黑名单为空", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(12.dp)) }
                    else items((0 until blocked.length()).mapNotNull { blocked.optJSONObject(it) }) { person ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            androidx.compose.material3.Icon(com.heika.nativeapp.ui.HeikaIcons.Block, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(21.dp))
                            Text(person.optString("nickname", "探索者"), Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                            TextButton(onClick = { viewModel.unblockAccount(person.optString("id")) }) { Text("解除屏蔽") }
                        }
                    }
                }
                "about" -> item { SettingAction("关于黑卡", "版本、项目链接与意见反馈", onAbout) }
            }
        }
    }
    pendingNotesPrivate?.let { value ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { pendingNotesPrivate = null },
            title = { Text("更新作品可见范围？") },
            text = { Text(if (value) "已发布作品及关联媒体将设为仅自己可见。" else "已发布作品将按社区规则公开展示。") },
            confirmButton = { TextButton(onClick = { viewModel.setNotesPrivate(value); pendingNotesPrivate = null }) { Text("确认") } },
            dismissButton = { TextButton(onClick = { pendingNotesPrivate = null }) { Text("取消") } },
        )
    }
    if (recoveryConfirm) androidx.compose.material3.AlertDialog(
        onDismissRequest = { recoveryConfirm = false },
        title = { Text("生成新的恢复码？") },
        text = { Text("这会立即使之前生成的恢复码失效。新恢复码只显示一次，请安全保存。") },
        confirmButton = { TextButton(enabled = !recoveryCodesLoading, onClick = { recoveryConfirm = false; viewModel.generateRecoveryCodes() }) { Text("生成") } },
        dismissButton = { TextButton(onClick = { recoveryConfirm = false }) { Text("取消") } },
    )
    if (recoveryCodesOpen) androidx.compose.material3.AlertDialog(
        onDismissRequest = { recoveryCodesOpen = false; viewModel.clearRecoveryCodes() },
        title = { Text("账号恢复码") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("请保存到安全位置。关闭后将无法再次查看。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                recoveryCodes.forEach { code -> Text(code, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium) }
            }
        },
        confirmButton = { TextButton(onClick = {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            clipboard.setPrimaryClip(android.content.ClipData.newPlainText("HEIKA 账号恢复码", recoveryCodes.joinToString("\n")))
            recoveryCodesOpen = false
            viewModel.clearRecoveryCodes()
        }) { Text("复制并关闭") } },
        dismissButton = { TextButton(onClick = { recoveryCodesOpen = false; viewModel.clearRecoveryCodes() }) { Text("关闭") } },
    )
}

@Composable
private fun DetailHeading(title: String) {
    Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 17.dp, bottom = 6.dp))
}

@Composable
private fun ChoiceList(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 12.dp)) {
        options.forEachIndexed { index, (value, title) ->
            Row(
                Modifier.fillMaxWidth().clickable { onSelect(value) }.heightIn(min = 56.dp).padding(vertical = 8.dp, horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                androidx.compose.material3.Icon(settingIcon(title), null, tint = if (selected == value) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(21.dp))
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
private fun themeLabel(value: String) = when (value) { "light" -> "浅色"; "dark" -> "深色"; else -> "跟随系统" }
private fun layoutLabel(value: String) = if (value == "single") "单列列表" else "双列瀑布流"
private fun readingLabel(value: String) = when (value) { "focus" -> "专注"; "night" -> "夜读"; else -> "标准" }

@Composable
private fun SettingAction(title: String, subtitle: String, onClick: () -> Unit, enabled: Boolean = true) {
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).clip(RoundedCornerShape(10.dp)).clickable(enabled, onClick = onClick).padding(vertical = 9.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        androidx.compose.material3.Icon(settingIcon(title), null, tint = MaterialTheme.colorScheme.primary.copy(alpha = .86f), modifier = Modifier.size(21.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 3.dp))
        }
        IconChevron()
    }
}

@Composable
private fun SwitchSetting(title: String, subtitle: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(vertical = 7.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        androidx.compose.material3.Icon(settingIcon(title), null, tint = MaterialTheme.colorScheme.primary.copy(alpha = .86f), modifier = Modifier.size(21.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
        }
        Switch(checked = checked, enabled = enabled, onCheckedChange = onChange)
    }
}

private fun settingIcon(title: String): androidx.compose.ui.graphics.vector.ImageVector = when {
    title.contains("主题") -> Icons.Outlined.ColorLens
    title.contains("布局") -> Icons.Outlined.ViewAgenda
    title.contains("阅读") -> Icons.Outlined.TextFields
    title.contains("动画") -> Icons.Outlined.AutoAwesomeMotion
    title.contains("字体") -> Icons.Outlined.FontDownload
    title.contains("通知") || title.contains("评论与回复") -> Icons.Outlined.NotificationsActive
    title.contains("缓存") || title.contains("清理") || title.contains("容量") -> Icons.Outlined.CleaningServices
    title.contains("资料") -> Icons.Outlined.Edit
    title.contains("退出") -> Icons.Outlined.Logout
    title.contains("隐私") || title.contains("公开") -> Icons.Outlined.Policy
    title.contains("安全") || title.contains("权限") -> Icons.Outlined.Security
    title.contains("网页") || title.contains("链接") -> Icons.Outlined.Language
    title.contains("反馈") -> Icons.Outlined.Feedback
    title.contains("图片") -> Icons.Outlined.Image
    title.contains("会员") -> Icons.Outlined.StarOutline
    else -> Icons.Outlined.ArrowForwardIos
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
