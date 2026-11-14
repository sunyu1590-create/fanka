package com.heika.nativeapp.feature.settings

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import com.heika.nativeapp.ui.HeikaAlertDialog
import com.heika.nativeapp.ui.HeikaIcons

private data class NativeRelease(val build: Long, val date: String, val notes: List<String>)
private val nativeReleases = listOf(
    NativeRelease(39, "2026.11.14", listOf("重构会员与支持中心，接入服务端会员状态、每日额度和权益方案配置。", "新增会员激活码预览与兑换、会员到期同步及管理员卡密批次管理入口。")),
    NativeRelease(38, "2026.11.14", listOf("翻卡揭晓改为实体卡片 3D 翻转，增加银白边缘光与空间层叠，并移除普通翻卡彩带。", "修复确认弹窗模糊降级；发现页文字广告不再留图片占位，管理员可从相册上传广告图片。")),
    NativeRelease(37, "2026.11.14", listOf("中国网络提示改为优先读取本机运营商国家码，并直接查询公网 IP 归属地。", "修正聊天头像对齐与返回按钮颜色；优化翻卡背景模糊、压暗和庆祝动效。")),
    NativeRelease(36, "2026.11.14", listOf("修复确认弹窗背景模糊兼容与内容透出问题，收窄详情操作菜单。", "广告位改为显示在发现页精选信息流中，点击进入关联作品。")),
    NativeRelease(35, "2026.11.13", listOf("加入网络环境提示，完善跨境服务不稳定时的说明。", "更新黑卡品牌图标与关于页展示。")),
    NativeRelease(34, "2026.11.13", listOf("个人页探索成长入口更紧凑；底部主导航改为仅图标。", "探索中心支持管理员配置可关闭的图文广告位。", "关于页加入原生版本更新记录，并完整展示黑卡图标留白。")),
    NativeRelease(33, "2026.11.13", listOf("内置 OPPO Sans 4.0 并保留字体许可文件。", "更新黑卡金色应用图标，优化底栏空间和发现页滚动绘制。")),
)

@Composable
fun AboutScreen(onBack: () -> Unit, onFeedback: () -> Unit) {
    val context = LocalContext.current
    val version = installedVersion(context)
    var storyExpanded by remember { mutableStateOf(false) }
    var historyExpanded by remember { mutableStateOf(false) }
    var licensesOpen by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    val licenses = remember(context) {
        listOf("OPPO Sans 4.0 字体许可" to R.raw.oppo_sans_4_0_license,
            "Lucide 图标许可" to R.raw.lucide_license,
            "IconPark 图标资源许可" to R.raw.iconpark_license)
            .joinToString("\n\n") { (title, resource) -> "$title\n${context.resources.openRawResource(resource).bufferedReader().use { it.readText() }}" }
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("关于黑卡", onBack)
        LazyColumn(contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            item {
                Column(Modifier.fillMaxWidth().padding(top = 5.dp, bottom = 2.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Image(painterResource(R.drawable.ic_heika_original), contentDescription = "黑卡应用图标", modifier = Modifier.size(72.dp), contentScale = androidx.compose.ui.layout.ContentScale.Fit)
                    Text("黑卡 HEIKA", color = MaterialTheme.colorScheme.onBackground, fontSize = 21.sp, fontWeight = FontWeight.SemiBold)
                    Text("翻开未知，遇见新的想法。", color = MaterialTheme.colorScheme.primary, fontSize = 13.sp)
                    Text("Android ${version.first}  ·  构建 ${version.second}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
            }
            item {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SectionTitle("认识黑卡")
                    Text("黑卡是一个以探索、阅读和分享为核心的内容社区。我们希望，让发现不再只是无尽的信息滑动，而是一次充满期待的主动选择。", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, lineHeight = 20.sp)
                    Text("在这里，你可以翻开未知的卡片，阅读感兴趣的知识与故事，分享自己的想法，也可以遇见与你拥有相同兴趣的人。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
                    Text("让探索成为习惯，让阅读重新拥有期待。", color = MaterialTheme.colorScheme.primary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                }
            }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface)) {
                    FeatureRow(HeikaIcons.Home, "每日翻卡", "从候选卡片中，选择每天想要探索的内容。")
                    FeatureDivider()
                    FeatureRow(HeikaIcons.Discovery, "发现社区", "阅读、收藏、评论和分享作品，交流不同观点。")
                    FeatureDivider()
                    FeatureRow(HeikaIcons.Robot, "AI 专区", "发现 AI 知识、Agent、Skill、Prompt 与实用工具。")
                }
            }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text("关于开发者", color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text("个人开发者", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                    Text("黑卡始于一个简单的想法：能不能让发现内容这件事，变得更有趣一些？", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    Text("从翻开第一张卡片，到逐渐形成一个可以阅读、分享与交流的社区，黑卡仍在不断成长。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    AnimatedVisibility(storyExpanded, enter = fadeIn(tween(220)) + expandVertically(tween(220)), exit = fadeOut(tween(180)) + shrinkVertically(tween(180))) {
                        Text("我会继续完善体验、倾听反馈，让每一次更新都带来有价值的改变。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    }
                    TextButton(onClick = { storyExpanded = !storyExpanded }) { Text(if (storyExpanded) "收起" else "阅读更多") }
                }
            }
            item { ReleaseSection(version.second, historyExpanded) { historyExpanded = !historyExpanded } }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface)) {
                    AboutAction(HeikaIcons.Comment, "意见反馈", "告诉我们问题或建议", onFeedback)
                    FeatureDivider()
                    AboutAction(HeikaIcons.OpenInNew, "官方网站", BuildConfig.API_BASE_URL.removePrefix("https://").removeSuffix("/"), { openExternal(context, BuildConfig.API_BASE_URL, notice = { notice = it }) })
                    FeatureDivider()
                    AboutAction(HeikaIcons.OpenInNew, "GitHub 项目", "查看黑卡公开项目", { openExternal(context, BuildConfig.GITHUB_URL, notice = { notice = it }) })
                    FeatureDivider()
                    AboutAction(HeikaIcons.Info, "第三方许可与开源声明", "OPPO Sans 4.0、Lucide 与 IconPark", { licensesOpen = true })
                }
            }
        }
    }
    if (licensesOpen) HeikaAlertDialog(
        onDismissRequest = { licensesOpen = false },
        title = { Text("第三方许可与开源声明") },
        text = { Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState())) { Text(licenses, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp) } },
        confirmButton = { TextButton(onClick = { licensesOpen = false }) { Text("完成") } },
    )
    notice?.let { message -> HeikaAlertDialog(onDismissRequest = { notice = null }, title = { Text("无法打开链接") }, text = { Text(message) }, confirmButton = { TextButton(onClick = { notice = null }) { Text("知道了") } }) }
}

@Composable private fun SectionTitle(title: String) { Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }

@Composable private fun FeatureRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, description: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(11.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) { Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium); Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp) }
    }
}

@Composable private fun FeatureDivider() { HorizontalDivider(Modifier.padding(horizontal = 13.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .6f)) }

@Composable private fun AboutAction(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick).padding(horizontal = 13.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(19.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) { Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium); Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
        Icon(HeikaIcons.Forward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(17.dp))
    }
}

@Composable private fun ReleaseSection(currentBuild: Long, historyExpanded: Boolean, onToggleHistory: () -> Unit) {
    val current = nativeReleases.firstOrNull { it.build == currentBuild }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("版本更新", color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        if (current == null) Text("当前版本 ${BuildConfig.VERSION_NAME} · 构建 $currentBuild", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
        else ReleaseRow(current, true)
        TextButton(onClick = onToggleHistory) { Text(if (historyExpanded) "收起历史更新" else "查看历史更新") }
        AnimatedVisibility(historyExpanded, enter = fadeIn(tween(220)) + expandVertically(tween(220)), exit = fadeOut(tween(180)) + shrinkVertically(tween(180))) {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) { nativeReleases.filter { it.build != currentBuild }.forEach { HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .6f)); ReleaseRow(it, false) } }
        }
    }
}

@Composable private fun ReleaseRow(release: NativeRelease, current: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { Text("2.3.6 · ${release.build}", color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.Medium); if (current) Text("当前", Modifier.padding(start = 7.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = .12f)).padding(horizontal = 7.dp, vertical = 3.dp), color = MaterialTheme.colorScheme.primary, fontSize = 9.sp); Spacer(Modifier.weight(1f)); Text(release.date, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
        Text(release.notes.firstOrNull().orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp)
    }
}

private fun installedVersion(context: Context): Pair<String, Long> {
    val info: PackageInfo = if (Build.VERSION.SDK_INT >= 33) context.packageManager.getPackageInfo(context.packageName, android.content.pm.PackageManager.PackageInfoFlags.of(0)) else @Suppress("DEPRECATION") context.packageManager.getPackageInfo(context.packageName, 0)
    val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    return info.versionName.orEmpty() to code
}

private fun openExternal(context: Context, url: String, notice: (String) -> Unit) {
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))) }
        .onFailure { if (it is ActivityNotFoundException) notice("当前设备没有可打开该链接的浏览器。") else notice("链接暂时无法打开，请稍后重试。") }
}
