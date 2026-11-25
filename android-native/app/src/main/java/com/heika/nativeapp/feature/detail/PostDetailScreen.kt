package com.heika.nativeapp.feature.detail

import com.heika.nativeapp.ui.HeikaAlertDialog
import android.content.Intent
import android.net.Uri
import com.heika.nativeapp.ui.HeikaMarkdown
import com.heika.nativeapp.ui.HeikaGlassDialog
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.HeikaNoticeKind

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.zIndex
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import kotlinx.coroutines.launch
import androidx.compose.ui.layout.onGloballyPositioned
import com.heika.nativeapp.ui.HeikaReadingType
import com.heika.nativeapp.ui.heikaReadingPalette
import com.heika.nativeapp.ui.markdownHeadings
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import kotlinx.coroutines.delay
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.imageCacheKey
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.LinkWarningPage
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.FilterChip
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.LocalHeikaBodyTextScale
import com.heika.nativeapp.ui.LocalHeikaTitleTextScale
import com.heika.nativeapp.ui.HeikaGlassSurface
import com.heika.nativeapp.ui.NativeShareSheet
import androidx.compose.foundation.layout.navigationBarsPadding
import com.heika.nativeapp.ui.HeikaGlassTokens
import com.heika.nativeapp.ui.HeikaAvatar
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaRadii
import com.heika.nativeapp.ui.heikaSharedPostImage
import com.heika.nativeapp.ui.heikaSharedPostMeta
import com.heika.nativeapp.ui.HeikaImageRatioCache
import com.heika.nativeapp.ui.sharedAuthorKey
import com.heika.nativeapp.ui.sharedImageKey
import com.heika.nativeapp.ui.sharedRatingKey
import com.heika.nativeapp.ui.sharedTagKey
import com.heika.nativeapp.ui.HeikaPulsePage
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
fun PostDetailScreen(
    post: HeikaPost? = null,
    postKey: String? = null,
    onBack: () -> Unit,
    onAuthor: (String) -> Unit,
    onLogin: () -> Unit,
    onShare: (HeikaPost) -> Unit,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    sharedElementsEnabled: Boolean,
    onOpenCollection: (String) -> Unit = {},
    onOpenChapter: (String) -> Unit = {},
    onOpenPostById: (String) -> Unit = {},
    onOpenTopic: (String) -> Unit = {},
    hazeState: HazeState? = null,
    viewModel: PostDetailViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    val readingMode by viewModel.readingMode.collectAsStateWithLifecycle()
    val bodyTextScale = LocalHeikaBodyTextScale.current
    val titleTextScale = LocalHeikaTitleTextScale.current
    LaunchedEffect(state.notice) {
        val message = state.notice
        if (message != null && !message.contains("登录")) {
            val kind = when {
                message.contains("失败") || message.contains("无法") -> HeikaNoticeKind.ERROR
                message.contains("不可用") -> HeikaNoticeKind.WARNING
                else -> HeikaNoticeKind.SUCCESS
            }
            HeikaNoticeBus.show(message, kind)
            viewModel.clearNotice()
        }
    }
    val imageLoader = LocalHeikaImageLoader.current
    var draft by remember(post?.cloudId, postKey) { mutableStateOf("") }
    val commentFocusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    var replyTo by remember(post?.cloudId, postKey) { mutableStateOf<String?>(null) }
    var reportOpen by remember(post?.cloudId, postKey) { mutableStateOf(false) }
    var linkWarning by remember { mutableStateOf<String?>(null) }
    var reportReason by remember { mutableStateOf("垃圾营销或重复内容") }
    var reportNote by remember { mutableStateOf("") }
    var moreOpen by remember { mutableStateOf(false) }
    var shareOpen by remember { mutableStateOf(false) }
    var previewIndex by remember(post?.cloudId, postKey) { mutableStateOf<Int?>(null) }
    var aiMoreAction by remember(state.post?.cloudId) { mutableStateOf<String?>(null) }
    var feedbackOpen by remember { mutableStateOf(false) }
    var feedbackText by remember { mutableStateOf("") }
    var feedbackCategory by remember { mutableStateOf("problem") }
    var commentMenu by remember { mutableStateOf<NativeComment?>(null) }
    var commentReport by remember { mutableStateOf<NativeComment?>(null) }
    var commentDeleteConfirm by remember { mutableStateOf<NativeComment?>(null) }
    var postDeleteConfirm by remember { mutableStateOf(false) }
    var expandedReplyThreads by remember { mutableStateOf(setOf<String>()) }
    // 阅读系统 2.0：评论/目录改为独立面板，正文里不再常驻评论列表。
    val reading = heikaReadingPalette()
    var commentsOpen by remember { mutableStateOf(false) }
    var commentFocusOnOpen by remember { mutableStateOf(false) }
    var tocOpen by remember { mutableStateOf(false) }
    val headingOffsets = remember { androidx.compose.runtime.mutableStateMapOf<Int, Float>() }
    val headings = remember(state.post?.body, post?.body) { markdownHeadings((state.post ?: post)?.body.orEmpty()) }
    val commentTotal = state.comments.size
    val listState = rememberLazyListState()
    var articleHeight by remember { mutableFloatStateOf(0f) }
    val readable = headings.size >= 3
    val scrolled by remember { derivedStateOf {
        val info = listState.layoutInfo
        val first = info.visibleItemsInfo.firstOrNull() ?: return@derivedStateOf 0f
        if (first.index == 0) (-first.offset).toFloat() else articleHeight
    } }
    val progress by remember { derivedStateOf {
        if (articleHeight <= 0f) 0f else ((scrolled + listState.layoutInfo.viewportEndOffset) / articleHeight).coerceIn(0f, 1f)
    } }
    val currentHeading by remember { derivedStateOf {
        headingOffsets.entries.filter { it.value <= scrolled + 140f }.maxByOrNull { it.value }?.key ?: -1
    } }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val headerOffsetPx = with(androidx.compose.ui.platform.LocalDensity.current) { 78.dp.toPx() }

    // 阅读位置恢复：只对长文生效，且只在首次测量完成后执行一次。
    var restored by remember(state.post?.cloudId, post?.cloudId) { mutableStateOf(false) }
    LaunchedEffect(articleHeight, state.post?.cloudId, post?.cloudId) {
        val id = state.post?.cloudId ?: post?.cloudId
        if (!restored && readable && articleHeight > 1200f && !id.isNullOrBlank()) {
            restored = true
            val saved = viewModel.readingProgress(id)
            if (saved != null && saved > 0.05f) listState.scrollToItem(0, (articleHeight * saved).toInt())
        }
    }
    // 进度写盘做节流：只在停手 1.2s 后写一次，且变化超过 2%。
    var lastSaved by remember(state.post?.cloudId, post?.cloudId) { mutableFloatStateOf(-1f) }
    LaunchedEffect(progress, readable) {
        val id = state.post?.cloudId ?: post?.cloudId ?: return@LaunchedEffect
        if (!readable || progress <= 0.02f) return@LaunchedEffect
        if (lastSaved > 0f && kotlin.math.abs(progress - lastSaved) < 0.02f) return@LaunchedEffect
        delay(1200)
        lastSaved = progress
        viewModel.recordReadingProgress(id, progress)
    }
    LaunchedEffect(state.commentSubmitted) {
        if (state.commentSubmitted > 0) {
            replyTo?.let { targetId ->
                var target = state.comments.firstOrNull { it.id == targetId }
                val seen = mutableSetOf<String>()
                while (true) {
                    val current = target ?: break
                    val parentId = current.parentId ?: break
                    if (!seen.add(current.id)) break
                    target = state.comments.firstOrNull { it.id == parentId }
                }
                expandedReplyThreads = expandedReplyThreads + (target?.id ?: targetId)
            }
            draft = ""
            replyTo = null
        }
    }
    LaunchedEffect(post?.cloudId, postKey) {
        if (post != null) viewModel.load(post) else if (!postKey.isNullOrBlank()) viewModel.loadByKey(postKey)
    }
    // Keep the destination image composed on its first frame so the shared element can
    // pair with the tapped card before the detail request starts or refreshes.
    val visiblePost = if (post != null && state.post?.sharedImageKey() != post.sharedImageKey()) post else state.post ?: post
    val dockHaze = rememberHazeState()
    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (state.loading && visiblePost == null) {
            HeikaPulsePage(cards = 2, cardHeight = 132.dp)
        } else if (visiblePost == null) {
            Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(state.error ?: "内容暂时无法显示", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = viewModel::reload) { Icon(HeikaIcons.Retry, null); Text("重试") }
            }
        } else {
            Box(Modifier.weight(1f).fillMaxWidth()) {
            val item = visiblePost
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().hazeSource(dockHaze),
                // 底部留出操作栏高度 + 安全区，正文最后一行不会被底栏压住。
                contentPadding = PaddingValues(top = 64.dp, bottom = 128.dp),
                verticalArrangement = Arrangement.spacedBy(13.dp),
            ) {
                item {
                    Column(
                        Modifier.onGloballyPositioned { articleHeight = it.size.height.toFloat() },
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        // 无封面时不生成虚假的图片区，标题自然上移；正文里的真实图片仍照常展示。
                        if (item.images.size > 1) {
                            val pagerState = rememberPagerState(pageCount = { item.images.size })
                            val pagedRatio = (HeikaImageRatioCache.get(item.cloudId) ?: 0.8f).coerceIn(0.62f, 1.78f)
                            Box(Modifier.fillMaxWidth().aspectRatio(pagedRatio).background(MaterialTheme.colorScheme.surfaceVariant)) {
                                HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                                    val sharedImageModifier = if (page == 0 && sharedElementsEnabled) with(sharedTransitionScope) {
                                        Modifier.heikaSharedPostImage(sharedTransitionScope, animatedVisibilityScope, item.sharedImageKey(), isDetail = true, enabled = true)
                                    } else Modifier
                                    DetailImage(
                                        url = item.images[page],
                                        thumbUrl = item.thumbnail,
                                        postId = item.cloudId,
                                        index = page,
                                        contentDescription = "${item.title}，第 ${page + 1} 张",
                                        imageLoader = imageLoader,
                                        contentScale = ContentScale.Fit,
                                        modifier = Modifier.fillMaxSize().then(sharedImageModifier).clickable { previewIndex = page },
                                    )
                                }
                                val counterShape = RoundedCornerShape(50)
                                HeikaGlassSurface(
                                    hazeState = hazeState,
                                    modifier = Modifier.align(Alignment.BottomEnd).padding(10.dp)
                                        .border(.6.dp, MaterialTheme.colorScheme.outline.copy(alpha = .5f), counterShape),
                                    shape = counterShape,
                                    contentPadding = PaddingValues(horizontal = 9.dp, vertical = 5.dp),
                                    drawTopHighlight = false,
                                ) {
                                    Text("${pagerState.currentPage + 1} / ${item.images.size}", color = MaterialTheme.colorScheme.onSurface, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                                }
                            }
                        } else item.images.forEachIndexed { index, image ->
                            val sharedImageModifier = if (index == 0 && sharedElementsEnabled) with(sharedTransitionScope) {
                                Modifier.heikaSharedPostImage(sharedTransitionScope, animatedVisibilityScope, item.sharedImageKey(), isDetail = true, enabled = true)
                            } else Modifier
                            DetailImage(
                                url = image,
                                thumbUrl = item.thumbnail,
                                postId = item.cloudId,
                                index = index,
                                contentDescription = item.title,
                                imageLoader = imageLoader,
                                contentScale = ContentScale.FillWidth,
                                lockRatio = true,
                                modifier = Modifier.fillMaxWidth().then(sharedImageModifier).clickable { previewIndex = index },
                            )
                        }
                        // 标题参与共享转场，必须待在淡入层之外；其余内容等封面落位后再出现。
                        Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        // 标签与评分参与共享转场，必须待在淡入层之外，否则飞行途中会被父级 alpha 抹掉。
                        // 阅读数是详情页独有信息，卡片上没有对应物，仍然走淡入。
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                            Text(
                                item.tag,
                                if (sharedElementsEnabled) with(sharedTransitionScope) {
                                    Modifier.heikaSharedPostMeta(sharedTransitionScope, animatedVisibilityScope, item.sharedTagKey())
                                } else Modifier.detailContentReveal(enabled = true, delayMillis = 20),
                                color = MaterialTheme.colorScheme.primary,
                                fontSize = 11.sp,
                            )
                            Row(
                                if (sharedElementsEnabled) with(sharedTransitionScope) {
                                    Modifier.heikaSharedPostMeta(sharedTransitionScope, animatedVisibilityScope, item.sharedRatingKey())
                                } else Modifier.detailContentReveal(enabled = true, delayMillis = 20),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(HeikaIcons.StarOutline, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                                if (item.hasRating) Text(String.format(java.util.Locale.US, "%.1f", item.ratingAverage), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                                else Text("待评级", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                            }
                            Spacer(Modifier.weight(1f))
                            Text("${item.viewCount} 阅读", Modifier.detailContentReveal(sharedElementsEnabled, delayMillis = 30), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                        // 标题不再做跨页共享：15sp 卡面标题与 22sp 详情标题字号差距太大，
                        // 共享过程里字号会出现跳变，不如让它随正文一起淡入。
                        // 只读正文与标题允许选择复制；不做成输入框，避免误改。
                        SelectionContainer {
                            Text(
                                item.title,
                                Modifier.detailContentReveal(enabled = true, delayMillis = 45),
                                color = MaterialTheme.colorScheme.onBackground,
                                fontSize = 22.sp * titleTextScale,
                                lineHeight = 31.sp * titleTextScale,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        item.aiSummary?.let { summary ->
                            // 内联摘要：不使用卡片底色或边框，靠金色标识与次级文字融入阅读排版。
                            var summaryExpanded by remember(summary) { mutableStateOf(false) }
                            val summaryCollapsible = summary.length > 96
                            Column(
                                Modifier.fillMaxWidth().detailContentReveal(enabled = true, delayMillis = 75),
                                verticalArrangement = Arrangement.spacedBy(3.dp),
                            ) {
                                Row(
                                    Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .clickable(enabled = summaryCollapsible) { summaryExpanded = !summaryExpanded }
                                        .padding(vertical = 2.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                                ) {
                                    Icon(HeikaIcons.Robot, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(12.dp))
                                    Text("AI 摘要", color = MaterialTheme.colorScheme.primary, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold)
                                    if (summaryCollapsible) {
                                        Text(
                                            if (summaryExpanded) "收起" else "展开",
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontSize = 10.sp,
                                        )
                                    }
                                }
                                Text(
                                    summary,
                                    Modifier.animateContentSize(),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 12.5.sp,
                                    lineHeight = 19.sp,
                                    maxLines = if (summaryExpanded || !summaryCollapsible) Int.MAX_VALUE else 3,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                        Column(Modifier.fillMaxWidth().detailContentReveal(sharedElementsEnabled, delayMillis = 170), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        // 作者区：横向紧凑排列，头像 36dp，第二行放时间与阅读数，
                        // 关注按钮收窄但保留 44dp 热区，不再占掉一整行高度。
                        Row(
                            Modifier.fillMaxWidth().clickable(enabled = item.authorId != null) { item.authorId?.let(onAuthor) }
                                .padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            HeikaAvatar(item.authorAvatar, item.author, 36.dp, contentDescription = "${item.author}头像")
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                    Text(
                                        item.author,
                                        (if (sharedElementsEnabled) with(sharedTransitionScope) {
                                            Modifier.heikaSharedPostMeta(sharedTransitionScope, animatedVisibilityScope, item.sharedAuthorKey())
                                        } else Modifier).weight(1f, fill = false),
                                        color = reading.title,
                                        fontSize = 13.5.sp,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    item.authorBadges.take(4).forEach { badge ->
                                        val badgeTint = runCatching { Color(android.graphics.Color.parseColor(badge.color)) }.getOrDefault(reading.accent)
                                        Icon(HeikaIcons.Shield, contentDescription = "${badge.label}认证", tint = badgeTint, modifier = Modifier.size(13.dp))
                                    }
                                }
                                Text(
                                    "${item.date} · ${item.viewCount} 阅读",
                                    color = reading.muted,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            if (item.authorId != null) {
                                val followShape = RoundedCornerShape(999.dp)
                                Box(
                                    Modifier.height(32.dp)
                                        .clip(followShape)
                                        .border(.8.dp, if (state.following) reading.line else reading.accent.copy(alpha = .55f), followShape)
                                        .clickable(enabled = !state.followSending, onClick = viewModel::toggleFollow)
                                        .padding(horizontal = 14.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (state.followSending) CircularProgressIndicator(Modifier.size(13.dp), strokeWidth = 1.7.dp, color = reading.accent)
                                    else Text(
                                        if (state.following) "已关注" else "关注",
                                        color = if (state.following) reading.muted else reading.accent,
                                        fontSize = 12.sp,
                                    )
                                }
                            }
                        }
                        // 正文：16sp 起跳，行高 1.75；阅读模式只放大字号，不改颜色层级。
                        val modeScale = when (readingMode) { "focus" -> 1.1f; "night" -> 1.04f; else -> 1f }
                        val bodyFont = HeikaReadingType.body * bodyTextScale * modeScale
                        SelectionContainer {
                            HeikaMarkdown(
                                source = item.body,
                                baseSize = bodyFont,
                                palette = reading,
                                onLinkClick = { linkWarning = it },
                                onHeadingPositioned = { ordinal, y -> headingOffsets[ordinal] = y },
                            )
                        }
                        if (item.channel == "ai") {
                            AiResourceDetails(
                                contentType = item.contentType,
                                resourceData = item.resourceData,
                                versions = state.aiVersions,
                                versionsLoading = state.aiVersionsLoading,
                                versionsError = state.aiVersionsError,
                                feedbackSending = state.aiFeedbackSending,
                                feedbackSubmitted = state.aiFeedbackSubmitted,
                                onRetryVersions = { viewModel.loadAiVersions(item, force = true) },
                                onSubmitFeedback = { kind, details -> viewModel.submitAiFeedback(kind, details) },
                                onOpenAttachment = { path, name -> viewModel.openAttachment(path, name) },
                                action = aiMoreAction,
                                onActionClose = { aiMoreAction = null },
                            )
                        }
                        item.tags.takeIf { it.isNotEmpty() }?.let { tags ->
                            Text(tags.joinToString("  ") { "#$it" }, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                        }
                        // 合集上下文：章节号 + 回目录 + 上一章/下一章，保证连载与教程能连续读完。
                        val seriesId = state.seriesId
                        val seriesTitle = state.seriesTitle
                        if (seriesId != null && seriesTitle != null) {
                            // 顶部只留一张轻量合集卡：合集名 + 章节进度 + 目录。
                            // 上一章/下一章移到正文末尾，阅读时不必一直被两个按钮占位。
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.chip))
                                    .background(MaterialTheme.colorScheme.surface)
                                    .border(.8.dp, MaterialTheme.colorScheme.outline.copy(alpha = .4f), RoundedCornerShape(HeikaRadii.chip))
                                    .clickable { onOpenCollection(seriesId) }
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(HeikaIcons.List, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    if (state.chapterIndex > 0) {
                                        Text("第 ${state.chapterIndex} / ${state.chapterCount} 章 · 合集", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.5.sp)
                                    }
                                    Text(
                                        seriesTitle,
                                        color = MaterialTheme.colorScheme.onBackground,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                Text("目录", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                                Icon(HeikaIcons.Forward, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(12.dp))
                            }
                        }
                        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("评分", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            (1..5).forEach { score ->
                                RatingStar(score, (state.rating ?: 0) >= score, ratingColor(score), state.ratingAnimationKey, state.ratingAnimationScore, !state.ratingSending, onClick = { viewModel.rate(score) })
                            }
                            Spacer(Modifier.weight(1f))
                            val average by animateFloatAsState(state.average?.toFloat() ?: 0f, tween(HeikaMotion.rating, easing = HeikaMotion.standard), label = "post-rating-average")
                            Text(state.average?.let { String.format(java.util.Locale.US, "%.1f", average) } ?: "—", color = if (state.average != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            if (state.ratingSending) CircularProgressIndicator(Modifier.padding(start = 4.dp).size(14.dp), strokeWidth = 1.8.dp)
                        }
                        state.ratingError?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        val prevKey = state.prevChapterKey
                        val nextKey = state.nextChapterKey
                        if (state.seriesId != null && (prevKey != null || nextKey != null)) {
                            Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (prevKey != null) ChapterNavButton("上一章", prevKey, Modifier.weight(1f), onOpenChapter)
                                if (prevKey != null && nextKey != null) {
                                    Row(
                                        Modifier.clip(RoundedCornerShape(HeikaRadii.chip))
                                            .background(MaterialTheme.colorScheme.surface)
                                            .clickable { state.seriesId?.let(onOpenCollection) }
                                            .padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Icon(HeikaIcons.List, contentDescription = "目录", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
                                    }
                                }
                                if (nextKey != null) ChapterNavButton("下一章", nextKey, Modifier.weight(1f), onOpenChapter)
                            }
                        }
                        // 文章末尾：全文完 → 话题 → 所属合集 → 参与讨论 → 相关推荐。
                        // 评论列表已经搬到独立面板，这里只留一个轻量入口。
                        Row(
                            Modifier.fillMaxWidth().padding(top = 24.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(Modifier.weight(1f).height(1.dp).background(reading.line))
                            Text("全文完", color = reading.muted, fontSize = 11.sp)
                            Box(Modifier.weight(1f).height(1.dp).background(reading.line))
                        }
                        item.tags.takeIf { it.isNotEmpty() }?.let { tags ->
                            Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                tags.distinct().take(6).forEach { topic ->
                                    Text(
                                        "#$topic",
                                        Modifier.clip(RoundedCornerShape(999.dp))
                                            .border(.8.dp, reading.line, RoundedCornerShape(999.dp))
                                            .clickable { onOpenTopic(topic) }
                                            .padding(horizontal = 10.dp, vertical = 5.dp),
                                        color = reading.secondary,
                                        fontSize = 11.sp,
                                    )
                                }
                            }
                        }
                        if (state.seriesId != null && state.seriesTitle != null) {
                            Row(
                                Modifier.fillMaxWidth().padding(top = 18.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(reading.field)
                                    .clickable { state.seriesId?.let(onOpenCollection) }
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Icon(HeikaIcons.List, contentDescription = null, tint = reading.accent, modifier = Modifier.size(18.dp))
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text("所属合集", color = reading.muted, fontSize = 10.sp)
                                    Text(
                                        state.seriesTitle.orEmpty(),
                                        color = reading.title,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (state.chapterCount > 0) Text(
                                        "共 ${state.chapterCount} 章 · 当前第 ${state.chapterIndex} 章",
                                        color = reading.muted,
                                        fontSize = 10.5.sp,
                                    )
                                }
                                Text("查看合集", color = reading.accent, fontSize = 11.sp)
                                Icon(HeikaIcons.Forward, contentDescription = null, tint = reading.accent, modifier = Modifier.size(12.dp))
                            }
                        }
                        Row(
                            Modifier.fillMaxWidth().padding(top = 18.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(reading.field)
                                .clickable { commentsOpen = true }
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(9.dp),
                        ) {
                            Icon(HeikaIcons.Comment, contentDescription = null, tint = reading.accent, modifier = Modifier.size(17.dp))
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    if (state.comments.isNotEmpty() || commentTotal > 0) "参与讨论 · ${if (commentTotal > 0) commentTotal else state.comments.size} 条" else "参与讨论",
                                    color = reading.title,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text("在底部评论面板里查看与回复", color = reading.muted, fontSize = 11.sp)
                            }
                            Icon(HeikaIcons.Forward, contentDescription = null, tint = reading.muted, modifier = Modifier.size(14.dp))
                        }
                        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        state.notice?.takeIf { it.contains("登录") }?.let { message ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(message, Modifier.weight(1f), color = reading.muted, fontSize = 11.sp)
                                if (message.contains("登录")) TextButton(onClick = onLogin) { Text("登录") }
                            }
                        }
                        RelatedBlocks(
                            related = state.related,
                            onOpenPost = onOpenPostById,
                            onOpenSeries = onOpenCollection,
                            onOpenTopic = onOpenTopic,
                        )
                            }
                        }
                    }
                }
            }
            // 底部操作栏常驻：黑色微模糊、图标与热区统一，不再随滚动隐藏。
            ReadingDock(
                commentCount = if (commentTotal > 0) commentTotal else state.comments.size,
                liked = state.liked,
                likeCount = state.likeCount ?: state.post?.likeCount ?: 0,
                saved = state.saved,
                likeSending = state.likeSending,
                saveSending = state.saveSending,
                onComment = { commentsOpen = true; commentFocusOnOpen = false },
                onInput = { commentFocusOnOpen = true; commentsOpen = true },
                onLike = viewModel::toggleLike,
                onSave = viewModel::toggleSaved,
                onShare = { if (item.status == "published") shareOpen = true },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
            }
        }
    }
    // 顶栏：实心底色 + 轻微模糊。以前是从上往下淡出的渐变，模糊层会一直
    // 延伸到封面和正文顶部，正文滚到下面时还会透色；现在只保留一条实心条。
    Box(
        Modifier
            .align(Alignment.TopCenter)
            .fillMaxWidth()
            .background(reading.page.copy(alpha = .97f))
            .zIndex(2f),
    ) {
        BackHeader(visiblePost?.let { if (it.channel == "ai") "AI · HEIKA" else "${it.tag} · HEIKA" } ?: "内容详情", onBack, centeredTitle = true, modifier = Modifier.zIndex(1f), trailing = {
            Row(verticalAlignment = Alignment.CenterVertically) {
            if (headings.size >= 3) androidx.compose.material3.IconButton(onClick = { tocOpen = true }) {
                Icon(HeikaIcons.List, contentDescription = "文章目录", tint = reading.title, modifier = Modifier.size(19.dp))
            }
            Box {
                androidx.compose.material3.IconButton(onClick = { moreOpen = true }) { Icon(HeikaIcons.More, "更多操作", tint = MaterialTheme.colorScheme.onBackground) }
                BackHandler(enabled = moreOpen) { moreOpen = false }
                val current = state.post
                // 菜单淡入并轻微放大，收起时反向播放。Popup 在退出动画结束后才移除，
                // 否则关闭的一瞬间会整块消失，观感是"闪了一下"。
                var menuMounted by remember { mutableStateOf(false) }
                LaunchedEffect(moreOpen) {
                    if (moreOpen) menuMounted = true else { kotlinx.coroutines.delay(150); menuMounted = false }
                }
                if (menuMounted && current != null) Popup(
                    alignment = Alignment.TopEnd,
                    offset = IntOffset(0, with(androidx.compose.ui.platform.LocalDensity.current) { 48.dp.roundToPx() }),
                    onDismissRequest = { moreOpen = false },
                    properties = PopupProperties(focusable = moreOpen, dismissOnBackPress = true, dismissOnClickOutside = true),
                ) {
                    HeikaDropdownFade(visible = moreOpen) {
                    val menuShape = RoundedCornerShape(HeikaGlassTokens.menuRadius)
                    HeikaGlassSurface(
                        hazeState = hazeState,
                        modifier = Modifier.widthIn(min = 188.dp, max = 218.dp).heightIn(max = 480.dp)
                            .border(.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = .45f), menuShape),
                        shape = menuShape,
                        contentPadding = PaddingValues(0.dp),
                        drawTopHighlight = false,
                    ) {
                    Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState())) {
                        Text("常用操作", Modifier.padding(start = 16.dp, top = 12.dp, bottom = 2.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                        DropdownMenuItem(text = { Text("复制链接") }, leadingIcon = { Icon(HeikaIcons.Copy, null) }, onClick = {
                            moreOpen = false
                            val url = if (current.channel == "ai") "https://moonclean.shop/?aiPost=${current.id}&cloudId=${android.net.Uri.encode(current.cloudId)}" else "https://moonclean.shop/?post=${current.id}"
                            (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("HEIKA 内容链接", url))
                            viewModel.showNotice("链接已复制")
                        })
                        if (current.status == "published") DropdownMenuItem(text = { Text("分享内容") }, leadingIcon = { Icon(HeikaIcons.Share, null) }, onClick = { moreOpen = false; shareOpen = true })
                        if (current.channel == "ai") {
                            androidx.compose.material3.HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = .28f))
                            Text("资源与版本", Modifier.padding(start = 16.dp, top = 8.dp, bottom = 2.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                            val hasVersionData = state.aiVersionsLoading || state.aiVersions.isNotEmpty() || current.resourceData.has("version") || current.resourceData.has("changelog")
                            if (hasVersionData) DropdownMenuItem(
                                text = { Text(if (state.aiVersionsLoading) "查看更新记录 · 加载中" else "查看更新记录") },
                                leadingIcon = { Icon(HeikaIcons.Info, null) },
                                onClick = { moreOpen = false; aiMoreAction = "versions" },
                            )
                            if (current.resourceData.length() > 0) DropdownMenuItem(
                                text = { Text("相关资源") },
                                leadingIcon = { Icon(HeikaIcons.Download, null) },
                                onClick = { moreOpen = false; aiMoreAction = "resources" },
                            )
                            androidx.compose.material3.HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = .28f))
                            Text("反馈与操作", Modifier.padding(start = 16.dp, top = 8.dp, bottom = 2.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                            DropdownMenuItem(
                                text = { Text("内容纠错") },
                                leadingIcon = { Icon(HeikaIcons.Comment, null) },
                                onClick = { moreOpen = false; aiMoreAction = "feedback" },
                            )
                        }
                        androidx.compose.material3.HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = .28f))
                        Text("内容反馈", Modifier.padding(start = 16.dp, top = 8.dp, bottom = 2.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                        DropdownMenuItem(text = { Text("内容反馈") }, leadingIcon = { Icon(HeikaIcons.Comment, null) }, onClick = { moreOpen = false; feedbackOpen = true })
                        DropdownMenuItem(text = { Text("举报内容") }, leadingIcon = { Icon(HeikaIcons.Report, null) }, onClick = { moreOpen = false; commentReport = null; reportOpen = true })
                        androidx.compose.material3.HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = .28f))
                        Text("内容偏好", Modifier.padding(start = 16.dp, top = 8.dp, bottom = 2.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                        current.tags.firstOrNull()?.let { topic -> DropdownMenuItem(
                            text = { Column { Text("减少话题推荐"); Text("#$topic", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) } },
                            leadingIcon = { Icon(HeikaIcons.Block, null) },
                            onClick = { moreOpen = false; viewModel.muteTopic(topic) },
                        ) }
                        if (current.authorId != null) {
                            DropdownMenuItem(text = { Column { Text("不感兴趣"); Text("减少此作者推荐", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) } }, leadingIcon = { Icon(HeikaIcons.Block, null) }, onClick = { moreOpen = false; viewModel.muteAuthor() })
                            DropdownMenuItem(text = { Text("屏蔽作者") }, leadingIcon = { Icon(HeikaIcons.Block, null) }, onClick = { moreOpen = false; viewModel.blockAuthor() })
                        }
                        if (state.currentUserId != null && (state.currentUserId == current.authorId || state.canAdminDelete)) {
                            androidx.compose.material3.HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = .28f))
                            Text(if (state.currentUserId != current.authorId) "管理员操作" else "危险操作", Modifier.padding(start = 16.dp, top = 8.dp, bottom = 2.dp), color = MaterialTheme.colorScheme.error.copy(alpha = .9f), fontSize = 10.sp, fontWeight = FontWeight.Medium)
                            DropdownMenuItem(text = { Text("删除内容", color = MaterialTheme.colorScheme.error) }, leadingIcon = { Icon(HeikaIcons.Delete, null, tint = MaterialTheme.colorScheme.error) }, onClick = { moreOpen = false; postDeleteConfirm = true })
                        }
                    }
                    }
                    }
                }
            }
            }
        })
        // 阅读进度：1.5dp 品牌色细线，只在长文显示；评论面板/目录打开时不受影响。
        Box(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(1.5.dp)
                .background(if (readable) reading.progressTrack else Color.Transparent),
        ) {
            if (readable) Box(
                Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).height(1.5.dp).background(reading.accent),
            )
        }
    }
    if (tocOpen) {
        BackHandler { tocOpen = false }
        ReadingTocSheet(
            headings = headings,
            currentOrdinal = currentHeading,
            onSelect = { heading ->
                tocOpen = false
                val target = headingOffsets[heading.ordinal] ?: 0f
                scope.launch { listState.scrollToItem(0, (target - headerOffsetPx).toInt().coerceAtLeast(0)) }
            },
            onClose = { tocOpen = false },
        )
    }
    if (commentsOpen) {
        BackHandler { commentsOpen = false }
        CommentSheet(
            visible = commentsOpen,
            comments = state.comments,
            total = commentTotal,
            sort = state.commentSort,
            loading = state.commentsLoading,
            loadingMore = state.loadingMoreComments,
            hasMore = state.commentsHasMore,
            error = state.commentsError,
            sending = state.sending,
            draft = draft,
            replyToName = replyTo?.let { id -> state.comments.firstOrNull { it.id == id }?.author ?: "评论" },
            likeBusyIds = state.commentLikesSending,
            currentUserId = state.currentUserId,
            authorId = state.post?.authorId ?: post?.authorId,
            onDraftChange = { draft = it },
            onCancelReply = { replyTo = null },
            onSend = { viewModel.comment(draft, replyTo) },
            onClose = { commentsOpen = false; commentFocusOnOpen = false },
            onSort = { if (it != state.commentSort) viewModel.setCommentSort(it) },
            onLoadMore = { viewModel.loadMoreComments() },
            onRetry = { viewModel.retryComments() },
            onLike = { viewModel.toggleCommentLike(it) },
            onMore = { commentMenu = it },
            onReply = { replyTo = it.id; commentFocusOnOpen = true },
            focusInput = commentFocusOnOpen,
            onFocusHandled = { commentFocusOnOpen = false },
        )
    }
    if (shareOpen) {
        val sharePost = state.post ?: visiblePost
        if (sharePost != null) NativeShareSheet(
            post = sharePost,
            hazeState = dockHaze,
            onDismiss = { shareOpen = false },
            onRecord = { platform -> viewModel.recordShare(sharePost.id, platform) },
        )
    }
    }
    if (reportOpen) {
        val reasons = listOf("垃圾营销或重复内容", "骚扰、仇恨或攻击", "虚假或误导信息", "侵权或未经授权转载", "不适宜或危险内容", "其他")
        HeikaAlertDialog(
            onDismissRequest = { reportOpen = false; commentReport = null },
            title = { Text("举报内容") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Text("举报信息仅用于平台安全与人工复核。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    reasons.forEach { reason -> FilterChip(reason, reportReason == reason, {
                        if (reportReason != reason) {
                            reportReason = reason
                            HeikaNoticeBus.showSelection("举报原因：$reason")
                        }
                    }) }
                    OutlinedTextField(value = reportNote, onValueChange = { reportNote = it.take(300) }, label = { Text("补充说明（选填）") }, maxLines = 3)
                }
            },
            confirmButton = { TextButton(enabled = !state.operationSending, onClick = {
                commentReport?.let { viewModel.reportComment(it.id, reportReason, reportNote) } ?: viewModel.report(reportReason, reportNote)
                reportOpen = false
                commentReport = null
            }) { Text(if (state.operationSending) "提交中…" else "提交") } },
            dismissButton = { TextButton(onClick = { reportOpen = false; commentReport = null }) { Text("取消") } },
        )
    }
    previewIndex?.let { index ->
        val urls = state.post?.images ?: emptyList()
        if (urls.isNotEmpty()) ImagePreviewOverlay(urls = urls, initialIndex = index, onClose = { previewIndex = null })
    }
    commentMenu?.let { comment ->
        HeikaAlertDialog(
            onDismissRequest = { commentMenu = null },
            title = { Text("评论操作") },
            text = { Text(comment.body, maxLines = 4, overflow = TextOverflow.Ellipsis) },
            confirmButton = { TextButton(onClick = {
                (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("评论", comment.body))
                viewModel.showNotice("评论已复制")
                commentMenu = null
            }) { Icon(HeikaIcons.Copy, null); Text("复制") } },
            dismissButton = {
                Row {
                    TextButton(onClick = { replyTo = comment.id; commentMenu = null }) { Text("回复") }
                    TextButton(onClick = { commentReport = comment; reportReason = "垃圾营销或重复内容"; reportNote = ""; reportOpen = true; commentMenu = null }) { Text("举报") }
                    if (state.currentUserId != null && state.currentUserId == comment.authorId) TextButton(enabled = !state.operationSending, onClick = { commentDeleteConfirm = comment; commentMenu = null }) { Text("删除") }
                }
            },
        )
    }
    commentDeleteConfirm?.let { comment ->
        HeikaGlassDialog(
            title = "删除评论？",
            message = "删除后无法恢复。",
            confirmText = "删除",
            destructive = true,
            loading = state.operationSending,
            onConfirm = { viewModel.deleteComment(comment.id); commentDeleteConfirm = null },
            onCancel = { commentDeleteConfirm = null },
        )
    }
    if (postDeleteConfirm) HeikaGlassDialog(
        title = "删除内容？",
        message = "删除后内容将从社区移除，此操作不可撤销。",
        confirmText = "删除",
        destructive = true,
        dismissible = !state.operationSending,
        loading = state.operationSending,
        onConfirm = { viewModel.deletePost(onBack); postDeleteConfirm = false },
        onCancel = { postDeleteConfirm = false },
    )
    if (feedbackOpen) {
        HeikaAlertDialog(
            onDismissRequest = { feedbackOpen = false },
            title = { Text("内容反馈") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip("问题", feedbackCategory == "problem", { feedbackCategory = "problem"; HeikaNoticeBus.showSelection("反馈类型：问题") })
                        FilterChip("建议", feedbackCategory == "suggestion", { feedbackCategory = "suggestion"; HeikaNoticeBus.showSelection("反馈类型：建议") })
                        FilterChip("其他", feedbackCategory == "other", { feedbackCategory = "other"; HeikaNoticeBus.showSelection("反馈类型：其他") })
                    }
                    OutlinedTextField(value = feedbackText, onValueChange = { feedbackText = it.take(3000) }, label = { Text("反馈内容（至少 10 字）") }, minLines = 3, maxLines = 5)
                }
            },
            confirmButton = { TextButton(enabled = feedbackText.trim().length >= 10 && !state.operationSending, onClick = { viewModel.submitContentFeedback(feedbackCategory, "内容：${state.post?.title.orEmpty()}\n${feedbackText.trim()}"); feedbackOpen = false }) { Text(if (state.operationSending) "提交中…" else "提交") } },
            dismissButton = { TextButton(onClick = { feedbackOpen = false }) { Text("取消") } },
        )
    }
    LaunchedEffect(state.pendingAttachmentUrl) {
        val url = state.pendingAttachmentUrl ?: return@LaunchedEffect
        viewModel.consumeAttachmentUrl()
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            .onFailure { HeikaNoticeBus.show("没有能打开该附件的应用", HeikaNoticeKind.ERROR) }
    }
    linkWarning?.let { url ->
        // 整页提示，和网页端 /link-warning 保持一致，不再用弹窗。
        LinkWarningPage(url = url, onDismiss = { linkWarning = null })
    }
}

@Composable
private fun ChapterNavButton(
    label: String,
    targetKey: String?,
    modifier: Modifier = Modifier,
    onOpenChapter: (String) -> Unit,
) {
    val enabled = !targetKey.isNullOrBlank()
    Text(
        label,
        modifier.clip(RoundedCornerShape(9.dp))
            .background(if (enabled) MaterialTheme.colorScheme.surface else Color.Transparent)
            .then(if (enabled) Modifier.clickable { targetKey?.let(onOpenChapter) } else Modifier)
            .padding(vertical = 8.dp),
        color = if (enabled) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .5f),
        fontSize = 11.sp,
        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
    )
}

@Composable
private fun InteractionIconButton(selected: Boolean, sending: Boolean, outline: androidx.compose.ui.graphics.vector.ImageVector, filled: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) .88f else 1f, tween(140), label = "${description}-press")
    val selectedScale = remember { Animatable(1f) }
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(selected) {
        if (selected) {
            selectedScale.snapTo(1f)
            selectedScale.animateTo(1.12f, tween(100))
            selectedScale.animateTo(1f, tween(150))
        } else selectedScale.snapTo(1f)
    }
    val tint by animateColorAsState(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, tween(180), label = "${description}-tint")
    IconButton(onClick = { haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove); onClick() }, enabled = !sending, interactionSource = source) {
        if (sending) CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 1.8.dp)
        else Icon(if (selected) filled else outline, description, tint = tint, modifier = Modifier.size(22.dp).graphicsLayer { scaleX = scale * selectedScale.value; scaleY = scale * selectedScale.value })
    }
}

@Composable
private fun CommentRow(
    comment: NativeComment,
    onReply: () -> Unit,
    onLike: () -> Unit,
    onMore: () -> Unit,
    likeBusy: Boolean,
    reply: Boolean = false,
    replyTargetName: String? = null,
    replyEnabled: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val imageLoader = LocalHeikaImageLoader.current
    Row(modifier.fillMaxWidth().padding(start = if (reply) 4.dp else 0.dp), horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.Top) {
        HeikaAvatar(comment.authorAvatar, comment.author, if (reply) 28.dp else 36.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(comment.author, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val bodyScale = LocalHeikaBodyTextScale.current
            Text(if (replyTargetName == null) comment.body else "回复 $replyTargetName：${comment.body}", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp * bodyScale, lineHeight = 19.sp * bodyScale)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(comment.createdAt.take(10), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Text("回复", Modifier.clickable(enabled = replyEnabled, onClick = onReply).padding(horizontal = 9.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onLike, enabled = !likeBusy, modifier = Modifier.size(32.dp)) {
                    Icon(if (comment.liked) HeikaIcons.LikeFilled else HeikaIcons.LikeOutline, "评论点赞", tint = if (comment.liked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                }
                if (comment.likeCount > 0) Text(comment.likeCount.toString(), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                androidx.compose.material3.IconButton(onClick = onMore, modifier = Modifier.size(32.dp)) {
                    Icon(HeikaIcons.More, "评论操作", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(17.dp))
                }
            }
        }
    }
}

/**
 * 详情页图片。
 *
 * 两件事同时解决：
 * 1. 高度抖动——容器比例在进入页面的第一帧就定好，之后不再变化。
 *    比例来自 [HeikaImageRatioCache]（列表卡片解码时写入），未命中时退回 4:5，
 *    原图就绪后只更新缓存、不改已经排好的高度。
 * 2. 图片切换生硬——底层常驻同一张缩略图当占位，原图就绪后 260ms 叠化浮现，
 *    缩略图同步淡出。缩略图在列表里刚解码过，内存缓存命中，占位是零延迟的。
 */
@Composable
private fun DetailImage(
    url: String,
    thumbUrl: String?,
    postId: String,
    index: Int,
    contentDescription: String,
    imageLoader: coil3.ImageLoader,
    contentScale: ContentScale,
    modifier: Modifier = Modifier,
    lockRatio: Boolean = false,
) {
    val context = LocalContext.current
    var attempt by remember(url, postId, index) { mutableStateOf(0) }
    var failed by remember(url, postId, index) { mutableStateOf(false) }
    var fullReady by remember(url, postId, index) { mutableStateOf(false) }

    // 比例只取一次。取到之后哪怕原图解码出不同数值也不覆盖，避免容器第二次改高度。
    val ratioState = remember(postId, url) {
        mutableFloatStateOf(HeikaImageRatioCache.get(postId) ?: 0f)
    }
    val resolvedRatio = ratioState.floatValue.takeIf { it > 0f }?.coerceIn(0.62f, 1.78f) ?: 0.8f

    val fullKey = imageCacheKey(postId, url, "detail-full-$index")
    val fullRequest = remember(context, url, postId, index, attempt) {
        ImageRequest.Builder(context).data(url)
            .memoryCacheKey(fullKey).diskCacheKey(fullKey)
            // 叠化由这里接管：coil 自带的 crossfade 在内存命中时不会触发，观感是硬切。
            .crossfade(false)
            .build()
    }
    val thumbRequest = remember(context, thumbUrl, postId) {
        thumbUrl?.takeIf { it.isNotBlank() }?.let { thumb ->
            val key = imageCacheKey(postId, thumb, "feed-thumb")
            ImageRequest.Builder(context).data(thumb)
                .memoryCacheKey(key).diskCacheKey(key)
                .crossfade(false)
                .build()
        }
    }

    val fullAlpha by animateFloatAsState(
        targetValue = if (fullReady) 1f else 0f,
        animationSpec = tween(260, easing = FastOutSlowInEasing),
        label = "detail-image-full-$index",
    )
    val thumbAlpha by animateFloatAsState(
        targetValue = if (fullReady) 0f else 1f,
        animationSpec = tween(180, easing = FastOutSlowInEasing),
        label = "detail-image-thumb-$index",
    )

    Box(
        modifier
            .then(if (lockRatio) Modifier.aspectRatio(resolvedRatio) else Modifier)
            .graphicsLayer { clip = true }
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        if (thumbRequest != null) {
            AsyncImage(
                model = thumbRequest,
                contentDescription = null,
                imageLoader = imageLoader,
                contentScale = contentScale,
                modifier = Modifier.fillMaxSize().graphicsLayer { alpha = thumbAlpha },
            )
        }
        AsyncImage(
            model = fullRequest,
            contentDescription = contentDescription,
            imageLoader = imageLoader,
            contentScale = contentScale,
            modifier = Modifier.fillMaxSize().graphicsLayer { alpha = fullAlpha },
            onState = { state ->
                when (state) {
                    is coil3.compose.AsyncImagePainter.State.Success -> {
                        fullReady = true
                        failed = false
                        if (ratioState.floatValue <= 0f) {
                            val size = state.painter.intrinsicSize
                            if (size.width > 0f && size.height > 0f) {
                                val ratio = size.width / size.height
                                ratioState.floatValue = ratio
                                HeikaImageRatioCache.put(postId, ratio)
                            }
                        }
                    }
                    is coil3.compose.AsyncImagePainter.State.Error -> {
                        failed = true
                        fullReady = false
                    }
                    else -> Unit
                }
            },
        )
        if (failed) {
            Text(
                "图片加载失败 · 重试",
                Modifier.align(Alignment.Center).clip(RoundedCornerShape(8.dp))
                    .background(Color.Black.copy(alpha = 0.62f))
                    .clickable { attempt++; failed = false }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                color = Color.White,
                fontSize = 12.sp,
            )
        }
    }
}

private fun ratingColor(score: Int) = Color(0xFFD0B571)

@Composable
private fun RatingStar(
    score: Int,
    selected: Boolean,
    color: Color,
    animationKey: Int,
    animationScore: Int,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val scale = remember { Animatable(1f) }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressScale by animateFloatAsState(if (pressed) .88f else 1f, tween(HeikaMotion.quick), label = "rating-star-press-$score")
    val haptics = LocalHapticFeedback.current
    val tint by animateColorAsState(
        targetValue = if (selected) color else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f),
        animationSpec = tween(190),
        label = "rating-star-color-$score",
    )
    LaunchedEffect(animationKey, animationScore, score) {
        if (animationKey == 0 || score > animationScore) return@LaunchedEffect
        delay((score - 1) * 58L)
        scale.animateTo(1.16f, tween(110))
        scale.animateTo(1f, tween(180))
    }
    Box(
        modifier = Modifier.size(40.dp)
            .selectable(selected = selected, interactionSource = interaction, indication = null, enabled = enabled, role = Role.RadioButton) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (selected) HeikaIcons.StarFilled else HeikaIcons.StarOutline,
            contentDescription = "$score 星",
            modifier = Modifier.graphicsLayer { scaleX = scale.value * pressScale; scaleY = scale.value * pressScale }.size(22.dp),
            tint = tint,
        )
    }
}


/** 图片共享元素进入后，让标签、评分与标题跟着淡入上浮，而不是同帧闪现。 */
@Composable
private fun Modifier.detailContentReveal(enabled: Boolean, delayMillis: Int = 90): Modifier {
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(delayMillis.toLong())
        started = true
    }
    val progress by animateFloatAsState(
        targetValue = if (!enabled || started) 1f else 0f,
        animationSpec = tween(360, easing = FastOutSlowInEasing),
        label = "detail-content-reveal",
    )
    // 只做叠化：不再带位移，翻页时正文原地淡入，避免"整页往上浮一下"。
    return this.graphicsLayer {
        alpha = progress
    }
}

/**
 * 下拉菜单的进出场：淡入并轻微放大，收起时反向播放，锚点在右上角。
 *
 * 单独抽成函数是有原因的：AnimatedVisibility 在 Column/Row 作用域里有同名的带 receiver 扩展，
 * 直接在 Popup 的 lambda 里调用会被解析成扩展版本并编译失败。这里没有 receiver，才会选到顶层函数。
 */
@Composable
private fun HeikaDropdownFade(visible: Boolean, content: @Composable () -> Unit) {
    androidx.compose.animation.AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(130)) + scaleIn(initialScale = .94f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(1f, 0f)),
        exit = fadeOut(tween(110)) + scaleOut(targetScale = .96f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(1f, 0f)),
    ) { content() }
}
