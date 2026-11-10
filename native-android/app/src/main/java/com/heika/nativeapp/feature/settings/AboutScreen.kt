package com.heika.nativeapp.feature.settings

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.ui.BackHeader

@Composable
fun AboutScreen(onBack: () -> Unit, onFeedback: () -> Unit) {
    val context = LocalContext.current
    val version = installedVersion(context)
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("关于黑卡", onBack)
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 22.dp, vertical = 14.dp)) {
            item {
                Column(Modifier.fillMaxWidth().padding(top = 17.dp, bottom = 22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(76.dp).clip(RoundedCornerShape(23.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                        Text("黑卡", color = MaterialTheme.colorScheme.primary, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Text("黑卡 HEIKA", color = MaterialTheme.colorScheme.onBackground, fontSize = 21.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 14.dp))
                    Text("版本 ${version.first} · 构建 ${version.second}", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .75f), fontSize = 10.sp, modifier = Modifier.padding(top = 9.dp))
                }
            }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("关于黑卡", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text("黑卡是一款独立开发的内容探索应用。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 19.sp)
                    Text("个人开发者", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
            }
            item { AboutAction("检查更新", "当前发布渠道尚未提供可靠的更新检查服务", enabled = false) { } }
            item { AboutAction("意见反馈", "通过黑卡现有反馈入口联系开发者", enabled = true, onClick = onFeedback) }
            item { AboutAction("官方网站", "moonclean.shop", enabled = true) { openExternal(context, "https://moonclean.shop/") } }
            item { AboutAction("GitHub 项目", "查看黑卡公开项目", enabled = true) { openExternal(context, BuildConfig.GITHUB_URL) } }
            item { AboutAction("用户协议与隐私政策", "网站当前标注协议文本尚未开放", enabled = false) { } }
        }
    }
}

@Composable
private fun AboutAction(title: String, subtitle: String, enabled: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).then(if (enabled) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 14.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = if (enabled) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
        }
        if (enabled) {
            Icon(Icons.Outlined.OpenInNew, contentDescription = "打开$title", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
        }
    }
}

private fun installedVersion(context: Context): Pair<String, Long> {
    val info: PackageInfo = if (Build.VERSION.SDK_INT >= 33) {
        context.packageManager.getPackageInfo(context.packageName, android.content.pm.PackageManager.PackageInfoFlags.of(0))
    } else {
        @Suppress("DEPRECATION") context.packageManager.getPackageInfo(context.packageName, 0)
    }
    val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    return info.versionName.orEmpty() to code
}

private fun openExternal(context: Context, url: String) {
    context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
}
