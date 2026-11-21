package com.heika.nativeapp.feature.home

import com.heika.nativeapp.ui.HeikaCoroutineGuard
import com.heika.nativeapp.ui.HeikaIcons
import androidx.compose.animation.Crossfade
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import coil3.request.crossfade
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import kotlin.math.sin
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import java.util.concurrent.atomic.AtomicReference
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.imageCacheKey
import com.heika.nativeapp.ui.BrandHeader
import com.heika.nativeapp.ui.HeikaPalette
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.HeikaRadii
import com.heika.nativeapp.ui.LocalDecor
import com.heika.nativeapp.ui.LocalHeikaDark
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.LocalHeikaTitleTextScale
import com.heika.nativeapp.ui.heikaSharedPostImage
import com.heika.nativeapp.ui.heikaSharedPostMeta
import com.heika.nativeapp.ui.sharedAuthorKey
import com.heika.nativeapp.ui.sharedImageKey
import com.heika.nativeapp.ui.sharedRatingKey
import com.heika.nativeapp.ui.sharedTagKey
import com.heika.nativeapp.ui.heikaGaussianBlur
import com.heika.nativeapp.ui.HeikaSolidBadgeSurface
import com.heika.nativeapp.ui.HeikaImageRatioCache
import com.heika.nativeapp.ui.heikaPhotoTextShadow
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.AnimatedVisibilityScope
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import dev.chrisbanes.haze.HazeState
import com.heika.nativeapp.ui.HeikaPulseLine
import com.heika.nativeapp.ui.HeikaPulseDot

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
fun HomeScreen(
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    onPreviewActive: (Boolean) -> Unit = {},
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
    sharedElementsEnabled: Boolean = false,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var preview by remember { mutableStateOf<DailyCardPreview?>(null) }
    var closeRequest by remember { mutableIntStateOf(0) }
    var containerOrigin by remember { mutableStateOf(Offset.Zero) }
    // 背景模糊不跟着 preview 是否存在走：preview 要等退场动画播完才置空，
    // 那样模糊会慢半拍。改用独立的开关，手指/返回键一触发退场就先开始散去。
    var backdropBlurOn by remember { mutableStateOf(false) }
    val backdropBlurRadius by animateDpAsState(
        targetValue = if (backdropBlurOn) 16.dp else 0.dp,
        // 打开时略快，退场时和卡片落回原位同长，视觉上"卡落定 = 背景清晰"。
        animationSpec = tween(
            if (backdropBlurOn) 240 else HeikaMotion.spatial,
            easing = if (backdropBlurOn) FastOutSlowInEasing else HeikaMotion.spatialEasing,
        ),
        label = "flip-preview-backdrop-blur",
    )
    val gridState = rememberLazyGridState()
    val previewHaze = rememberHazeState()
    LaunchedEffect(preview?.id) {
        onPreviewActive(preview != null)
        if (preview != null) backdropBlurOn = true
    }
    androidx.compose.runtime.DisposableEffect(Unit) {
        onDispose { onPreviewActive(false) }
    }
    BackHandler(enabled = preview != null) { closeRequest += 1 }

    BoxWithConstraints(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)
            .onGloballyPositioned { containerOrigin = it.positionInRoot() },
    ) {
        Column(
            Modifier.fillMaxSize()
                .heikaGaussianBlur(backdropBlurRadius, enabled = backdropBlurRadius.value > .1f)
                .hazeSource(previewHaze),
        ) {
            BrandHeader(onSearch = onSearch, onNotifications = onNotifications)
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                state = gridState,
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 19.dp, end = 19.dp, top = 14.dp, bottom = 126.dp),
                horizontalArrangement = Arrangement.spacedBy(13.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                            .background(MaterialTheme.colorScheme.surface).padding(horizontal = 11.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        val openedCount = state.openedIds.size.coerceAtMost(state.allowance)
                        val progress by animateFloatAsState(
                            targetValue = if (state.allowance > 0) openedCount.toFloat() / state.allowance else 0f,
                            animationSpec = tween(260, easing = FastOutSlowInEasing),
                            label = "daily-exploration-progress",
                        )
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("今日探索", color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.weight(1f))
                            Text(if (state.remaining > 0) "还可翻开 ${state.remaining} 张" else "今日已完成", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("  $openedCount / ${state.allowance}", color = HeikaPalette.Gold, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Box(Modifier.fillMaxWidth().height(2.dp).clip(RoundedCornerShape(2.dp)).background(MaterialTheme.colorScheme.outline.copy(alpha = .38f))) {
                            Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).height(2.dp).background(MaterialTheme.colorScheme.primary))
                        }
                        state.notice?.let { NoticeLine(it, isError = false) }
                        state.error?.let { NoticeLine(it, isError = true, onRetry = viewModel::reload) }
                        if (state.loading && state.candidateIds.isEmpty()) {
                            Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                HeikaPulseLine(height = 13.dp, widthFraction = 0.72f)
                                HeikaPulseLine(height = 11.dp, widthFraction = 0.48f)
                                Text("正在恢复今日卡片", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                            }
                        }
                    }
                }
                itemsIndexed(
                    state.candidateIds,
                    key = { _, id -> "daily-$id" },
                    contentType = { _, _ -> "daily-card" },
                ) { index, id ->
                    val opened = id in state.openedIds
                    val post = state.posts[id]
                    FlipCard(
                        cardId = id,
                        number = index + 1,
                        post = post,
                        hazeState = previewHaze,
                        opened = opened,
                        opening = state.openingId == id,
                        visible = preview?.id != id,
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = animatedVisibilityScope,
                        sharedElementsEnabled = sharedElementsEnabled && preview == null && opened,
                        onClick = { bounds ->
                            if (opened) {
                                if (post == null) viewModel.reload()
                                if (state.openingId == null) preview = DailyCardPreview(id, index + 1, bounds)
                            } else if (state.openingId == null) {
                                preview = DailyCardPreview(id, index + 1, bounds)
                            }
                        },
                    )
                }
            }
        }
        preview?.let { selected ->
            FlipPreviewOverlay(
                preview = selected,
                containerWidth = maxWidth,
                containerHeight = maxHeight,
                containerOrigin = containerOrigin,
                opening = state.openingId == selected.id,
                opened = selected.id in state.openedIds,
                post = state.posts[selected.id],
                hazeState = previewHaze,
                canConfirm = state.remaining > 0 || state.userId != HomeUiState.GUEST_ID,
                error = state.error,
                closeRequest = closeRequest,
                onConfirm = { viewModel.flip(selected.id) },
                onOpenDetails = { state.posts[selected.id]?.let(onPost) },
                // 退场动画开始时立刻撤掉背景模糊，不再等 onDismiss。
                onDismissStart = { backdropBlurOn = false },
                onDismiss = { preview = null },
                sharedTransitionScope = sharedTransitionScope,
                animatedVisibilityScope = animatedVisibilityScope,
                sharedElementsEnabled = sharedElementsEnabled,
            )
        }
    }
}

private data class DailyCardPreview(val id: Int, val number: Int, val sourceBounds: Rect?)

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
private fun FlipCard(
    cardId: Int,
    number: Int,
    post: HeikaPost?,
    hazeState: HazeState,
    opened: Boolean,
    opening: Boolean,
    visible: Boolean,
    sharedTransitionScope: SharedTransitionScope?,
    animatedVisibilityScope: AnimatedVisibilityScope?,
    sharedElementsEnabled: Boolean,
    onClick: (Rect?) -> Unit,
) {
    // Keep coordinates out of Compose state: updating bounds during every scroll frame
    // used to invalidate all visible cards and made the home grid feel sticky.
    val cardCoordinates = remember(cardId) { AtomicReference<LayoutCoordinates?>(null) }
    Box(
        modifier = Modifier
            .alpha(if (visible) 1f else 0f)
            .fillMaxWidth()
            .aspectRatio(0.76f)
            .shadow(1.dp, RoundedCornerShape(HeikaRadii.dailyCard))
            .clip(RoundedCornerShape(HeikaRadii.dailyCard))
            .border(1.dp, HeikaPalette.DailyCardRim.copy(alpha = 0.78f), RoundedCornerShape(HeikaRadii.dailyCard))
            .onGloballyPositioned { coordinates -> cardCoordinates.set(coordinates) }
            .clickable(enabled = !opening, onClick = { onClick(cardCoordinates.get()?.boundsInRoot()) }),
    ) {
        Crossfade(
            targetState = opened,
            animationSpec = tween(220, easing = FastOutSlowInEasing),
            label = "daily-card-face",
        ) { faceIsOpen ->
            if (faceIsOpen) {
                CardFront(
                    post,
                    hazeState = hazeState,
                    sharedTransitionScope = sharedTransitionScope,
                    animatedVisibilityScope = animatedVisibilityScope,
                    sharedElementsEnabled = sharedElementsEnabled,
                )
            } else {
                CardBack(number)
            }
        }
        if (opening) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.42f)), contentAlignment = Alignment.Center) {
                HeikaPulseDot(size = 26.dp, color = HeikaPalette.Gold)
            }
        }
    }
}

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
private fun FlipPreviewOverlay(
    preview: DailyCardPreview,
    containerWidth: androidx.compose.ui.unit.Dp,
    containerHeight: androidx.compose.ui.unit.Dp,
    containerOrigin: Offset,
    opening: Boolean,
    opened: Boolean,
    post: HeikaPost?,
    hazeState: HazeState,
    canConfirm: Boolean,
    error: String?,
    closeRequest: Int,
    onConfirm: () -> Unit,
    onOpenDetails: () -> Unit,
    onDismissStart: () -> Unit,
    onDismiss: () -> Unit,
    sharedTransitionScope: SharedTransitionScope?,
    animatedVisibilityScope: AnimatedVisibilityScope?,
    sharedElementsEnabled: Boolean,
) {
    val progress = remember(preview.id) { Animatable(0f) }
    val touchScale = remember(preview.id) { Animatable(1f) }
    val flipProgress = remember(preview.id) { Animatable(if (opened) 1f else 0f) }
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val reduceMotion = remember(context) {
        runCatching {
            android.provider.Settings.Global.getFloat(
                context.contentResolver,
                android.provider.Settings.Global.ANIMATOR_DURATION_SCALE,
                1f,
            ) <= 0f
        }.getOrDefault(false)
    }
    var dismissing by remember(preview.id) { mutableStateOf(false) }
    var revealing by remember(preview.id) { mutableStateOf(false) }
    var rarityPhase by remember(preview.id) { mutableStateOf(false) }
    var confirmSubmitted by remember(preview.id) { mutableStateOf(opened) }
    var handledCloseRequest by remember(preview.id) { mutableIntStateOf(closeRequest) }
    val targetWidth = (containerWidth - 52.dp).coerceAtMost(390.dp).coerceAtLeast(240.dp)
    val targetWidthPx = with(density) { targetWidth.toPx() }
    val targetHeightPx = targetWidthPx / 0.76f
    val centerX = with(density) { containerWidth.toPx() / 2f }
    val centerY = with(density) { containerHeight.toPx() / 2f }

    LaunchedEffect(preview.id) {
        if (reduceMotion) progress.snapTo(1f)
        else progress.animateTo(1f, tween(HeikaMotion.spatial, easing = HeikaMotion.spatialEasing))
    }
    LaunchedEffect(opened) {
        if (opened && flipProgress.value < 1f) {
            // Reveal starts only after the server confirms the selected card.
            revealing = true
            if (reduceMotion) flipProgress.snapTo(1f)
            else flipProgress.animateTo(1f, tween(680, easing = CubicBezierEasing(0.22f, 0.86f, 0.24f, 1f)))
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            revealing = false
            rarityPhase = true
            delay(900L)
            rarityPhase = false
        } else {
            revealing = false
            rarityPhase = false
        }
    }
    LaunchedEffect(opening, error, opened) {
        if (!opening && !opened && error != null) confirmSubmitted = false
    }
    LaunchedEffect(closeRequest, opening, revealing, dismissing) {
        if (closeRequest > handledCloseRequest) {
            if (!opening && !revealing && !dismissing) {
                handledCloseRequest = closeRequest
                dismissing = true
                onDismissStart()
                if (reduceMotion) progress.snapTo(0f)
                else progress.animateTo(0f, tween(HeikaMotion.spatial, easing = HeikaMotion.spatialEasing))
                onDismiss()
            }
        }
    }

    fun requestDismiss() {
        if (opening || revealing || dismissing) return
        dismissing = true
        onDismissStart()
        scope.launch(HeikaCoroutineGuard) {
            if (reduceMotion) progress.snapTo(0f)
            else progress.animateTo(0f, tween(HeikaMotion.spatial, easing = HeikaMotion.spatialEasing))
            onDismiss()
        }
    }

    val cardShape = RoundedCornerShape(HeikaRadii.dailyCard)
    Box(Modifier.fillMaxSize()) {
        val expand = progress.value.coerceIn(0f, 1f)
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.14f * expand)))
        Box(
            Modifier.fillMaxSize()
                .clickable(
                    enabled = !opening && !revealing && !dismissing,
                    indication = null,
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                    onClick = { requestDismiss() },
                ),
        )
        Box(
            Modifier.align(Alignment.Center)
                .width(targetWidth)
                .aspectRatio(0.76f)
                .clickable(
                    indication = null,
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                    onClick = {},
                )
                .graphicsLayer {
                    val p = progress.value
                    val source = preview.sourceBounds?.let {
                        Rect(it.left - containerOrigin.x, it.top - containerOrigin.y, it.right - containerOrigin.x, it.bottom - containerOrigin.y)
                    }
                    val sourceScaleX = source?.let { (it.width / targetWidthPx).coerceAtLeast(0.05f) } ?: 0.94f
                    val sourceScaleY = source?.let { (it.height / targetHeightPx).coerceAtLeast(0.05f) } ?: 0.94f
                    // 翻面中段轻微抬起，落定时回到原尺寸：有实体卡片的重量感，不喧宾夺主。
                    val lift = sin(Math.PI * flipProgress.value).toFloat()
                    scaleX = (sourceScaleX + (1f - sourceScaleX) * p) * touchScale.value * (1f + 0.028f * lift)
                    scaleY = (sourceScaleY + (1f - sourceScaleY) * p) * touchScale.value * (1f + 0.028f * lift)
                    // 翻面结束后把两层 3D 旋转一起归零：180+180 与 0+0 的最终画面完全一致，
                    // 但共享元素取到的坐标不再是镜像的。否则"确认查看"时封面会朝反方向飞出去。
                    val settled = flipProgress.value >= 0.999f
                    rotationY = if (settled) 0f else 180f * flipProgress.value
                    cameraDistance = 26f * density.density
                    translationX = source?.let { ((it.left + it.right) / 2f - centerX) * (1f - p) } ?: 0f
                    translationY = source?.let { ((it.top + it.bottom) / 2f - centerY) * (1f - p) } ?: 0f
                    shadowElevation = with(density) { (4.dp + 16.dp * p + 14.dp * lift).toPx() }
                    shape = RoundedCornerShape(HeikaRadii.dailyCard)
                    clip = true
                }
                .clip(cardShape),
        ) {
            if (flipProgress.value < .5f) {
                    PreviewCardBack(
                        number = preview.number,
                        alpha = progress.value,
                        opening = opening || confirmSubmitted,
                        canConfirm = canConfirm && progress.value >= 0.92f,
                        error = error,
                        reduceMotion = reduceMotion,
                        onConfirm = {
                            if (!opening && !confirmSubmitted && !revealing && canConfirm) {
                                confirmSubmitted = true
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                if (!reduceMotion) scope.launch(HeikaCoroutineGuard) {
                                    touchScale.snapTo(.985f)
                                    touchScale.animateTo(1f, tween(150, easing = FastOutSlowInEasing))
                                }
                                onConfirm()
                            }
                        },
                    )
            } else {
                Box(Modifier.fillMaxSize().graphicsLayer {
                    rotationY = if (flipProgress.value >= 0.999f) 0f else 180f
                    cameraDistance = 26f * density.density
                }) {
                    PreviewCardFront(
                        post = post,
                        alpha = progress.value,
                        enabled = !opening && !revealing && !rarityPhase && post != null,
                        onOpenDetails = onOpenDetails,
                        hazeState = hazeState,
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = animatedVisibilityScope,
                        sharedElementsEnabled = sharedElementsEnabled,
                    )
                }
            }
            AnimatedVisibility(
                visible = rarityPhase,
                modifier = Modifier.align(Alignment.Center),
                enter = fadeIn(tween(140)),
                exit = fadeOut(tween(180)),
            ) {
                val tier = post?.rarityTier ?: "pending"
                Column(
                    Modifier.clip(RoundedCornerShape(15.dp))
                        .background(Color(0xD9101417))
                        .border(1.dp, HeikaPalette.Gold.copy(alpha = .52f), RoundedCornerShape(15.dp))
                        .padding(horizontal = 26.dp, vertical = 19.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text("卡片稀有度", color = Color.White.copy(alpha = .74f), fontSize = 10.sp, letterSpacing = 1.2.sp)
                    Text(if (tier == "ordinary") "N" else if (tier == "pending") "待评" else tier, color = HeikaPalette.Gold, fontSize = 36.sp, fontWeight = FontWeight.Bold)
                    Text(rarityLabel(tier), color = Color.White.copy(alpha = .9f), fontSize = 11.sp)
                }
            }
        }
        FlipConfetti(enabled = opened)
    }
}

@Composable
private fun PreviewCardBack(
    number: Int,
    alpha: Float,
    opening: Boolean,
    canConfirm: Boolean,
    error: String?,
    reduceMotion: Boolean,
    onConfirm: () -> Unit,
) {
    val pressScale = remember { Animatable(1f) }
    val pressScope = rememberCoroutineScope()
    val cardPalette = LocalDecor.current.card.palette(LocalHeikaDark.current)
    Box(Modifier.fillMaxSize().alpha(alpha)) {
        CardBack(number, preview = true)
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 20.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (error != null) {
                Text(error, color = Color(0xFFE6A49A), fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            } else if (!canConfirm) {
                Text("今日翻卡次数已用完", color = Color.White.copy(alpha = 0.82f), fontSize = 11.sp)
            }
            Button(
                onClick = {
                    if (!reduceMotion) {
                        pressScope.launch {
                            pressScale.snapTo(.97f)
                            pressScale.animateTo(1f, tween(105, easing = FastOutSlowInEasing))
                        }
                    }
                    onConfirm()
                },
                enabled = !opening && canConfirm,
                modifier = Modifier.fillMaxWidth().height(48.dp).graphicsLayer {
                    scaleX = pressScale.value
                    scaleY = pressScale.value
                },
                shape = RoundedCornerShape(10.dp),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = cardPalette.actionBg,
                    contentColor = cardPalette.actionText,
                    disabledContainerColor = cardPalette.actionBg.copy(alpha = .45f),
                    disabledContentColor = cardPalette.actionText.copy(alpha = .55f),
                ),
            ) {
                if (opening) CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp, color = Color(0xFF25292B))
                else Text(if (error != null) "重试翻开" else "确认翻开", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun FlipConfetti(enabled: Boolean) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(enabled) {
        if (enabled) {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(1_650, easing = LinearEasing))
        } else {
            progress.snapTo(1f)
        }
    }
    if (!enabled || progress.value >= 1f) return
    val colors = remember {
        listOf(
            Color(0xFFF2C45E), Color(0xFFF05F77), Color(0xFFFF963E), Color(0xFF55C99A),
            Color(0xFF43C7DF), Color(0xFF6F91F5), Color(0xFFB581E8), Color(0xFFF276C0),
        )
    }
    Canvas(Modifier.fillMaxSize()) {
        repeat(28) { index ->
            val spread = index / 27f
            val stagger = ((index * 17) % 28) / 27f
            val jitter = ((index * 13) % 90) / 1_000f
            val start = .04f + stagger * .16f + jitter
            val phase = ((progress.value - start) / .86f).coerceIn(0f, 1f)
            if (phase <= 0f || phase >= 1f) return@repeat
            val drift = (((index * 37) % 25) - 12) / 100f
            val x = (spread + drift * phase).coerceIn(-.04f, 1.04f) * size.width
            val y = phase * (1.08f + (index % 24) / 100f) * size.height
            val width = when (index % 3) { 0 -> 3.dp.toPx(); 1 -> 5.dp.toPx(); else -> 7.dp.toPx() }
            val height = when (index % 3) { 0 -> 30.dp.toPx(); 1 -> 17.dp.toPx(); else -> 9.dp.toPx() }
            drawRect(colors[index % colors.size].copy(alpha = (1f - phase).coerceIn(0f, 1f)), Offset(x, y), androidx.compose.ui.geometry.Size(width, height))
        }
    }
}

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
private fun PreviewCardFront(
    post: HeikaPost?,
    alpha: Float,
    enabled: Boolean,
    onOpenDetails: () -> Unit,
    hazeState: HazeState,
    sharedTransitionScope: SharedTransitionScope?,
    animatedVisibilityScope: AnimatedVisibilityScope?,
    sharedElementsEnabled: Boolean,
    modifier: Modifier = Modifier,
) {
    val titleScale = LocalHeikaTitleTextScale.current
    // 标题不再参与共享：15sp/17sp 与详情 22sp 差距过大，中途会看到字号跳变。
    // 改为让标签、评分与作者名做等比共享——字号两端几乎一致，只有位置与尺寸在变。
    val metaSharedReady = post != null && sharedElementsEnabled && sharedTransitionScope != null && animatedVisibilityScope != null
    val tagSharedModifier = if (metaSharedReady) with(sharedTransitionScope!!) {
        Modifier.heikaSharedPostMeta(this, animatedVisibilityScope!!, post!!.sharedTagKey())
    } else Modifier
    val ratingSharedModifier = if (metaSharedReady) with(sharedTransitionScope!!) {
        Modifier.heikaSharedPostMeta(this, animatedVisibilityScope!!, post!!.sharedRatingKey())
    } else Modifier
    val authorSharedModifier = if (metaSharedReady) with(sharedTransitionScope!!) {
        Modifier.heikaSharedPostMeta(this, animatedVisibilityScope!!, post!!.sharedAuthorKey())
    } else Modifier
    Box(modifier.fillMaxSize().alpha(alpha).background(MaterialTheme.colorScheme.surface)) {
      Column(Modifier.fillMaxSize()) {
        val image = post?.thumbnail
        Box(Modifier.fillMaxWidth().weight(0.60f).background(MaterialTheme.colorScheme.surfaceVariant)) {
            if (image != null) {
                val shared = if (sharedElementsEnabled && sharedTransitionScope != null && animatedVisibilityScope != null) with(sharedTransitionScope) {
                    Modifier.heikaSharedPostImage(sharedTransitionScope, animatedVisibilityScope, post.sharedImageKey(), isDetail = false, enabled = true)
                } else Modifier
                AsyncImage(
                    model = imageRequest(image, post.cloudId, 0),
                    contentDescription = post.title,
                    imageLoader = LocalHeikaImageLoader.current,
                    modifier = Modifier.fillMaxSize().then(shared),
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                )
            } else {
                Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF55594F), Color(0xFF292B29), Color(0xFF171A1D)))))
            }
        }
        Column(
            Modifier.fillMaxWidth().weight(0.40f).padding(horizontal = 17.dp, vertical = 11.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(post?.tag ?: "黑卡内容", tagSharedModifier, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                Spacer(Modifier.weight(1f))
                Box(ratingSharedModifier) {
                    if (post?.hasRating == true) {
                        HeikaSolidBadgeSurface(hazeState = hazeState, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 3.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Icon(com.heika.nativeapp.ui.HeikaIcons.StarOutline, null, tint = HeikaPalette.Gold, modifier = Modifier.size(12.dp))
                                Text(String.format(java.util.Locale.US, "%.1f", post.ratingAverage), color = HeikaPalette.Gold, fontSize = 10.sp)
                            }
                        }
                    } else Text("待评级", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                }
            }
            Text(
                post?.title ?: "正在恢复卡片内容",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 17.sp * titleScale,
                lineHeight = 22.sp * titleScale,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(post?.author ?: "HEIKA", authorSharedModifier, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.weight(1f))
            Button(
                onClick = onOpenDetails,
                enabled = enabled,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(10.dp),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFC7D4D9),
                    contentColor = Color(0xFF17191C),
                    disabledContainerColor = Color(0xFF687477),
                    disabledContentColor = Color(0xFF25292B),
                ),
            ) {
                Text("确认查看", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(8.dp))
                Icon(com.heika.nativeapp.ui.HeikaIcons.Forward, contentDescription = null, modifier = Modifier.size(18.dp), tint = Color(0xFF17191C))
            }
        }
      }
    }
}

/**
 * 卡背：小卡与放大确认卡共用同一套绘制，底色/底图/纹理/图案/描边/编号与提示文字全部来自
 * 当前卡片主题，保证「翻开前」在各种尺寸下都是同一个视觉身份。
 */
@Composable
private fun CardBack(number: Int, preview: Boolean = false) {
    val dark = LocalHeikaDark.current
    val palette = LocalDecor.current.card.palette(dark)
    Box(Modifier.fillMaxSize().background(palette.backBg)) {
        if (palette.backImage != null) {
            AsyncImage(
                model = palette.backImage,
                contentDescription = null,
                imageLoader = LocalHeikaImageLoader.current,
                modifier = Modifier.fillMaxSize(),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
            )
        }
        Canvas(Modifier.fillMaxSize().padding(6.dp)) {
            when (palette.texture) {
                "grid" -> {
                    val step = size.width / 7f
                    var x = 0f
                    while (x <= size.width) {
                        drawLine(palette.backBorder.copy(alpha = .38f), androidx.compose.ui.geometry.Offset(x, 0f), androidx.compose.ui.geometry.Offset(x, size.height), strokeWidth = 1.dp.toPx())
                        x += step
                    }
                    var y = 0f
                    while (y <= size.height) {
                        drawLine(palette.backBorder.copy(alpha = .38f), androidx.compose.ui.geometry.Offset(0f, y), androidx.compose.ui.geometry.Offset(size.width, y), strokeWidth = 1.dp.toPx())
                        y += step
                    }
                }
                "noise" -> {
                    var y = 0f
                    var row = 0
                    while (y <= size.height) {
                        var x = if (row % 2 == 0) 0f else size.width / 24f
                        while (x <= size.width) {
                            drawCircle(palette.backBorder.copy(alpha = .22f), radius = 0.9.dp.toPx(), center = androidx.compose.ui.geometry.Offset(x, y))
                            x += size.width / 12f
                        }
                        y += size.height / 22f
                        row++
                    }
                }
                // 稀疏点阵：点更大、间距更开（约 3%）
                "dots" -> {
                    var y = size.height / 12f
                    while (y <= size.height) {
                        var x = size.width / 12f
                        while (x <= size.width) {
                            drawCircle(palette.backBorder.copy(alpha = .3f), radius = 1.5.dp.toPx(), center = androidx.compose.ui.geometry.Offset(x, y))
                            x += size.width / 6f
                        }
                        y += size.height / 8f
                    }
                }
                // 纸张颗粒：两层错位细点模拟纸纤维（约 4%）
                "paper" -> {
                    var y = 0f
                    var row = 0
                    while (y <= size.height) {
                        var x = if (row % 2 == 0) 0f else size.width / 40f
                        while (x <= size.width) {
                            drawCircle(palette.backBorder.copy(alpha = .26f), radius = 0.8.dp.toPx(), center = androidx.compose.ui.geometry.Offset(x, y))
                            if (row % 3 == 0) {
                                drawCircle(palette.backBorder.copy(alpha = .18f), radius = 0.6.dp.toPx(), center = androidx.compose.ui.geometry.Offset(x + size.width / 30f, y + size.height / 40f))
                            }
                            x += size.width / 20f
                        }
                        y += size.height / 34f
                        row++
                    }
                }
                // 同心圆：低强度等距圆环（约 2%）
                "rings" -> {
                    val cx = size.width / 2f
                    val cy = size.height * .46f
                    var r = size.width / 7f
                    while (r < size.width * 1.2f) {
                        drawCircle(
                            palette.backBorder.copy(alpha = .22f),
                            radius = r,
                            center = androidx.compose.ui.geometry.Offset(cx, cy),
                            style = Stroke(1.dp.toPx()),
                        )
                        r += size.width / 7f
                    }
                }
                // 几何菱形：两组反向斜线交叉（约 3%）
                "diamonds" -> {
                    val step = size.width / 5f
                    var d = -size.height
                    while (d <= size.width) {
                        drawLine(palette.backBorder.copy(alpha = .26f), start = androidx.compose.ui.geometry.Offset(d, 0f), end = androidx.compose.ui.geometry.Offset(d + size.height, size.height), strokeWidth = 1.dp.toPx())
                        drawLine(palette.backBorder.copy(alpha = .26f), start = androidx.compose.ui.geometry.Offset(d, 0f), end = androidx.compose.ui.geometry.Offset(d - size.height, size.height), strokeWidth = 1.dp.toPx())
                        d += step
                    }
                }
                "none" -> Unit
                else -> {
                    // 细斜线（linen 默认）
                    for (line in 0..16) {
                        val x = size.width * (line / 16f)
                        drawLine(Color.White.copy(alpha = 0.045f), start = androidx.compose.ui.geometry.Offset(x, 0f), end = androidx.compose.ui.geometry.Offset(x - size.height * .24f, size.height), strokeWidth = 1.dp.toPx())
                    }
                }
            }
            if (palette.pattern == "diamond") {
                val path = Path().apply {
                    moveTo(size.width * .5f, size.height * .26f)
                    lineTo(size.width * .84f, size.height * .5f)
                    lineTo(size.width * .5f, size.height * .73f)
                    lineTo(size.width * .16f, size.height * .5f)
                    close()
                }
                drawPath(path, palette.backBorder.copy(alpha = .55f), style = Stroke(1.dp.toPx()))
            }
            if (palette.pattern == "frame") {
                val inset = 12.dp.toPx()
                drawRoundRect(
                    color = palette.backBorder.copy(alpha = .55f),
                    topLeft = androidx.compose.ui.geometry.Offset(inset, inset),
                    size = androidx.compose.ui.geometry.Size(size.width - inset * 2, size.height - inset * 2),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(12.dp.toPx()),
                    style = Stroke(1.dp.toPx()),
                )
            }
            val rim = 1.dp.toPx()
            drawRoundRect(
                color = palette.backBorder.copy(alpha = 0.9f),
                topLeft = androidx.compose.ui.geometry.Offset(rim, rim),
                size = androidx.compose.ui.geometry.Size(size.width - rim * 2, size.height - rim * 2),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(14.dp.toPx()),
                style = Stroke(1.dp.toPx()),
            )
        }
        if (palette.pattern == "monogram") {
            Text(
                "H",
                Modifier.align(Alignment.Center),
                color = palette.backBorder.copy(alpha = .55f),
                fontFamily = androidx.compose.ui.text.font.FontFamily.Serif,
                fontSize = if (preview) 132.sp else 62.sp,
            )
        }
        if (!preview) Text(number.toString().padStart(2, '0'), Modifier.align(Alignment.TopStart).padding(18.dp), color = palette.numberColor, fontSize = 14.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Medium)
        Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("黑卡", color = if (preview) palette.numberColor else palette.numberColor, fontSize = if (preview) 40.sp else 18.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Medium)
            Text("H E I K A", Modifier.padding(top = if (preview) 6.dp else 0.dp), color = palette.hintColor, fontSize = if (preview) 10.sp else 18.sp, letterSpacing = if (preview) 2.3.sp else 1.5.sp)
        }
        if (!preview) Text("轻触翻开", Modifier.align(Alignment.BottomStart).padding(18.dp), color = palette.hintColor, fontSize = 12.sp, letterSpacing = 1.1.sp)
    }
}

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
private fun CardFront(
    post: HeikaPost?,
    hazeState: HazeState,
    modifier: Modifier = Modifier,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
    sharedElementsEnabled: Boolean = false,
) {
    val titleScale = LocalHeikaTitleTextScale.current
    val image = post?.thumbnail
    var imageFailed by remember(image, post?.cloudId) { mutableStateOf(false) }
    val photoShadow = heikaPhotoTextShadow()
    val sharedModifier = if (post != null && sharedElementsEnabled && sharedTransitionScope != null && animatedVisibilityScope != null) {
        with(sharedTransitionScope) {
            Modifier.heikaSharedPostImage(sharedTransitionScope, animatedVisibilityScope, post.sharedImageKey(), isDetail = false, enabled = true)
        }
    } else Modifier
    Box(modifier.fillMaxSize().then(if (image == null) sharedModifier else Modifier).background(MaterialTheme.colorScheme.surfaceVariant)) {
        if (image != null) {
            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant).then(sharedModifier).hazeSource(hazeState)) {
                AsyncImage(
                    model = imageRequest(image, post.cloudId, 0),
                    contentDescription = post.title,
                    imageLoader = LocalHeikaImageLoader.current,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    onState = { state ->
                        imageFailed = state is AsyncImagePainter.State.Error
                        if (state is AsyncImagePainter.State.Success) {
                            val size = state.painter.intrinsicSize
                            HeikaImageRatioCache.remember(post.cloudId, size.width, size.height)
                        }
                    },
                )
            }
        } else {
            val contentPalette = LocalDecor.current.card.palette(LocalHeikaDark.current)
            Box(Modifier.fillMaxSize().background(contentPalette.contentBg))
            // 没有封面时用标题色自然填充，保证文字仍然可读。
            Column(Modifier.align(Alignment.Center).padding(horizontal = 18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("黑卡", color = contentPalette.titleColor.copy(alpha = .92f), fontSize = 20.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Medium)
                Text("H E I K A", Modifier.padding(top = 4.dp), color = contentPalette.hintColor, fontSize = 11.sp, letterSpacing = 2.4.sp)
            }
        }
        if (imageFailed) Text("图片暂不可用", Modifier.align(Alignment.Center).clip(RoundedCornerShape(9.dp)).background(Color.Black.copy(alpha = .58f)).padding(horizontal = 10.dp, vertical = 7.dp), color = Color.White.copy(alpha = .9f), fontSize = 10.sp)
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(horizontal = 14.dp, vertical = 15.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(post?.tag ?: "黑卡内容", style = androidx.compose.ui.text.TextStyle(shadow = photoShadow), color = Color.White.copy(alpha = .82f), fontSize = 10.sp, maxLines = 1)
            Text(post?.title ?: "已翻开的卡片", style = androidx.compose.ui.text.TextStyle(shadow = photoShadow), color = Color.White, fontSize = 16.sp * titleScale, lineHeight = 22.sp * titleScale, fontWeight = FontWeight.SemiBold, maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (post?.hasRating == true) HeikaSolidBadgeSurface(
                hazeState = hazeState,
                modifier = Modifier.align(Alignment.Start),
                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 3.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(com.heika.nativeapp.ui.HeikaIcons.StarOutline, null, tint = HeikaPalette.Gold, modifier = Modifier.size(13.dp))
                    Text(String.format(java.util.Locale.US, "%.1f", post.ratingAverage), color = HeikaPalette.Gold, fontSize = 11.sp)
                }
            }
            if (post != null && post.rarityTier in setOf("ordinary", "S", "SS", "SSS")) {
                Text(rarityLabel(post.rarityTier), color = HeikaPalette.Gold, fontSize = 10.sp)
            }
        }
        if (post == null) Text("内容已记录", Modifier.align(Alignment.TopStart).padding(12.dp), color = Color.White, fontSize = 10.sp)
    }
}

private fun rarityLabel(tier: String): String = when (tier) {
    "ordinary" -> "普通黑卡"
    "S", "SS", "SSS" -> tier
    else -> "评分形成中"
}

@Composable
private fun NoticeLine(text: String, isError: Boolean, onRetry: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .background(if (isError) Color(0xFF6E3A37).copy(alpha = .20f) else MaterialTheme.colorScheme.primary.copy(alpha = .08f))
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, Modifier.weight(1f), color = if (isError) Color(0xFFE0A49B) else MaterialTheme.colorScheme.primary, fontSize = 11.sp)
        if (onRetry != null) androidx.compose.material3.IconButton(onClick = onRetry, modifier = Modifier.size(30.dp)) {
            Icon(HeikaIcons.Retry, contentDescription = "重试", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(17.dp))
        }
    }
}

@Composable
private fun imageRequest(uri: String, id: String, index: Int): coil3.request.ImageRequest {
    val context = LocalContext.current
    return remember(uri, id, index, context) {
        coil3.request.ImageRequest.Builder(context)
            .data(uri)
            .memoryCacheKey(imageCacheKey(id, uri, "daily-thumb-$index"))
            .diskCacheKey(imageCacheKey(id, uri, "daily-thumb-$index"))
            .crossfade(140)
            .build()
    }
}
