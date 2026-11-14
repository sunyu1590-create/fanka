package com.heika.nativeapp.feature.home

import com.heika.nativeapp.ui.HeikaIcons
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Animatable
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
import androidx.compose.foundation.layout.offset
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.boundsInRoot
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
import kotlinx.coroutines.flow.first
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.imageCacheKey
import com.heika.nativeapp.ui.BrandHeader
import com.heika.nativeapp.ui.HeikaPalette
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.HeikaRadii
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.LocalHeikaTitleTextScale
import com.heika.nativeapp.ui.heikaSharedPostImage
import com.heika.nativeapp.ui.sharedImageKey
import com.heika.nativeapp.ui.heikaGaussianBlur
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.AnimatedVisibilityScope
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

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
    val gridState = rememberLazyGridState()
    val previewHaze = rememberHazeState()
    LaunchedEffect(preview?.id) { onPreviewActive(preview != null) }
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
                .heikaGaussianBlur(16.dp, enabled = preview != null)
                .hazeSource(previewHaze),
        ) {
            BrandHeader(onSearch = onSearch, onNotifications = onNotifications, hazeState = previewHaze)
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
                            Row(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                                Text("  正在恢复今日卡片", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                            }
                        }
                    }
                }
                itemsIndexed(state.candidateIds, key = { _, id -> "daily-$id" }) { index, id ->
                    val opened = id in state.openedIds
                    val post = state.posts[id]
                    FlipCard(
                        cardId = id,
                        number = index + 1,
                        post = post,
                        opened = opened,
                        opening = state.openingId == id,
                        visible = preview?.id != id,
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = animatedVisibilityScope,
                        sharedElementsEnabled = sharedElementsEnabled && preview == null && opened,
                        onClick = { bounds ->
                            if (opened) {
                                if (post != null) onPost(post) else viewModel.reload()
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
                dailyComplete = selected.id in state.openedIds && state.remaining == 0,
                canConfirm = state.remaining > 0 || state.userId != HomeUiState.GUEST_ID,
                error = state.error,
                closeRequest = closeRequest,
                onConfirm = { viewModel.flip(selected.id) },
                onOpenDetails = { state.posts[selected.id]?.let(onPost) },
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
    opened: Boolean,
    opening: Boolean,
    visible: Boolean,
    sharedTransitionScope: SharedTransitionScope?,
    animatedVisibilityScope: AnimatedVisibilityScope?,
    sharedElementsEnabled: Boolean,
    onClick: (Rect?) -> Unit,
) {
    var sourceBounds by remember(cardId) { mutableStateOf<Rect?>(null) }
    val rotation by animateFloatAsState(
        targetValue = if (opened) 180f else 0f,
        animationSpec = tween(durationMillis = 620, easing = FastOutSlowInEasing),
        label = "heika-flip-card",
    )
    Box(
        modifier = Modifier
            .alpha(if (visible) 1f else 0f)
            .fillMaxWidth()
            .aspectRatio(0.76f)
            .shadow(1.dp, RoundedCornerShape(HeikaRadii.dailyCard))
            .graphicsLayer { rotationY = rotation; cameraDistance = 14 * density }
            .clip(RoundedCornerShape(HeikaRadii.dailyCard))
            .border(1.dp, HeikaPalette.DailyCardRim.copy(alpha = 0.78f), RoundedCornerShape(HeikaRadii.dailyCard))
            .onGloballyPositioned { coordinates ->
                val next = coordinates.boundsInRoot()
                if (sourceBounds != next) sourceBounds = next
            }
            .clickable(enabled = !opening && (rotation <= 0f || rotation >= 180f), onClick = { onClick(sourceBounds) }),
    ) {
        if (rotation < 90f) {
            CardBack(number)
        } else {
            CardFront(
                post,
                modifier = Modifier.graphicsLayer { rotationY = 180f },
                sharedTransitionScope = sharedTransitionScope,
                animatedVisibilityScope = animatedVisibilityScope,
                sharedElementsEnabled = sharedElementsEnabled,
            )
        }
        if (opening) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.42f)), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = HeikaPalette.Gold)
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
    dailyComplete: Boolean,
    canConfirm: Boolean,
    error: String?,
    closeRequest: Int,
    onConfirm: () -> Unit,
    onOpenDetails: () -> Unit,
    onDismiss: () -> Unit,
    sharedTransitionScope: SharedTransitionScope?,
    animatedVisibilityScope: AnimatedVisibilityScope?,
    sharedElementsEnabled: Boolean,
) {
    val progress = remember(preview.id) { Animatable(0f) }
    val rotation = remember(preview.id) { Animatable(0f) }
    val touchScale = remember(preview.id) { Animatable(1f) }
    val depth = remember(preview.id) { Animatable(0f) }
    val edgeStrength = remember(preview.id) { Animatable(0f) }
    val edgeSweep = remember(preview.id) { Animatable(0f) }
    val frontSettle = remember(preview.id) { Animatable(0f) }
    val goldHighlight = remember(preview.id) { Animatable(0f) }
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
    var handledCloseRequest by remember(preview.id) { mutableIntStateOf(closeRequest) }
    val targetWidth = (containerWidth - 52.dp).coerceAtMost(390.dp).coerceAtLeast(240.dp)
    val targetWidthPx = with(density) { targetWidth.toPx() }
    val targetHeightPx = targetWidthPx / 0.76f
    val cardCameraDistancePx = with(density) { 18.dp.toPx() }
    val centerX = with(density) { containerWidth.toPx() / 2f }
    val centerY = with(density) { containerHeight.toPx() / 2f }

    LaunchedEffect(preview.id) {
        if (reduceMotion) progress.snapTo(1f)
        else progress.animateTo(1f, tween(HeikaMotion.spatial, easing = HeikaMotion.spatialEasing))
    }
    LaunchedEffect(opening, opened) {
        when {
            opened -> {
                revealing = true
                if (reduceMotion) {
                    rotation.snapTo(180f)
                    frontSettle.snapTo(1f)
                    depth.snapTo(0f)
                    edgeStrength.snapTo(0f)
                } else if (rotation.value < 180f) {
                    edgeSweep.snapTo(0f)
                    val sweepJob = scope.launch {
                        edgeSweep.animateTo(1f, tween(680, easing = LinearEasing))
                    }
                    depth.animateTo(1f, tween(190, easing = FastOutSlowInEasing))
                    val flipJob = scope.launch {
                        rotation.animateTo(180f, tween(680, easing = FastOutSlowInEasing))
                    }
                    androidx.compose.runtime.snapshotFlow { rotation.value }.first { it >= 148f }
                    frontSettle.animateTo(1f, tween(110, easing = FastOutSlowInEasing))
                    flipJob.join()
                    sweepJob.cancel()
                    depth.animateTo(0f, tween(190, easing = FastOutSlowInEasing))
                    edgeStrength.animateTo(0f, tween(190, easing = FastOutSlowInEasing))
                }
                val premiumHighlight = post?.takeIf { it.hasRating }?.ratingAverage?.let { it >= 4.5 } == true
                if (!reduceMotion && (premiumHighlight || dailyComplete)) {
                    goldHighlight.animateTo(1f, tween(130, easing = FastOutSlowInEasing))
                    goldHighlight.animateTo(0f, tween(220, easing = FastOutSlowInEasing))
                }
                revealing = false
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            }
            opening -> {
                revealing = false
                if (reduceMotion) {
                    edgeStrength.snapTo(.72f)
                    depth.snapTo(.65f)
                    touchScale.snapTo(1f)
                    edgeSweep.snapTo(1f)
                } else {
                    touchScale.animateTo(1.015f, tween(55, easing = FastOutSlowInEasing))
                    scope.launch { touchScale.animateTo(1f, tween(70, easing = FastOutSlowInEasing)) }
                    edgeStrength.animateTo(.86f, tween(130, easing = FastOutSlowInEasing))
                    depth.animateTo(.72f, tween(160, easing = FastOutSlowInEasing))
                    edgeSweep.snapTo(0f)
                    while (opening && !opened) {
                        edgeSweep.animateTo(1f, tween(900, easing = LinearEasing))
                        edgeSweep.animateTo(0f, tween(900, easing = LinearEasing))
                        depth.animateTo(.84f, tween(420, easing = FastOutSlowInEasing))
                        depth.animateTo(.66f, tween(520, easing = FastOutSlowInEasing))
                    }
                }
            }
            else -> {
                revealing = false
                if (!reduceMotion) {
                    edgeStrength.animateTo(0f, tween(150, easing = FastOutSlowInEasing))
                    depth.animateTo(0f, tween(150, easing = FastOutSlowInEasing))
                } else {
                    edgeStrength.snapTo(0f)
                    depth.snapTo(0f)
                }
                touchScale.snapTo(1f)
                frontSettle.snapTo(0f)
                goldHighlight.snapTo(0f)
                rotation.snapTo(0f)
            }
        }
    }
    LaunchedEffect(closeRequest, opening, revealing, dismissing) {
        if (closeRequest > handledCloseRequest) {
            if (!opening && !revealing && !dismissing) {
                handledCloseRequest = closeRequest
                dismissing = true
                if (reduceMotion) progress.snapTo(0f)
                else progress.animateTo(0f, tween(HeikaMotion.spatial, easing = HeikaMotion.spatialEasing))
                onDismiss()
            }
        }
    }

    fun requestDismiss() {
        if (opening || revealing || dismissing) return
        dismissing = true
        scope.launch {
            if (reduceMotion) progress.snapTo(0f)
            else progress.animateTo(0f, tween(HeikaMotion.spatial, easing = HeikaMotion.spatialEasing))
            onDismiss()
        }
    }

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
        val cardShape = RoundedCornerShape(HeikaRadii.dailyCard)
        val turnFraction = (rotation.value / 180f).coerceIn(0f, 1f)
        if (depth.value > 0.001f) {
            Box(
                Modifier.align(Alignment.Center).width(targetWidth).aspectRatio(0.76f)
                    .offset(x = 8.dp, y = 11.dp)
                    .graphicsLayer {
                        alpha = depth.value * .15f * (1f - turnFraction * .72f)
                        rotationY = rotation.value
                        cameraDistance = cardCameraDistancePx
                    }
                    .clip(cardShape)
                    .background(Color(0xFF202328))
                    .border(1.dp, Color.White.copy(alpha = .20f), cardShape),
            )
            Box(
                Modifier.align(Alignment.Center).width(targetWidth).aspectRatio(0.76f)
                    .offset(x = 4.dp, y = 6.dp)
                    .graphicsLayer {
                        alpha = depth.value * .22f * (1f - turnFraction * .78f)
                        rotationY = rotation.value
                        cameraDistance = cardCameraDistancePx
                    }
                    .clip(cardShape)
                    .background(Color(0xFF292D32))
                    .border(1.dp, Color.White.copy(alpha = .30f), cardShape),
            )
        }
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
                    scaleX = (sourceScaleX + (1f - sourceScaleX) * p) * touchScale.value * (1f + .012f * depth.value)
                    scaleY = (sourceScaleY + (1f - sourceScaleY) * p) * touchScale.value * (1f + .012f * depth.value)
                    translationX = source?.let { ((it.left + it.right) / 2f - centerX) * (1f - p) } ?: 0f
                    translationY = source?.let { ((it.top + it.bottom) / 2f - centerY) * (1f - p) } ?: 0f
                    rotationY = rotation.value
                    cameraDistance = cardCameraDistancePx
                    shadowElevation = with(density) { (4.dp + 16.dp * p + 4.dp * depth.value).toPx() }
                    shape = RoundedCornerShape(HeikaRadii.dailyCard)
                    clip = true
                }
                .clip(cardShape),
        ) {
            if (rotation.value < 90f) {
                PreviewCardBack(
                    number = preview.number,
                    alpha = progress.value,
                    opening = opening,
                    edgeStrength = edgeStrength.value,
                    edgeSweep = edgeSweep.value,
                    canConfirm = canConfirm && progress.value >= 0.92f,
                    error = error,
                    reduceMotion = reduceMotion,
                    onConfirm = {
                        if (!opening && !revealing && canConfirm) {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            onConfirm()
                        }
                    },
                )
            } else {
                PreviewCardFront(
                    post = post,
                    alpha = progress.value,
                    enabled = !opening && !revealing && post != null,
                    contentSettle = frontSettle.value,
                    edgeStrength = edgeStrength.value,
                    edgeSweep = edgeSweep.value,
                    goldHighlight = goldHighlight.value,
                    goldRim = dailyComplete || (post?.takeIf { it.hasRating }?.ratingAverage?.let { it >= 4.5 } == true),
                    onOpenDetails = onOpenDetails,
                    modifier = Modifier.graphicsLayer {
                        rotationY = 180f
                        cameraDistance = cardCameraDistancePx
                    },
                    sharedTransitionScope = sharedTransitionScope,
                    animatedVisibilityScope = animatedVisibilityScope,
                    sharedElementsEnabled = sharedElementsEnabled,
                )
            }
        }
    }
}

@Composable
private fun PreviewCardBack(
    number: Int,
    alpha: Float,
    opening: Boolean,
    edgeStrength: Float,
    edgeSweep: Float,
    canConfirm: Boolean,
    error: String?,
    reduceMotion: Boolean,
    onConfirm: () -> Unit,
) {
    val pressScale = remember { Animatable(1f) }
    val pressScope = rememberCoroutineScope()
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
                    containerColor = Color(0xFFC7D4D9),
                    contentColor = Color(0xFF17191C),
                    disabledContainerColor = Color(0xFF69777B),
                    disabledContentColor = Color(0xFF25292B),
                ),
            ) {
                if (opening) CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp, color = Color(0xFF25292B))
                else Text(if (error != null) "重试翻开" else "确认翻开", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        if (opening && edgeStrength > .001f) {
            Canvas(Modifier.fillMaxSize()) {
                val center = Offset(size.width / 2f, size.height / 2f)
                val silver = Brush.sweepGradient(
                    listOf(
                        Color.Transparent,
                        Color.White.copy(alpha = .20f * edgeStrength),
                        Color.White.copy(alpha = .90f * edgeStrength),
                        Color(0xFFD6E4EA).copy(alpha = .28f * edgeStrength),
                        Color.Transparent,
                    ),
                    center = center,
                )
                rotate(degrees = edgeSweep * 360f, pivot = center) {
                    drawRoundRect(
                        silver,
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(HeikaRadii.dailyCard.toPx()),
                        style = Stroke(width = 1.5.dp.toPx()),
                    )
                }
                val bandX = size.width * (edgeSweep * 1.45f - .22f)
                val halfBand = size.width * .16f
                drawRect(
                    brush = Brush.horizontalGradient(
                        listOf(Color.Transparent, Color.White.copy(alpha = .16f * edgeStrength), Color.Transparent),
                        startX = bandX - halfBand,
                        endX = bandX + halfBand,
                    ),
                    topLeft = Offset(bandX - halfBand, 0f),
                    size = androidx.compose.ui.geometry.Size(halfBand * 2f, size.height),
                )
            }
        }
    }
}

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
private fun PreviewCardFront(
    post: HeikaPost?,
    alpha: Float,
    enabled: Boolean,
    contentSettle: Float,
    edgeStrength: Float,
    edgeSweep: Float,
    goldHighlight: Float,
    goldRim: Boolean,
    onOpenDetails: () -> Unit,
    sharedTransitionScope: SharedTransitionScope?,
    animatedVisibilityScope: AnimatedVisibilityScope?,
    sharedElementsEnabled: Boolean,
    modifier: Modifier = Modifier,
) {
    val titleScale = LocalHeikaTitleTextScale.current
    Box(modifier.fillMaxSize().alpha(alpha).background(MaterialTheme.colorScheme.surface)) {
      Column(Modifier.fillMaxSize().alpha(.78f + .22f * contentSettle)) {
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
                Text(post?.tag ?: "黑卡内容", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                Spacer(Modifier.weight(1f))
                if (post?.hasRating == true) {
                    Icon(com.heika.nativeapp.ui.HeikaIcons.StarOutline, null, tint = HeikaPalette.Gold, modifier = Modifier.size(13.dp))
                    Text(String.format(java.util.Locale.US, "%.1f", post.ratingAverage), color = HeikaPalette.Gold, fontSize = 10.sp)
                } else Text("待评级", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
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
            Text(post?.author ?: "HEIKA", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                Text("查看更多", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(8.dp))
                Icon(com.heika.nativeapp.ui.HeikaIcons.Forward, contentDescription = null, modifier = Modifier.size(18.dp), tint = Color(0xFF17191C))
            }
        }
      }
      if (edgeStrength > .001f || goldHighlight > .001f) {
          Canvas(Modifier.fillMaxSize()) {
              val center = Offset(size.width / 2f, size.height / 2f)
              val base = if (goldRim) HeikaPalette.Gold else Color(0xFFE9F0F3)
              val edge = Brush.sweepGradient(
                  colors = listOf(
                      Color.Transparent,
                      base.copy(alpha = .20f * edgeStrength),
                      Color.White.copy(alpha = .92f * edgeStrength),
                      base.copy(alpha = .30f * edgeStrength),
                      Color.Transparent,
                  ),
                  center = center,
              )
              rotate(degrees = edgeSweep * 360f, pivot = center) {
                  drawRoundRect(
                      brush = edge,
                      cornerRadius = androidx.compose.ui.geometry.CornerRadius(HeikaRadii.dailyCard.toPx()),
                      style = Stroke(width = (1.1f + goldHighlight * .8f).dp.toPx()),
                  )
              }
              val bandCenter = size.width * (edgeSweep * 1.55f - .25f)
              val bandHalf = size.width * .14f
              drawRect(
                  brush = Brush.horizontalGradient(
                      colors = listOf(Color.Transparent, Color.White.copy(alpha = .15f * edgeStrength), Color.Transparent),
                      startX = bandCenter - bandHalf,
                      endX = bandCenter + bandHalf,
                  ),
                  topLeft = Offset(bandCenter - bandHalf, 0f),
                  size = androidx.compose.ui.geometry.Size(bandHalf * 2f, size.height),
              )
              if (goldHighlight > .001f) {
                  drawRoundRect(
                      color = HeikaPalette.Gold.copy(alpha = .17f * goldHighlight),
                      cornerRadius = androidx.compose.ui.geometry.CornerRadius(HeikaRadii.dailyCard.toPx()),
                      style = Stroke(width = 3.dp.toPx()),
                  )
              }
          }
      }
    }
}

@Composable
private fun CardBack(number: Int, preview: Boolean = false) {
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(HeikaPalette.DailyCardStart, HeikaPalette.DailyCardMiddle, HeikaPalette.DailyCardEnd)))) {
        Canvas(Modifier.fillMaxSize().padding(6.dp)) {
            val inset = 1.dp.toPx()
            drawRoundRect(color = HeikaPalette.DailyCardRim.copy(alpha = 0.60f), topLeft = androidx.compose.ui.geometry.Offset(inset, inset), size = androidx.compose.ui.geometry.Size(size.width - inset * 2, size.height - inset * 2), cornerRadius = androidx.compose.ui.geometry.CornerRadius(14.dp.toPx()), style = Stroke(1.dp.toPx()))
            val path = Path().apply {
                moveTo(size.width * .5f, size.height * .26f)
                lineTo(size.width * .84f, size.height * .5f)
                lineTo(size.width * .5f, size.height * .73f)
                lineTo(size.width * .16f, size.height * .5f)
                close()
            }
            drawPath(path, HeikaPalette.DailyCardMuted.copy(alpha = .25f), style = Stroke(1.dp.toPx()))
            for (line in 0..16) {
                val x = size.width * (line / 16f)
                drawLine(Color.White.copy(alpha = 0.035f), start = androidx.compose.ui.geometry.Offset(x, 0f), end = androidx.compose.ui.geometry.Offset(x - size.height * .24f, size.height), strokeWidth = 1.dp.toPx())
            }
        }
        if (!preview) Text(number.toString().padStart(2, '0'), Modifier.align(Alignment.TopStart).padding(18.dp), color = HeikaPalette.DailyCardMuted, fontSize = 14.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Medium)
        Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("黑卡", color = HeikaPalette.Ink, fontSize = if (preview) 40.sp else 18.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Medium)
            Text("H E I K A", Modifier.padding(top = if (preview) 6.dp else 0.dp), color = HeikaPalette.DailyCardMuted, fontSize = if (preview) 10.sp else 18.sp, letterSpacing = if (preview) 2.3.sp else 1.5.sp)
        }
        if (!preview) Text("轻触翻开", Modifier.align(Alignment.BottomStart).padding(18.dp), color = HeikaPalette.DailyCardMuted, fontSize = 12.sp, letterSpacing = 1.1.sp)
    }
}

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
private fun CardFront(
    post: HeikaPost?,
    modifier: Modifier = Modifier,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
    sharedElementsEnabled: Boolean = false,
) {
    val titleScale = LocalHeikaTitleTextScale.current
    val image = post?.thumbnail
    var imageFailed by remember(image, post?.cloudId) { mutableStateOf(false) }
    val sharedModifier = if (post != null && sharedElementsEnabled && sharedTransitionScope != null && animatedVisibilityScope != null) {
        with(sharedTransitionScope) {
            Modifier.heikaSharedPostImage(sharedTransitionScope, animatedVisibilityScope, post.sharedImageKey(), isDetail = false, enabled = true)
        }
    } else Modifier
    Box(modifier.fillMaxSize().then(if (image == null) sharedModifier else Modifier).background(MaterialTheme.colorScheme.surfaceVariant)) {
        if (image != null) {
            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant).then(sharedModifier)) {
                AsyncImage(
                    model = imageRequest(image, post.cloudId, 0),
                    contentDescription = post.title,
                    imageLoader = LocalHeikaImageLoader.current,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    onState = { state -> imageFailed = state is AsyncImagePainter.State.Error },
                )
            }
        } else {
            Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF55594F), Color(0xFF292B29), Color(0xFF171A1D)))))
        }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .06f), Color.Black.copy(alpha = .86f)))))
        if (imageFailed) Text("图片暂不可用", Modifier.align(Alignment.Center).clip(RoundedCornerShape(9.dp)).background(Color.Black.copy(alpha = .58f)).padding(horizontal = 10.dp, vertical = 7.dp), color = Color.White.copy(alpha = .9f), fontSize = 10.sp)
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(horizontal = 14.dp, vertical = 15.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(post?.tag ?: "黑卡内容", color = Color.White.copy(alpha = .82f), fontSize = 10.sp, maxLines = 1)
            Text(post?.title ?: "已翻开的卡片", color = Color.White, fontSize = 16.sp * titleScale, lineHeight = 22.sp * titleScale, fontWeight = FontWeight.SemiBold, maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (post?.hasRating == true) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(com.heika.nativeapp.ui.HeikaIcons.StarOutline, null, tint = HeikaPalette.Gold, modifier = Modifier.size(13.dp))
                Text(String.format(java.util.Locale.US, "%.1f", post.ratingAverage), color = HeikaPalette.Gold, fontSize = 11.sp)
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
private fun imageRequest(uri: String, id: String, index: Int): coil3.request.ImageRequest =
    coil3.request.ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current)
        .data(uri)
        .memoryCacheKey(imageCacheKey(id, uri, "daily-thumb-$index"))
        .diskCacheKey(imageCacheKey(id, uri, "daily-thumb-$index"))
        .crossfade(140)
        .build()

