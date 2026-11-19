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
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.zIndex
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
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
import com.heika.nativeapp.ui.HeikaAlertDialog
import com.heika.nativeapp.ui.HeikaGlassDialog
import com.heika.nativeapp.ui.HeikaIconRes
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.feature.profile.ProfileViewModel
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.HeikaNoticeKind
import java.util.Locale

data class SettingsEntry(val key: String, val title: String, val iconRes: Int)

@Composable
private fun CertificationSettingsContent() {
    val profileViewModel: ProfileViewModel = hiltViewModel()
    val state by profileViewModel.state.collectAsStateWithLifecycle()
    var code by remember { mutableStateOf("") }
    LaunchedEffect(profileViewModel) { profileViewModel.load(null, force = true) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("输入管理员发放的认证码。兑换成功后，认证标识会显示在你的公开主页和私信资料旁。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
        OutlinedTextField(code, { code = it.uppercase().take(24) }, Modifier.fillMaxWidth(), label = { Text("认证码") }, placeholder = { Text("HEIKA-XXXX-XXXX-XXXX") }, singleLine = true)
        Button(enabled = !state.saving && code.isNotBlank(), onClick = { profileViewModel.redeemCertificationCode(code); code = "" }) { Text(if (state.saving) "兑换中…" else "兑换认证") }
        state.notice?.let { Text(it, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
        HorizontalDivider()
        Text("我的认证标识", color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        if (state.badges.isEmpty()) Text("暂时没有认证标识。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
        state.badges.forEach { badge ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Icon(HeikaIcons.Shield, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(15.dp))
                Text(badge.label, color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

private val SettingGroups = listOf(
    "账号" to listOf(SettingsEntry("account", "账号与安全", HeikaIconRes.Profile), SettingsEntry("certification", "兑换认证码", HeikaIconRes.Shield), SettingsEntry("membership", "会员与支持", HeikaIconRes.StarOutline)),
    "偏好" to listOf(SettingsEntry("appearance", "外观与阅读", HeikaIconRes.Magic), SettingsEntry("notifications", "通知与消息", HeikaIconRes.Notifications), SettingsEntry("storage", "存储与缓存", HeikaIconRes.Storage)),
    "其他" to listOf(SettingsEntry("privacy", "隐私与权限", HeikaIconRes.Privacy), SettingsEntry("about", "关于黑卡", HeikaIconRes.Info)),
)

/* ---------- 统一的设置视觉：一级、二级、三级共用同一套行与卡片 ---------- */

@Composable
private fun SettingsGroupTitle(text: String) {
    Text(
        text,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 4.dp, top = 22.dp, bottom = 9.dp),
    )
}

@Composable
private fun SettingsGroup(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface),
        content = content,
    )
}

@Composable
private fun SettingsDivider(start: Dp = 56.dp) {
    HorizontalDivider(
        modifier = Modifier.padding(start = start),
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .42f),
    )
}

@Composable
private fun SettingsRow(
    title: String,
    subtitle: String? = null,
    iconRes: Int,
    enabled: Boolean = true,
    showChevron: Boolean = true,
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    Row(
        Modifier.fillMaxWidth()
            .heightIn(min = 58.dp)
            .then(if (onClick != null) Modifier.clickable(enabled) { onClick() } else Modifier)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(30.dp).clip(RoundedCornerShape(9.dp))
                .background(MaterialTheme.colorScheme.primary.copy(alpha = if (enabled) .10f else .05f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                painterResource(iconRes), null,
                tint = MaterialTheme.colorScheme.primary.copy(alpha = if (enabled) .92f else .35f),
                modifier = Modifier.size(17.dp),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                title,
                color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .6f),
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    subtitle,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp,
                    lineHeight = 15.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        when {
            trailing != null -> trailing()
            onClick != null && showChevron -> Icon(
                HeikaIcons.Forward, null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .55f),
                modifier = Modifier.size(17.dp),
            )
        }
    }
}

@Composable
fun SettingsScreen(onBack: () -> Unit, onSection: (String) -> Unit) {
    val viewModel: SettingsViewModel = hiltViewModel()
    val adminAccess by viewModel.adminAccess.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("设置", onBack)
        LazyColumn(contentPadding = PaddingValues(start = 20.dp, top = 4.dp, end = 20.dp, bottom = 110.dp)) {
            SettingGroups.forEach { (heading, entries) ->
                item(key = "heading-$heading") { SettingsGroupTitle(heading) }
                item(key = "group-$heading") {
                    SettingsGroup {
                        entries.forEachIndexed { index, entry ->
                            SettingsRow(entry.title, iconRes = entry.iconRes) { onSection(entry.key) }
                            if (index < entries.lastIndex) SettingsDivider()
                        }
                    }
                }
            }
            if (adminAccess == true) {
                item(key = "admin-heading") { SettingsGroupTitle("管理") }
                item(key = "admin-entry") {
                    SettingsGroup {
                        SettingsRow(
                            "管理员中心",
                            subtitle = "内容审核、会员与运营配置",
                            iconRes = HeikaIconRes.Admin,
                            onClick = { onSection("admin") },
                        )
                    }
                }
            }
        }
    }
}

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
    val bodyTextSize by viewModel.bodyTextSize.collectAsStateWithLifecycle()
    val titleTextSize by viewModel.titleTextSize.collectAsStateWithLifecycle()
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
        "text-size" -> "阅读与字号"
        "body-size" -> "正文大小"
        "title-size" -> "标题大小"
        "privacy-dm" -> "私信接收范围"
        "privacy-blocked" -> "黑名单"
        "theme" -> "主题模式"
        "layout" -> "内容布局"
        "reading" -> "阅读模式"
        "cache-capacity" -> "缓存容量"
        "certification" -> "兑换认证码"
        else -> "设置"
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(title, onBack)
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(start = 20.dp, top = 12.dp, end = 20.dp, bottom = 110.dp),
        ) {
            when (section) {
                "certification" -> item { CertificationSettingsContent() }
                "account" -> {
                    item {
                        SettingsGroup {
                            SettingsRow("编辑个人资料", "更新头像、昵称和简介", HeikaIconRes.Profile, onClick = onEditProfile)
                            SettingsDivider()
                            SettingsRow("账号与安全", "查看当前登录状态、切换账号或退出", HeikaIconRes.Shield, onClick = onAccount)
                            SettingsDivider()
                            SettingsRow(
                                if (recoveryCodesLoading) "正在生成…" else "生成账号恢复码",
                                "生成后旧恢复码将失效，请妥善保存",
                                HeikaIconRes.Shield,
                                enabled = !recoveryCodesLoading,
                                onClick = { if (!recoveryCodesLoading) recoveryConfirm = true },
                            )
                            SettingsDivider()
                            SettingsRow("会员与支持", "查看账号当前权益", HeikaIconRes.Vip, onClick = onMembership)
                        }
                    }
                    privacyError?.let { error -> item { SettingsHint(error, isError = true) } }
                }
                "membership" -> item {
                    SettingsGroup {
                        SettingsRow("会员与支持中心", "打开黑卡现有会员与支持页面", HeikaIconRes.Vip, onClick = onMembership)
                    }
                }
                "appearance" -> item {
                    SettingsGroup {
                        SettingsRow("主题模式", themeLabel(theme), HeikaIconRes.Magic) { onSection("theme") }
                        SettingsDivider()
                        SettingsRow("内容布局", layoutLabel(layout), HeikaIconRes.List) { onSection("layout") }
                        SettingsDivider()
                        SettingsRow("阅读模式", readingLabel(reading), HeikaIconRes.Text) { onSection("reading") }
                        SettingsDivider()
                        SettingsRow("阅读与字号", "设置正文和标题的显示大小", HeikaIconRes.Font) { onSection("text-size") }
                        SettingsDivider()
                        SettingsRow("页面切换动画", transitionLabel(pageTransition), HeikaIconRes.Album) { onSection("transition") }
                        SettingsDivider()
                        SettingsRow("字体", if (fontChoice == "oppo_sans") "OPPO Sans 4.0" else "系统默认", HeikaIconRes.Font) { onSection("font") }
                    }
                }
                "theme" -> item { ChoiceList(SettingIconKey.THEME, listOf("system" to "跟随系统", "light" to "浅色", "dark" to "深色"), theme, viewModel::setTheme) }
                "layout" -> item { ChoiceList(SettingIconKey.LAYOUT, listOf("waterfall" to "双列瀑布流", "single" to "单列列表"), layout, viewModel::setFeedLayout) }
                "reading" -> item { ChoiceList(SettingIconKey.READING, listOf("standard" to "标准", "focus" to "专注", "night" to "夜读"), reading, viewModel::setReadingMode) }
                "transition" -> {
                    item { SettingsGroupTitle("选择页面切换方式") }
                    item { ChoiceList(SettingIconKey.TRANSITION, listOf("shared" to "卡片连贯", "crossfade" to "叠化", "lift" to "上下浮"), pageTransition, viewModel::setPageTransition) }
                    item { SettingsHint("卡片连贯：封面与标题从卡片原位长成详情页，不是整页淡入淡出。") }
                }
                "font" -> {
                    item { SettingsGroupTitle("字体") }
                    item { ChoiceList(SettingIconKey.FONT, listOf("system" to "系统默认", "oppo_sans" to "OPPO Sans 4.0"), fontChoice, viewModel::setFontChoice) }
                    item { SettingsHint("OPPO Sans 4.0 随应用提供，字体版权归 OPPO。") }
                }
                "text-size" -> {
                    item {
                        SettingsGroup {
                            SettingsRow("正文大小", textSizeLabel(bodyTextSize), HeikaIconRes.Text) { onSection("body-size") }
                            SettingsDivider()
                            SettingsRow("标题大小", textSizeLabel(titleTextSize), HeikaIconRes.Font) { onSection("title-size") }
                        }
                    }
                    item { SettingsGroupTitle("预览") }
                    item {
                        Text(
                            "阅读与字号会立即应用于详情正文、评论正文和内容标题。",
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 14.sp * com.heika.nativeapp.ui.HeikaReadingSizes.bodyScale(bodyTextSize),
                            lineHeight = 22.sp * com.heika.nativeapp.ui.HeikaReadingSizes.bodyScale(bodyTextSize),
                        )
                    }
                }
                "body-size" -> item {
                    TextSizeChoiceList(
                        iconKey = SettingIconKey.READING,
                        selected = bodyTextSize,
                        title = false,
                        onSelect = viewModel::setBodyTextSize,
                    )
                }
                "title-size" -> item {
                    TextSizeChoiceList(
                        iconKey = SettingIconKey.FONT,
                        selected = titleTextSize,
                        title = true,
                        onSelect = viewModel::setTitleTextSize,
                    )
                }
                "notifications" -> {
                    item {
                        SettingsGroup {
                            SettingsRow(
                                "Android 系统通知",
                                if (notificationsAllowed) "系统通知权限已开启" else "系统通知权限未开启",
                                HeikaIconRes.Notifications,
                                onClick = { requestOrOpenNotificationPermission(context, permissionLauncher::launch) },
                            )
                        }
                    }
                    item { SettingsGroupTitle("站内通知偏好") }
                    item {
                        SettingsGroup {
                            SettingsRow(
                                "评论与回复",
                                if (notificationsLoading) "正在读取网站账号偏好…" else "此开关与网站账号偏好同步",
                                HeikaIconRes.Notifications,
                                enabled = comments != null,
                                trailing = {
                                    Switch(
                                        checked = comments == true,
                                        enabled = comments != null,
                                        onCheckedChange = { value ->
                                            viewModel.setCommentsEnabled(value)
                                            HeikaNoticeBus.showSelection("评论与回复提醒${if (value) "已开启" else "已关闭"}")
                                        },
                                    )
                                },
                            )
                            SettingsDivider()
                            SettingsRow("通知中心", "查看站内通知与未读状态", HeikaIconRes.Notifications, onClick = onNotifications)
                        }
                    }
                    notificationError?.let { error ->
                        item {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(error, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                                TextButton(onClick = { viewModel.loadNotificationSettings(force = true) }) { Text("重试") }
                            }
                        }
                    }
                    item { SettingsHint("当前后端偏好接口仅提供评论与回复提醒；点赞、收藏和私信的独立偏好尚未接入。") }
                }
                "storage" -> {
                    item {
                        SettingsGroup {
                            SettingsRow("图片磁盘缓存", "${formatBytes(cacheBytes)} / $capacity MB", HeikaIconRes.Storage) { onSection("cache-capacity") }
                            SettingsDivider()
                            SettingsRow(
                                if (cacheClearing) "正在清理…" else "清理图片缓存",
                                "只清理可重新下载的图片，不影响翻卡记录、草稿与账号资料",
                                HeikaIconRes.Storage,
                                enabled = !cacheClearing,
                                onClick = { if (!cacheClearing) viewModel.clearImageCache() },
                            )
                        }
                    }
                    message?.let { text -> item { SettingsHint(text, isError = false) } }
                }
                "cache-capacity" -> item { ChoiceList(SettingIconKey.STORAGE, listOf("256" to "256 MB", "512" to "512 MB"), capacity.toString(), onSelect = { viewModel.setCacheCapacity(it.toInt()) }) }
                "privacy" -> {
                    item {
                        SettingsGroup {
                            SettingsRow("系统应用权限", "在 Android 设置中查看和管理 HEIKA 权限", HeikaIconRes.Shield, onClick = { openAppSettings(context) })
                        }
                    }
                    item { SettingsGroupTitle("账号隐私偏好") }
                    item {
                        SettingsGroup {
                            SettingsRow(
                                "公开我的收藏",
                                if (privacyLoading) "正在读取账号设置…" else "与当前 HEIKA 账号的公开设置同步",
                                HeikaIconRes.Privacy,
                                enabled = bookmarksVisible != null && !privacyLoading,
                                trailing = {
                                    Switch(
                                        checked = bookmarksVisible == true,
                                        enabled = bookmarksVisible != null && !privacyLoading,
                                        onCheckedChange = { viewModel.setBookmarksVisible(it) },
                                    )
                                },
                            )
                            SettingsDivider()
                            SettingsRow(
                                "作品仅自己可见",
                                "控制个人作品的公开范围",
                                HeikaIconRes.Privacy,
                                enabled = privacyData != null && !privacyLoading,
                                trailing = {
                                    Switch(
                                        checked = privacyData?.optBoolean("notes_private") == true,
                                        enabled = privacyData != null && !privacyLoading,
                                        onCheckedChange = { pendingNotesPrivate = it },
                                    )
                                },
                            )
                            SettingsDivider()
                            SettingsRow(
                                "私信接收范围",
                                if (privacyLoading) "正在读取账号设置…" else if (privacyData?.optString("dm_permission") == "nobody") "不接收私信" else "所有人可私信",
                                HeikaIconRes.Messages,
                                enabled = privacyData != null,
                                onClick = { onSection("privacy-dm") },
                            )
                            SettingsDivider()
                            SettingsRow("黑名单", "管理已屏蔽的账号", HeikaIconRes.Block) { onSection("privacy-blocked") }
                        }
                    }
                    privacyError?.let { error ->
                        item {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(error, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                                TextButton(onClick = { viewModel.loadPrivacySettings(force = true) }) { Text("重试") }
                            }
                        }
                    }
                }
                "privacy-dm" -> item {
                    ChoiceList(SettingIconKey.MESSAGES, listOf("everyone" to "所有人", "nobody" to "不接收私信"), privacyData?.optString("dm_permission").orEmpty(), viewModel::setDmPermission)
                }
                "privacy-blocked" -> {
                    val blocked = privacyData?.optJSONArray("blocked")
                    if (blocked == null) item { SettingsHint("登录后读取黑名单") }
                    else if (blocked.length() == 0) item { SettingsHint("黑名单为空") }
                    else item {
                        SettingsGroup {
                            val people = (0 until blocked.length()).mapNotNull { blocked.optJSONObject(it) }
                            people.forEachIndexed { index, person ->
                                Row(
                                    Modifier.fillMaxWidth().heightIn(min = 58.dp).padding(horizontal = 14.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Box(
                                        Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = .10f)),
                                        contentAlignment = Alignment.Center,
                                    ) { Icon(HeikaIcons.Block, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(17.dp)) }
                                    Text(person.optString("nickname", "探索者"), Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                                    TextButton(onClick = { viewModel.unblockAccount(person.optString("id")) }) { Text("解除屏蔽") }
                                }
                                if (index < people.lastIndex) SettingsDivider()
                            }
                        }
                    }
                }
                "about" -> item {
                    SettingsGroup {
                        SettingsRow("关于黑卡", "版本、项目链接与意见反馈", HeikaIconRes.Info, onClick = onAbout)
                    }
                }
            }
        }
    }
    pendingNotesPrivate?.let { value ->
        HeikaGlassDialog(
            title = "更新作品可见范围？",
            message = if (value) "已发布作品及关联媒体将设为仅自己可见。" else "已发布作品将按社区规则公开展示。",
            confirmText = "确认",
            onConfirm = { viewModel.setNotesPrivate(value); pendingNotesPrivate = null },
            onCancel = { pendingNotesPrivate = null },
        )
    }
    if (recoveryConfirm) HeikaGlassDialog(
        title = "生成新的恢复码？",
        message = "这会立即使之前生成的恢复码失效。新恢复码只显示一次，请安全保存。",
        confirmText = "生成",
        dismissible = !recoveryCodesLoading,
        loading = recoveryCodesLoading,
        onConfirm = { viewModel.generateRecoveryCodes(); recoveryConfirm = false },
        onCancel = { recoveryConfirm = false },
    )
    if (recoveryCodesOpen) HeikaAlertDialog(
        onDismissRequest = { recoveryCodesOpen = false; viewModel.clearRecoveryCodes() },
        title = { Text("账号恢复码") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("请保存到安全位置。关闭后将无法再次查看。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                recoveryCodes.forEach { code -> Text(code, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("HEIKA 账号恢复码", recoveryCodes.joinToString("\n")))
                recoveryCodesOpen = false
                viewModel.clearRecoveryCodes()
            }) { Text("复制并关闭") }
        },
        dismissButton = { TextButton(onClick = { recoveryCodesOpen = false; viewModel.clearRecoveryCodes() }) { Text("关闭") } },
    )
}

@Composable
private fun SettingsHint(text: String, isError: Boolean = false) {
    Text(
        text,
        color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 11.sp,
        lineHeight = 17.sp,
        modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 10.dp, bottom = 2.dp),
    )
}

@Composable
private fun ChoiceList(iconKey: SettingIconKey, options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    SettingsGroup {
        options.forEachIndexed { index, (value, title) ->
            val select = {
                if (selected != value) {
                    onSelect(value)
                    HeikaNoticeBus.show("设置已更新：$title", HeikaNoticeKind.SUCCESS)
                }
            }
            SettingsRow(
                title,
                iconRes = settingIcon(iconKey),
                showChevron = false,
                trailing = { RadioButton(selected = selected == value, onClick = select) },
                onClick = select,
            )
            if (index < options.lastIndex) SettingsDivider()
        }
    }
}

private fun transitionLabel(value: String) = when (value) {
    "crossfade" -> "叠化"
    "shared" -> "卡片连贯"
    else -> "上下浮"
}
private fun themeLabel(value: String) = when (value) { "light" -> "浅色"; "dark" -> "深色"; else -> "跟随系统" }
private fun layoutLabel(value: String) = if (value == "single") "单列列表" else "双列瀑布流"
private fun readingLabel(value: String) = when (value) { "focus" -> "专注"; "night" -> "夜读"; else -> "标准" }
private fun textSizeLabel(value: String) = when (com.heika.nativeapp.ui.HeikaReadingSizes.normalize(value)) {
    "slightly-large" -> "稍大"
    "large" -> "大"
    else -> "标准"
}

@Composable
private fun TextSizeChoiceList(
    iconKey: SettingIconKey,
    selected: String,
    title: Boolean,
    onSelect: (String) -> Unit,
) {
    val scale = if (title) com.heika.nativeapp.ui.HeikaReadingSizes.titleScale(selected) else com.heika.nativeapp.ui.HeikaReadingSizes.bodyScale(selected)
    val options = listOf("standard" to "标准", "slightly-large" to "稍大", "large" to "大")
    Column(Modifier.fillMaxWidth()) {
        SettingsGroupTitle("选择字号")
        SettingsGroup {
            options.forEachIndexed { index, (value, label) ->
                val select = {
                    if (selected != value) {
                        onSelect(value)
                        HeikaNoticeBus.show("${if (title) "标题" else "正文"}字号：$label", HeikaNoticeKind.SUCCESS)
                    }
                }
                Row(
                    Modifier.fillMaxWidth().clickable { select() }.heightIn(min = 62.dp).padding(horizontal = 14.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = .10f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            painterResource(settingIcon(iconKey)), null,
                            tint = if (selected == value) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(17.dp),
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(label, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text(
                            if (title) "黑卡内容标题" else "正文与评论示例",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = (if (title) 14.sp else 13.sp) * (if (title) com.heika.nativeapp.ui.HeikaReadingSizes.titleScale(value) else com.heika.nativeapp.ui.HeikaReadingSizes.bodyScale(value)),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    RadioButton(selected = selected == value, onClick = select)
                }
                if (index < options.lastIndex) SettingsDivider()
            }
        }
        Text(
            if (title) "标题预览" else "正文预览",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = (if (title) 22.sp else 14.sp) * scale,
            lineHeight = (if (title) 30.sp else 22.sp) * scale,
            modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
        )
    }
}

private enum class SettingIconKey { PROFILE, SECURITY, RECOVERY, MEMBERSHIP, THEME, LAYOUT, READING, TRANSITION, FONT, NOTIFICATIONS, STORAGE, PRIVACY, MESSAGES, BLOCK, INFO }

private fun settingIcon(key: SettingIconKey): Int = when (key) {
    SettingIconKey.PROFILE -> HeikaIconRes.Profile
    SettingIconKey.SECURITY, SettingIconKey.RECOVERY -> HeikaIconRes.Shield
    SettingIconKey.MEMBERSHIP -> HeikaIconRes.Vip
    SettingIconKey.THEME -> HeikaIconRes.Magic
    SettingIconKey.LAYOUT -> HeikaIconRes.List
    SettingIconKey.READING -> HeikaIconRes.Text
    SettingIconKey.TRANSITION -> HeikaIconRes.Album
    SettingIconKey.FONT -> HeikaIconRes.Font
    SettingIconKey.NOTIFICATIONS -> HeikaIconRes.Notifications
    SettingIconKey.STORAGE -> HeikaIconRes.Storage
    SettingIconKey.PRIVACY -> HeikaIconRes.Privacy
    SettingIconKey.MESSAGES -> HeikaIconRes.Messages
    SettingIconKey.BLOCK -> HeikaIconRes.Block
    SettingIconKey.INFO -> HeikaIconRes.Info
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
