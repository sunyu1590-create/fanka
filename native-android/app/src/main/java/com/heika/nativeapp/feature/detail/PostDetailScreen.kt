package com.heika.nativeapp.feature.detail

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
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
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.FilterChip
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.HeikaGlassSurface
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.heikaSharedPostImage
import dev.chrisbanes.haze.HazeState

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
fun PostDetailScreen(
    post: HeikaPost? = null,
    postKey: String? = null,
    onBack: () -> Unit,
    onAuthor: (String) -> Unit,
    onLogin: () -> Unit,
    onShare: (HeikaPost) -> Unit,
    hazeState: HazeState,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    sharedElementsEnabled: Boolean,
    viewModel: PostDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val readingMode by viewModel.readingMode.collectAsStateWithLifecycle()
    val imageLoader = LocalHeikaImageLoader.current
    var draft by remember(post?.cloudId, postKey) { mutableStateOf("") }
    var replyTo by remember(post?.cloudId, postKey) { mutableStateOf<String?>(null) }
    var reportOpen by remember(post?.cloudId, postKey) { mutableStateOf(false) }
    var reportReason by remember { mutableStateOf("垃圾营销或重复内容") }
    var reportNote by remember { mutableStateOf("") }
    var ratingPanelOpen by remember(post?.cloudId, postKey) { mutableStateOf(false) }
    var draftRating by remember(post?.cloudId, postKey) { mutableIntStateOf(0) }
    var ratingKeyAtOpen by remember(post?.cloudId, postKey) { mutableIntStateOf(0) }
    val ratingBlur by animateDpAsState(if (ratingPanelOpen) 15.dp else 0.dp, tween(HeikaMotion.control), label = "rating-focus-blur")
    LaunchedEffect(state.commentSubmitted) {
        if (state.commentSubmitted > 0) {
            draft = ""
            replyTo = null
        }
    }
    LaunchedEffect(state.ratingAnimationKey) {
        if (ratingPanelOpen && state.ratingAnimationKey > ratingKeyAtOpen) ratingPanelOpen = false
    }
    BackHandler(enabled = ratingPanelOpen && !state.ratingSending) { ratingPanelOpen = false }
    LaunchedEffect(post?.cloudId, postKey) {
        if (post != null) viewModel.load(post) else if (!postKey.isNullOrBlank()) viewModel.loadByKey(postKey)
    }
    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).blur(ratingBlur)) {
        BackHeader("内容详情", onBack)
        if (state.loading && state.post == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else if (state.post == null) {
            Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(state.error ?: "内容暂时无法显示", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = viewModel::reload) { Icon(Icons.Outlined.Refresh, null); Text("重试") }
            }
        } else {
            val item = state.post!!
            var titleShown by remember(item.cloudId) { mutableStateOf(false) }
            var authorShown by remember(item.cloudId) { mutableStateOf(false) }
            var bodyShown by remember(item.cloudId) { mutableStateOf(false) }
            LaunchedEffect(item.cloudId, sharedElementsEnabled) {
                if (sharedElementsEnabled) delay(65)
                titleShown = true
                if (sharedElementsEnabled) delay(65)
                authorShown = true
                if (sharedElementsEnabled) delay(65)
                bodyShown = true
            }
            val titleAlpha by animateFloatAsState(if (titleShown) 1f else 0f, tween(190, easing = HeikaMotion.standard), label = "detail-title-enter")
            val authorAlpha by animateFloatAsState(if (authorShown) 1f else 0f, tween(190, easing = HeikaMotion.standard), label = "detail-author-enter")
            val bodyAlpha by animateFloatAsState(if (bodyShown) 1f else 0f, tween(190, easing = HeikaMotion.standard), label = "detail-body-enter")
            val listState = rememberLazyListState()
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(13.dp),
            ) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (item.images.size > 1) {
                            val pagerState = rememberPagerState(pageCount = { item.images.size })
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Box(Modifier.fillMaxWidth().widthIn(max = 440.dp).aspectRatio(1f).background(MaterialTheme.colorScheme.surfaceVariant)) {
                                    HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                                        val sharedImageModifier = if (page == 0 && sharedElementsEnabled) with(sharedTransitionScope) {
                                            Modifier.heikaSharedPostImage(sharedTransitionScope, animatedVisibilityScope, item.cloudId.ifBlank { item.id.toString() }, isDetail = true, enabled = true)
                                        } else Modifier
                                        RetryableDetailImage(
                                            url = item.images[page], postId = item.cloudId, variant = "detail-full-$page",
                                            contentDescription = "${item.title}，第 ${page + 1} 张",
                                            imageLoader = imageLoader,
                                            contentScale = ContentScale.Fit,
                                            modifier = Modifier.fillMaxSize().then(sharedImageModifier),
                                        )
                                    }
                                }
                                Text("${pagerState.currentPage + 1} / ${item.images.size}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.align(Alignment.End))
                            }
                        } else item.images.forEachIndexed { index, image ->
                            val sharedImageModifier = if (index == 0 && sharedElementsEnabled) with(sharedTransitionScope) {
                                Modifier.heikaSharedPostImage(sharedTransitionScope, animatedVisibilityScope, item.cloudId.ifBlank { item.id.toString() }, isDetail = true, enabled = true)
                            } else Modifier
                            RetryableDetailImage(
                                url = image, postId = item.cloudId, variant = "detail-full-$index",
                                contentDescription = item.title,
                                imageLoader = imageLoader,
                                contentScale = ContentScale.FillWidth,
                                modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp).then(sharedImageModifier),
                            )
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                            Text(item.tag, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                            Icon(HeikaIcons.StarOutline, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                            if (item.hasRating) Text(String.format(java.util.Locale.US, "%.1f", item.ratingAverage), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                            else Text("待评级", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                            Spacer(Modifier.weight(1f))
                            Text("${item.viewCount} 阅读", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                        Text(item.title, Modifier.graphicsLayer { alpha = titleAlpha; translationY = (1f - titleAlpha) * 6.dp.toPx() }, color = MaterialTheme.colorScheme.onBackground, fontSize = 22.sp, lineHeight = 31.sp, fontWeight = FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth().graphicsLayer { alpha = authorAlpha; translationY = (1f - authorAlpha) * 6.dp.toPx() }.clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surface).clickable(enabled = item.authorId != null) { item.authorId?.let(onAuthor) }.padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (!item.authorAvatar.isNullOrBlank()) AsyncImage(item.authorAvatar, "${item.author}头像", imageLoader = imageLoader, contentScale = ContentScale.Crop, modifier = Modifier.size(38.dp).clip(androidx.compose.foundation.shape.CircleShape))
                            else Icon(HeikaIcons.Profile, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(38.dp).clip(androidx.compose.foundation.shape.CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).padding(8.dp))
                            Column(Modifier.weight(1f)) {
                                Text(item.author, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                Text(item.date, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            }
                            if (item.authorId != null) androidx.compose.material3.OutlinedButton(onClick = viewModel::toggleFollow, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)) { Text(if (state.following) "已关注" else "关注", fontSize = 11.sp) }
                        }
                        val bodyFont = when (readingMode) { "focus" -> 16.sp; "night" -> 15.sp; else -> 14.sp }
                        val bodyLine = when (readingMode) { "focus" -> 28.sp; "night" -> 27.sp; else -> 24.sp }
                        Text(item.body, Modifier.graphicsLayer { alpha = bodyAlpha; translationY = (1f - bodyAlpha) * 6.dp.toPx() }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = bodyFont, lineHeight = bodyLine)
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
                            )
                        }
                        item.tags.takeIf { it.isNotEmpty() }?.let { tags ->
                            Text(tags.joinToString("  ") { "#$it" }, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            IconButton(onClick = viewModel::toggleLike) { Icon(if (state.liked) HeikaIcons.LikeFilled else HeikaIcons.LikeOutline, "点赞", tint = if (state.liked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                            Text("${item.likeCount + if (state.liked) 1 else 0}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                            IconButton(onClick = viewModel::toggleSaved) { Icon(if (state.saved) HeikaIcons.SaveFilled else HeikaIcons.SaveOutline, "收藏", tint = if (state.saved) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                            Text("${if (state.saved) "已收藏" else "收藏"}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        }
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface)
                                .clickable {
                                    ratingKeyAtOpen = state.ratingAnimationKey
                                    draftRating = state.rating ?: 0
                                    ratingPanelOpen = true
                                }
                                .padding(horizontal = 13.dp, vertical = 10.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text("内容评分", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                    androidx.compose.animation.AnimatedContent(state.ratingCount, label = "post-rating-count") { count ->
                                        Text(if (count == 0) "暂无评分" else "$count 人评分", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                                    }
                                }
                                val average by animateFloatAsState(
                                    targetValue = state.average?.toFloat() ?: 0f,
                                    animationSpec = tween(HeikaMotion.rating, easing = HeikaMotion.standard),
                                    label = "post-rating-average",
                                )
                                Text(
                                    state.average?.let { String.format(java.util.Locale.US, "%.1f", average) } ?: "待评分",
                                    color = if (state.average != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = if (state.average != null) 22.sp else 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                                (1..5).forEach { score ->
                                    RatingStar(
                                        score = score,
                                        selected = (state.rating ?: 0) >= score,
                                        color = ratingColor(score),
                                        animationKey = state.ratingAnimationKey,
                                        animationScore = state.ratingAnimationScore,
                                        enabled = !state.ratingSending,
                                        onClick = {
                                            ratingKeyAtOpen = state.ratingAnimationKey
                                            draftRating = score
                                            ratingPanelOpen = true
                                        },
                                    )
                                }
                                Spacer(Modifier.weight(1f))
                                if (state.ratingSending) CircularProgressIndicator(Modifier.size(15.dp), strokeWidth = 2.dp)
                                else Text(state.rating?.let { "已评 $it 星" } ?: "未评分", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                            androidx.compose.material3.TextButton(onClick = { onShare(item) }) { Icon(HeikaIcons.Share, null); Spacer(Modifier.size(5.dp)); Text("分享") }
                            androidx.compose.material3.TextButton(onClick = { reportOpen = true }) { Icon(HeikaIcons.Report, null); Spacer(Modifier.size(5.dp)); Text("举报") }
                        }
                        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Icon(HeikaIcons.Comment, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(17.dp))
                            Text("评论 ${state.comments.size}", color = MaterialTheme.colorScheme.onBackground, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        state.notice?.let { message ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(message, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                                if (message.contains("登录")) TextButton(onClick = onLogin) { Text("登录") }
                            }
                        }
                    }
                }
                items(state.comments, key = { it.id }) { comment ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(comment.author, color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.weight(1f))
                            Text("回复", Modifier.clickable { replyTo = comment.id }.padding(4.dp), color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                        }
                        Text(comment.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 19.sp)
                    }
                }
                if (state.commentsHasMore) item {
                    Text(
                        if (state.loadingMoreComments) "正在加载…" else "加载更多评论",
                        Modifier.fillMaxWidth().clickable(enabled = !state.loadingMoreComments) { viewModel.loadMoreComments() }.padding(12.dp),
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 12.sp,
                    )
                }
                if (state.comments.isEmpty() && !state.loading) item { Text("还没有评论，来写下第一条。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp) }
            }
            Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it.take(1000) },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text(if (replyTo == null) "写下你的评论" else "回复评论…") },
                    maxLines = 3,
                )
                IconButton(enabled = draft.isNotBlank() && !state.sending, onClick = { viewModel.comment(draft, replyTo) }) {
                    if (state.sending) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Icon(HeikaIcons.Publish, "发送评论", tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
    AnimatedVisibility(
        visible = ratingPanelOpen && state.post != null,
        modifier = Modifier.fillMaxSize(),
        enter = fadeIn(tween(HeikaMotion.control)) + scaleIn(initialScale = .97f, animationSpec = tween(HeikaMotion.control)),
        exit = fadeOut(tween(HeikaMotion.quick)) + scaleOut(targetScale = .985f, animationSpec = tween(HeikaMotion.quick)),
    ) {
        RatingFocusPanel(
            hazeState = hazeState,
            score = draftRating,
            sending = state.ratingSending,
            error = state.ratingError,
            onSelect = { draftRating = it },
            onDismiss = { if (!state.ratingSending) ratingPanelOpen = false },
            onConfirm = { if (draftRating in 1..5 && !state.ratingSending) viewModel.rate(draftRating) },
        )
    }
    }
    if (reportOpen) {
        val reasons = listOf("垃圾营销或重复内容", "骚扰、仇恨或攻击", "虚假或误导信息", "侵权或未经授权转载", "不适宜或危险内容", "其他")
        AlertDialog(
            onDismissRequest = { reportOpen = false },
            title = { Text("举报内容") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Text("举报信息仅用于平台安全与人工复核。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    reasons.forEach { reason -> FilterChip(reason, reportReason == reason, { reportReason = reason }) }
                    OutlinedTextField(value = reportNote, onValueChange = { reportNote = it.take(300) }, label = { Text("补充说明（选填）") }, maxLines = 3)
                }
            },
            confirmButton = { TextButton(onClick = { viewModel.report(reportReason, reportNote); reportOpen = false }) { Text("提交") } },
            dismissButton = { TextButton(onClick = { reportOpen = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun RetryableDetailImage(
    url: String,
    postId: String,
    variant: String,
    contentDescription: String,
    imageLoader: coil3.ImageLoader,
    contentScale: ContentScale,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var attempt by remember(url, postId, variant) { mutableStateOf(0) }
    var failed by remember(url, postId, variant) { mutableStateOf(false) }
    val request = remember(context, url, postId, variant, attempt) {
        ImageRequest.Builder(context).data(url)
            .memoryCacheKey(imageCacheKey(postId, url, variant))
            .diskCacheKey(imageCacheKey(postId, url, variant))
            .crossfade(150).build()
    }
    Box(modifier) {
        AsyncImage(
            model = request,
            contentDescription = contentDescription,
            imageLoader = imageLoader,
            contentScale = contentScale,
            modifier = Modifier.fillMaxSize(),
            onState = { failed = it is coil3.compose.AsyncImagePainter.State.Error },
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

private val RatingColors = listOf(
    Color(0xFFFF5D78),
    Color(0xFFFF9452),
    Color(0xFFEDBD36),
    Color(0xFF65B95E),
    Color(0xFF34AEB5),
)

private fun ratingColor(score: Int) = RatingColors[(score - 1).coerceIn(0, RatingColors.lastIndex)]

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
    Icon(
        imageVector = if (selected) HeikaIcons.StarFilled else HeikaIcons.StarOutline,
        contentDescription = "$score 星",
        modifier = Modifier
            .graphicsLayer { scaleX = scale.value * pressScale; scaleY = scale.value * pressScale }
            .selectable(selected = selected, interactionSource = interaction, indication = null, enabled = enabled, role = Role.RadioButton) { haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove); onClick() }
            .padding(horizontal = 5.dp, vertical = 7.dp).size(28.dp),
        tint = tint,
    )
}

@Composable
private fun RatingFocusPanel(
    hazeState: HazeState,
    score: Int,
    sending: Boolean,
    error: String?,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .46f)).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) {
        HeikaGlassSurface(
            hazeState = hazeState,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 25.dp).clickable {},
            shape = RoundedCornerShape(17.dp),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 17.dp),
            emphasis = 1.2f,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("内容评分", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    IconButton(onClick = onDismiss, enabled = !sending) { Icon(HeikaIcons.Close, "关闭评分", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                Text(if (score == 0) "选择 1–5 星" else "$score 星", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                    (1..5).forEach { value -> RatingStar(value, score >= value, ratingColor(value), 0, 0, !sending) { onSelect(value) } }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                Button(onClick = onConfirm, enabled = score in 1..5 && !sending, modifier = Modifier.fillMaxWidth().height(46.dp)) {
                    if (sending) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("确认评分")
                }
            }
        }
    }
}
