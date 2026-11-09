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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.heika.nativeapp.ui.BackHeader

@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onAbout: () -> Unit,
    onAccount: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val theme by viewModel.theme.collectAsStateWithLifecycle()
    val capacity by viewModel.imageCacheMb.collectAsStateWithLifecycle()
    val comments by viewModel.commentsEnabled.collectAsStateWithLifecycle()
    val cacheClearing by viewModel.cacheClearing.collectAsStateWithLifecycle()
    var permissionRefresh by remember { mutableIntStateOf(0) }
    val notificationLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { permissionRefresh++ }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) permissionRefresh++ }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(Unit) { viewModel.loadNotificationSettings() }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("设置", onBack)
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 21.dp, end = 21.dp, bottom = 28.dp)) {
            item { SettingsSectionTitle("外观") }
            item {
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("dark" to "深色", "light" to "浅色", "system" to "跟随系统").forEach { (value, label) ->
                        ThemeChoice(label, theme == value) { viewModel.setTheme(value) }
                    }
                }
            }
            item { SettingsSectionTitle("通知") }
            item {
                SettingsRow(
                    title = "Android 系统通知",
                    subtitle = if (remember(context, permissionRefresh) { NotificationManagerCompat.from(context).areNotificationsEnabled() }) "系统权限已开启" else "系统权限未开启",
                    actionLabel = "设置",
                    onClick = {
                        if (Build.VERSION.SDK_INT >= 33 && !NotificationManagerCompat.from(context).areNotificationsEnabled()) {
                            val activity = context as? Activity
                            if (activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)) openNotificationSettings(context)
                            else notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else openNotificationSettings(context)
                    },
                )
            }
            item {
                Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("评论与回复提醒", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        Text("同步黑卡账号的站内通知偏好", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
                    }
                    Switch(checked = comments, onCheckedChange = viewModel::setCommentsEnabled)
                }
            }
            item { SettingsSectionTitle("图片缓存") }
            item {
                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ThemeChoice("256 MB", capacity == 256) { viewModel.setCacheCapacity(256) }
                    ThemeChoice("512 MB", capacity == 512) { viewModel.setCacheCapacity(512) }
                }
            }
            item { SettingsRow("清理图片缓存", "只清理可重新下载的图片文件", if (cacheClearing) "清理中" else "清理") { if (!cacheClearing) viewModel.clearImageCache() } }
            item { SettingsSectionTitle("账号与应用") }
            item { SettingsRow("账号", "查看登录状态或切换账号", "打开", onAccount) }
            item { SettingsRow("关于黑卡", "Android 原生应用信息、版本与项目链接", "打开", onAbout) }
        }
    }
}

@Composable
private fun SettingsSectionTitle(text: String) {
    Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 23.dp, bottom = 8.dp))
}

@Composable
private fun ThemeChoice(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        Modifier.clip(RoundedCornerShape(10.dp)).background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .14f) else MaterialTheme.colorScheme.surface).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 11.dp),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 11.sp,
    )
}

@Composable
private fun SettingsRow(title: String, subtitle: String, actionLabel: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
        }
        Text(actionLabel, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
    }
}

private fun openNotificationSettings(context: Context) {
    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    runCatching { context.startActivity(intent) }.onFailure {
        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
    }
}
