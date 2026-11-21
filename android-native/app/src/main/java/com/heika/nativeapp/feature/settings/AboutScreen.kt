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
    NativeRelease(74, "2026.11.21", listOf(
        "信息流卡片统一外壳：图片与作者互动栏同属一张卡，圆角 16dp、1px 细描边，纯文字作品不再留灰色占位。",
        "分类选中态改为圆角底色加细描边，取消文字下金色横线，横滑时选中项自动可见。",
        "「探索 AI 资源」改为紧凑横向功能卡，与内容卡同背景同圆角，随内容一起滚动。",
        "个人主页新增「合集」标签，与我的作品、我的收藏、我的点赞同级。",
        "合集详情拆分为阅读态与管理态：阅读页只保留封面、简介、开始/继续阅读、收藏与目录；资料、章节管理与发布审核收进右上角更多菜单。",
        "修复审核意见显示为 null 的问题：通过不显示、待审只显示审核中、退回显示真实原因。",
    )),
    NativeRelease(73, "2026.11.21", listOf(
        "作品合集：连载、教程与资源三种合集，支持目录、上一章/下一章、阅读进度、收藏与更新提醒。",
        "发布页新增轻量「加入合集」，作者主页新增合集区，作品详情可直接回到目录继续阅读。",
        "图片支持全屏查看、双指与双击缩放、多图切换，长按可保存或分享图片。",
    )),
    NativeRelease(72, "2026.11.21", listOf(
        "发布不再要求填写资源信息，只保留标题、正文、图片附件与分类话题，必填提示改为具体原因。",
        "AI 专区的「探索 AI 资源」随内容滚动，回到顶部才重新出现；顶部改为紧凑双行，分类横滑、搜索与筛选固定右侧。",
        "内容详情页顶栏改为纯黑，双悬浮栏统一 54dp 胶囊尺寸；无封面的作品不再显示灰色图片占位。",
    )),
    NativeRelease(71, "2026.11.20", listOf(
        "固态玻璃调亮：降低材质不透明度，提高亮度与饱和度，背景真正透出颜色，不再是深灰实心卡片。",
        "详情页改为左右两个独立悬浮模块：左侧评论入口，右侧点赞、收藏、分享；选中态统一为香槟金。",
        "新增应用内分享面板，微信、朋友圈、Telegram、X、QQ 使用统一尺寸的品牌图标，未安装时自动复制文案。",
    )),
    NativeRelease(70, "2026.11.20", listOf(
        "AI 资源中心的调用次数改为近 30 天口径，不再固定显示 0。",
    )),
    NativeRelease(69, "2026.11.20", listOf(
        "发布页重写：AI 自动判断投社区精选还是 AI 空间，AI 内容类型也由 AI 决定，不用手选。",
        "图片与视频入口改成等宽等高的两张卡片，不再一大一小。",
        "发现页分类默认只显示常用的几个，其余收进「更多」。",
        "管理后台补齐 AI 资源中心（批量总结、一键 AI 审核）与 App 下载入口。",
    )),
    NativeRelease(68, "2026.11.20", listOf(
        "AI 创作助手移到发布页正文下方，社区作品与 AI 内容都能直接用，不必再进二级面板。",
        "Markdown 优化改为发布按钮左侧的独立按钮：打开助手完成后先预览，确认才替换正文，可撤回。",
        "发布页底部按钮在小屏下重新排列，状态文案与按钮不再互相挤压。",
    )),
    NativeRelease(67, "2026.11.20", listOf(
        "附件上传增加文件内容校验，扩展名与文件头不一致时会被拒绝。",
        "AI 智能总结、自动分类与辅助审核接入新的后台任务队列，需管理员在后台启动。",
        "修复发布页格式工具栏、设置页隐私状态与关于页品牌说明的细节问题。",
    )),
    NativeRelease(66, "2026.11.19", listOf(
        "发布页附件上传增加真实进度和失败重试，精选内容与 AI 内容均可添加经服务端校验的附件。",
        "作品详情标题下展示版本匹配的 AI 摘要；详情页增加系统分享，分享前检查作品公开状态。",
        "全局玻璃材质减轻背景色彩透出并保留原有模糊，邀请函信封保留完整正文并修正翻盖与信纸层级。",
        "网页管理后台新增 AI 总结与审核任务、人工复审、已验证模型配置及真实 Token 资源统计入口。",
    )),
    NativeRelease(65, "2026.11.19", listOf(
        "全局视觉改为 Solid Glass 固态磨砂：取消流光、色散与过度透明，弹窗和菜单不再出现文字穿透。",
        "发现页卡片底部改为左侧作者与认证、右侧点赞与分享，两列瀑布流对齐统一，分享可直接唤起系统分享。",
        "私信中心整理为标题行、搜索与「全部消息 / 未读 / 找人」三段结构，会话列表对齐更清晰。",
        "详情页更多菜单按常用操作、内容反馈、内容偏好分组，超高菜单可在安全区域内滚动。",
        "底部导航改固态磨砂视觉，保留原有 3D 翻卡与共享转场动画。",
    )),
    NativeRelease(64, "2026.11.19", listOf(
        "主页卡池纳入精选与 AI 内容，按兴趣、质量、时效和近期阅读记录平衡排序；沿用每日翻卡额度并保存已翻卡状态。",
        "作者认证图标统一显示在个人主页、探索卡片、作品详情与私信资料旁，并读取服务端有效认证记录。",
        "系统公告与账号通知统一进入通知中心，和普通私信分开管理，历史聊天记录保留。",
        "AI 资源的版本、记录、相关资源与纠错入口收进详情页「更多」；无图作品使用文字封面承接标题与作者信息。",
        "邀请欢迎页改为可展开的信封邀请函；探索频道入口更紧凑，图片页码移入图片右下角。",
        "保留原有 3D 翻卡、详情共享转场与玻璃菜单动画；修复翻卡状态返回后丢失，并微调标签与评级底板间距。",
    )),
    NativeRelease(63, "2026.11.19", listOf(
        "认证管理与官方私信公告拆为两个独立后台模块；管理员可直接搜索已注册用户授予或撤销认证，也可生成邀请码和认证码。",
        "认证标签显示在个人主页与私信资料旁并带认证图标；认证码兑换移入设置，账号管理增加邮箱。",
        "修复会员中心当前会员状态不刷新的问题；下载页与大陆网络提示明确服务器位于新加坡。",
        "黑卡官方私信改为完整二级页面，保留公告图片和链接，入口名称改为「黑卡官方菌」。",
        "受邀欢迎页改为完整欢迎信；帖子详情的更多菜单恢复模糊并收窄。",
        "个人页下载 App 入口移入探索中心，管理后台加入认证和官方卡片公告管理。",
    )),
    NativeRelease(61, "2026.11.18", listOf(
        "取消详情页、设置页、我的、个人主页与私聊页的顶栏模糊：滚动时不再出现闪烁和错位。",
        "封面左上角的标签与右上角的评分压缩高度，卡片上留给内容的区域更多。",
        "首页翻卡退场时背景从第一帧就开始褪去模糊，不再等卡片落回原位才变清晰。",
        "页面切换统一改为叠化：去掉上下位移与缩放，封面到详情的连贯飞行仍然保留。",
        "账号页常驻「本机账号」，新增「登录其他账号」入口，切换不再藏起来。",
        "外部链接提示收进圆角卡片，风险说明与按钮都在框内。",
    )),
    NativeRelease(60, "2026.11.18", listOf(
        "正文排版升级：代码块带语言与一键复制，支持表格、任务列表和 Mermaid 流程图。",
        "账号页可以快捷更换本机登录过的账号，切换无需重新输入密码。",
        "详情页、设置页、我的、个人主页与私聊页的顶栏加上毛玻璃效果。",
        "探索任务、等级徽章与成长记录统一放进圆角卡片。",
        "账号管理改为紧凑列表，并支持删除账号。",
        "AI 资源详情页把版本记录与异议反馈收进「更多」。",
        "站外链接改为整页风险提示，不再弹窗。",
        "修复他人作品附件无法下载的问题。",
        "点赞与收藏的加载状态相互独立，点爱心时收藏按钮不再转圈。",
    )),
    NativeRelease(59, "2026.11.18", listOf(
        "注册安全升级：同一 IP 每小时最多注册 2 个账号，超出后会提示稍后再试。",
        "注册后的恢复码改为独立页面展示，必须确认已保存才能进入黑卡。",
        "页面加载占位统一换成呼吸脉冲骨架，不再出现系统转圈。",
        "正文里的链接会自动识别，裸域名也能直接点；#话题 自动高亮。",
        "发布页可以自定义添加话题，即时生效，不需要审核。",
        "发布与私信的发送按钮换成上行箭头，按钮改为圆形，动作更明确。",
        "管理后台焕新：作品审核支持一键通过 / 一键驳回的预设理由，长内容默认收起。",
        "关于页统一为圆角矩形卡片，开发者改为双署名：SunYu（孙宇）与 WangXiangYu（王祥余）。",
        "个人页「会员中心」加上底色，昵称旁的等级标记去掉背景。",
    )),
    NativeRelease(58, "2026.11.17", listOf(
        "修复无法删除已发布内容：被探索页广告位引用的作品现在会先解除引用再删除",
        "私信「删除」改为「撤回」：双方同时消失，只允许 3 分钟内撤回，面板带倒计时",
        "发布页焕新：写作与预览双态切换，格式工具常驻正文上方",
        "正文支持 Markdown：标题、列表、引用、代码、加粗，链接高亮可点",
        "点开站外链接先弹风险提示，确认后才离开黑卡",
        "AI 内容可以挂附件：最多 3 个，单个 30 MB，全服每天 20 个名额",
        "视频发布 Beta 保留入口，内测期间暂未开放上传",
    )),
    NativeRelease(57, "2026.11.17", listOf(
        "启用全新黑卡品牌图标：白色发光圆角方框，桌面图标、启动页与关于页统一替换。",
        "自适应图标改为透明前景加纯黑底色，各品牌桌面圆角与圆形裁切下都不再露出边角。",
        "关于页图标改为圆角方形展示，深色与浅色主题下都不再出现生硬的黑色方块。",
        "关于开发者改为署名 SunYu。",
    )),
    NativeRelease(56, "2026.11.17", listOf(
        "实测反馈修复：长按自己的私信可以删除，删除后对方也会看到它消失。",
        "注册成功后必须先保存恢复码：这是目前唯一能找回密码的方式。",
        "详情页大图改为先用同比例缩略图占位，高清图加载完成时叠化浮现，页面不再上下跳。",
        "卡片标题不再压一层底部渐变，改用文字阴影，画面不再被压暗。",
        "管理员中心新增公告管理，可以直接在 App 里编辑并发布公告。",
        "「更多」菜单、消息长按等交互补上淡入淡出与按压反馈。",
    )),
    NativeRelease(55, "2026.11.17", listOf(
        "标签、评分与作者名也参与卡片到详情的连续转场，和封面图一起移动。",
        "撤掉标题的跨页动画：两端字号差距大，回退为随正文淡入，不再出现字号跳变。",
        "修复登录时密码被清空、随后提示密码不正确的问题。",
        "密码框保留输入法的组合状态，末尾字符不再丢失；登录失败也不再清空已经输入的内容。",
    )),
    NativeRelease(54, "2026.11.17", listOf(
        "修复弱网、请求超时与登录态过期造成的闪退：接口异常只记录日志，不再终止进程。",
        "全应用 161 处协程调用统一加上异常处理，翻卡、私信、设置、详情都覆盖。",
        "上一版的公告启动崩溃同步修好，打开即可正常进入。",
    )),
    NativeRelease(53, "2026.11.17", listOf(
        "修复弱网、超时或登录态过期时闪退：网络异常不再把整个 App 一起带崩溃。",
        "协程异常增加统一兜底，异常只记录日志，页面回到可重试状态。",
    )),
    NativeRelease(52, "2026.11.17", listOf(
        "修复 2.5.0/2.6.0 一打开就闪退：公告的依赖没在构建时生成完整，启动即报错退出。",
        "公告改为不经过依赖注入的独立加载，单个组件出问题不再连带整个 App 起不来。",
        "构建流程加入代码生成完整性校验，同类问题会在发布前被拦下。",
    )),
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
                    Image(painterResource(R.drawable.ic_heika_original), contentDescription = "黑卡应用图标", modifier = Modifier.size(72.dp).clip(RoundedCornerShape(18.dp)), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
                    Text("黑卡 HEIKA", color = MaterialTheme.colorScheme.onBackground, fontSize = 21.sp, fontWeight = FontWeight.SemiBold)
                    Text("翻开未知，遇见新的想法。", color = MaterialTheme.colorScheme.primary, fontSize = 13.sp)
                    Text("Android ${version.first}  ·  构建 ${version.second}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
            }
            item {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
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
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("SunYu（孙宇）", color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text("个人开发者", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("WangXiangYu（王祥余）", color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text("创意开发者", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                    }
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
