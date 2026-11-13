package com.heika.nativeapp.feature.settings

import com.heika.nativeapp.ui.HeikaIcons
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
import androidx.compose.foundation.Image
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.R
import com.heika.nativeapp.ui.BackHeader

@Composable
fun AboutScreen(onBack: () -> Unit, onFeedback: () -> Unit) {
    val context = LocalContext.current
    val version = installedVersion(context)
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("关于黑卡", onBack)
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 22.dp, vertical = 14.dp)) {
            item {
                Column(Modifier.fillMaxWidth().padding(top = 15.dp, bottom = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(104.dp).clip(RoundedCornerShape(25.dp)).background(androidx.compose.ui.graphics.Color.Black), contentAlignment = Alignment.Center) {
                        // Keep the complete supplied 512×512 artwork visible; never crop or zoom it.
                        Image(painterResource(R.drawable.ic_heika), contentDescription = "黑卡应用图标", modifier = Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Fit)
                    }
                    Text("黑卡 HEIKA", color = MaterialTheme.colorScheme.onBackground, fontSize = 21.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 10.dp))
                    Text("版本 ${version.first} · 构建 ${version.second}", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .75f), fontSize = 10.sp, modifier = Modifier.padding(top = 9.dp))
                }
            }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("关于黑卡", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text("黑卡是一款独立开发的内容探索应用。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 19.sp)
                    Text("个人开发者", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                    Text(
                        "字体：OPPO Sans 4.0。Copyright © 2024 Guangdong OPPO Mobile Telecommunications Corp., Ltd. 字体依照随应用附带的许可协议提供。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 10.sp,
                        lineHeight = 15.sp,
                    )
                }
            }
            item { NativeReleaseNotes(version.second) }
            item { AboutActions(onFeedback = onFeedback, onWebsite = { openExternal(context, "https://moonclean.shop/") }, onGithub = { openExternal(context, BuildConfig.GITHUB_URL) }) }
        }
    }
}

private data class NativeRelease(val build: Long, val date: String, val notes: List<String>)

private val nativeReleases = listOf(
    NativeRelease(34, "2026.11.13", listOf("个人页探索成长入口更紧凑；底部主导航改为仅图标。", "探索中心支持管理员配置可关闭的图文广告位。", "关于页加入原生版本更新记录，并完整展示黑卡图标留白。")),
    NativeRelease(33, "2026.11.13", listOf("内置 OPPO Sans 4.0 并保留字体许可文件。", "更新黑卡金色应用图标，优化底栏空间和发现页滚动绘制。")),
)

@Composable
private fun NativeReleaseNotes(currentBuild: Long) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 15.dp, vertical = 13.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("版本更新", Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text("${nativeReleases.size} 条", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
        }
        nativeReleases.forEachIndexed { index, release ->
            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = if (index == 0) 0.dp else 2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text("2.3.6 · ${release.build}", color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    if (release.build == currentBuild) Text("当前版本", color = MaterialTheme.colorScheme.primary, fontSize = 9.sp)
                    Spacer(Modifier.weight(1f))
                    Text(release.date, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                }
                release.notes.forEach { note -> Text("· $note", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, lineHeight = 15.sp) }
            }
        }
    }
}

@Composable
private fun AboutActions(onFeedback: () -> Unit, onWebsite: () -> Unit, onGithub: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(MaterialTheme.colorScheme.surface)) {
        AboutAction("意见反馈", "通过黑卡现有反馈入口联系开发者", true, onFeedback)
        HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))
        AboutAction("官方网站", "moonclean.shop", true, onWebsite)
        HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))
        AboutAction("GitHub 项目", "查看黑卡公开项目", true, onGithub)
        HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))
        AboutAction("用户协议与隐私政策", "网站当前标注协议文本尚未开放", false) { }
    }
}

@Composable
private fun AboutAction(title: String, subtitle: String, enabled: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().then(if (enabled) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 14.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = if (enabled) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
        }
        if (enabled) {
            Icon(HeikaIcons.OpenInNew, contentDescription = "打开$title", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
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
