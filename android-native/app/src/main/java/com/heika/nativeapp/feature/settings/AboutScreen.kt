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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heika.nativeapp.ui.AppUpdateViewModel
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaAlertDialog
import com.heika.nativeapp.ui.HeikaGlassDialog
import com.heika.nativeapp.ui.HeikaIcons

private data class NativeRelease(val build: Long, val date: String, val notes: List<String>)
private val nativeReleases = listOf(
    NativeRelease(51, "2026.11.16", listOf(
        "卡片点开改为真正的连续转场：封面图与标题从卡片原位长成详情页，不再整页淡入淡出。",
        "翻开的卡片在转场中保持可见，圆角、位置与尺寸一路插值，不再出现闪白或跳变。",
        "详情页正文、评分与评论等封面落位后再出现，进入过程不再所有元素一起浮上来。",
        "「页面切换动画」默认改为连续转场，仍可在设置中切回叠化或上下浮。",
    )),
    NativeRelease(50, "2026.11.16", listOf(
        "发现频道新增「商城」入口，商品与下单链路稍后接入。",
        "新增公告弹窗：管理员发布后，打开 App 即可看到最新公告。",
        "作品管理支持编辑已发布内容，提交后按站点规则进入修改审核。",
        "管理员可在任意作品的更多菜单中删除内容。",
        "个人页移除下载入口；详情页标题、标签与评分跟随图片一起淡入。",
    )),
    NativeRelease(49, "2026.11.16", listOf("「我的作品」顶部新增下载卡片，点一下直达下载页，不再占用底栏。", "关于黑卡新增「下载黑卡 App」入口，与检查更新合并为同一张卡片，行高与图标统一。", "网页端下载入口只在首页保留，探索页不再显示。")),
    NativeRelease(48, "2026.11.16", listOf("修复切换账号后登回原账号提示密码错误：退出登录会清空上一个账号的邮箱与密码，不再把新旧密码拼在一起。", "密码框新增显示/隐藏开关，登录失败自动清空密码并给出中文原因。", "账号请求自动清理邮箱里的隐藏字符与全角空格，复制粘贴的邮箱也能正常登录。")),
    NativeRelease(47, "2026.11.16", listOf("登录与令牌刷新不再跨境直连，统一走 moonclean.shop 网关，弱网下不再卡在连接阶段。", "放宽接口并发并缩短超时，首屏不再等待登录刷新，打开速度明显提升。", "修复私信打开闪退与会话列表重复项导致的崩溃，慢网络下会话加载失败可重试。", "网络抖动不再误清登录状态；设置页管理员入口优先使用上次结果，不再空白等待。")),
    NativeRelease(46, "2026.11.16", listOf("修复删除作品失败：翻卡记录不再阻塞作品删除，删除后相关记录同步清理。", "修复会员中心读不到等级、每日额度与经验值的问题，方案价格与次数同步显示真实配置。", "关于页新增手动检查更新；设置中心一级到三级统一为同一套列表样式，图标、间距与字号全面对齐。", "翻卡翻转改用更顺滑的缓动曲线，加入轻微的抬起与阴影层次。")),
    NativeRelease(45, "2026.11.16", listOf("新增启动时检查更新：服务端发布新版本后会提示，点击直达下载页。", "安装包改由 moonclean.shop 直接分发，支持断点续传，不再依赖第三方网盘。")),
    NativeRelease(44, "2026.11.16", listOf("全部服务端接口迁移到 moonclean.shop 与新的 Supabase 项目，登录、注册、找回密码、私信、翻卡、评论、评分、收藏、关注、每日任务、会员与后台管理逐项核对通过。", "补齐管理员方案配置、卡密批次明细、广告图片上传接口；批次统计改为按真实卡密记录汇总。", "清理指向已下线数据库的旧头像地址，图片与封面地址统一由新存储签名返回。")),
    NativeRelease(43, "2026.11.16", listOf("首个原生构建：界面改为 Jetpack Compose 原生实现，不再内嵌网页。", "账号改为邮箱密码直连服务端登录，支持令牌自动刷新与本地会话恢复。")),
    NativeRelease(40, "2026.11.15", listOf("原生账号登录、令牌刷新、私信和探索日历改为通过 CloudBase 网关与 HEIKA API 访问。", "密码找回统一使用 CloudBase 账号服务已支持的恢复码流程。")),
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
    val updateViewModel: AppUpdateViewModel = hiltViewModel()
    val pendingUpdate by updateViewModel.update.collectAsStateWithLifecycle()
    val checkingUpdate by updateViewModel.checking.collectAsStateWithLifecycle()
    val updateMessage by updateViewModel.manualMessage.collectAsStateWithLifecycle()
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
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface)) {
                    AboutAction(
                        icon = HeikaIcons.Retry,
                        title = if (checkingUpdate) "正在检查更新…" else "检查更新",
                        subtitle = updateMessage ?: "当前 ${version.first} · 构建 ${version.second}",
                        enabled = !checkingUpdate,
                        onClick = { updateViewModel.checkForUpdate(force = true) },
                    )
                    FeatureDivider()
                    AboutAction(icon = HeikaIcons.Download, title = "下载黑卡 App", subtitle = "打开网页下载页，获取安卓安装包", onClick = { updateViewModel.openDownloadPage() })
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
    pendingUpdate?.let { release ->
        HeikaGlassDialog(
            title = "发现新版本 ${release.version}",
            message = buildString {
                append("当前 ${version.first}，服务器已发布 ${release.version}。")
                release.notes.take(3).forEach { append("\n· ").append(it) }
            },
            confirmText = "立即更新",
            cancelText = "稍后",
            onConfirm = { updateViewModel.openDownloadPage(); updateViewModel.consumeManualMessage() },
            onCancel = { updateViewModel.snooze(); updateViewModel.consumeManualMessage() },
        )
    }
}

@Composable private fun SectionTitle(title: String) { Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }

@Composable private fun FeatureRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, description: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(11.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) { Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium); Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp) }
    }
}

@Composable private fun FeatureDivider() { HorizontalDivider(Modifier.padding(horizontal = 13.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .6f)) }

@Composable private fun AboutAction(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit, enabled: Boolean = true) {
    Row(Modifier.fillMaxWidth().heightIn(min = 58.dp).clickable(enabled = enabled, onClick = onClick).padding(horizontal = 13.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        Icon(icon, null, tint = if (enabled) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .45f), modifier = Modifier.size(19.dp))
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
        Row(verticalAlignment = Alignment.CenterVertically) { Text("构建 ${release.build}", color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.Medium); if (current) Text("当前", Modifier.padding(start = 7.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = .12f)).padding(horizontal = 7.dp, vertical = 3.dp), color = MaterialTheme.colorScheme.primary, fontSize = 9.sp); Spacer(Modifier.weight(1f)); Text(release.date, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
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
