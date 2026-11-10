package com.heika.nativeapp.feature.home

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.material.icons.outlined.Close
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
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
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.imageCacheKey
import com.heika.nativeapp.ui.BrandHeader
import com.heika.nativeapp.ui.HeikaPalette
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.HeikaRadii
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

@Composable
fun HomeScreen(
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    onPreviewActive: (Boolean) -> Unit = {},
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
        Column(Modifier.fillMaxSize().hazeSource(previewHaze)) {
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
                    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        val openedCount = state.openedIds.size.coerceAtMost(state.allowance)
                        val progress by animateFloatAsState(
                            targetValue = if (state.allowance > 0) openedCount.toFloat() / state.allowance else 0f,
                            animationSpec = tween(260, easing = FastOutSlowInEasing),
                            label = "daily-exploration-progress",
                        )
                        Row(
                            Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 1.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text("今日探索", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                                Text(
                                    if (state.remaining > 0) "还可翻开 ${state.remaining} 张，继续发现新内容" else "今天的探索已经完成，明天再来看看",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 10.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Text(
                                "$openedCount / ${state.allowance}",
                                color = HeikaPalette.Gold,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
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
                        Spacer(Modifier.height(5.dp))
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
                canConfirm = state.remaining > 0 || state.userId != HomeUiState.GUEST_ID,
                error = state.error,
                closeRequest = closeRequest,
                onConfirm = { viewModel.flip(selected.id) },
                onOpenDetails = { state.posts[selected.id]?.let(onPost) },
                onDismiss = { preview = null },
                hazeState = previewHaze,
            )
        }
    }
}

private data class DailyCardPreview(val id: Int, val number: Int, val sourceBounds: Rect?)

@Composable
private fun FlipCard(cardId: Int, number: Int, post: HeikaPost?, opened: Boolean, opening: Boolean, onClick: (Rect?) -> Unit) {
    var sourceBounds by remember(cardId) { mutableStateOf<Rect?>(null) }
    val rotation by animateFloatAsState(
        targetValue = if (opened) 180f else 0f,
        animationSpec = tween(durationMillis = 620, easing = FastOutSlowInEasing),
        label = "heika-flip-card",
    )
    Box(
        modifier = Modifier
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
            .clickable(enabled = !opening, onClick = { onClick(sourceBounds) }),
    ) {
        if (rotation < 90f) {
            CardBack(number)
        } else {
            CardFront(post, modifier = Modifier.graphicsLayer { rotationY = 180f })
        }
        if (opening) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.42f)), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = HeikaPalette.Gold)
            }
        }
    }
}

@Composable
private fun FlipPreviewOverlay(
    preview: DailyCardPreview,
    containerWidth: androidx.compose.ui.unit.Dp,
    containerHeight: androidx.compose.ui.unit.Dp,
    containerOrigin: Offset,
    opening: Boolean,
    opened: Boolean,
    post: HeikaPost?,
    canConfirm: Boolean,
    error: String?,
    closeRequest: Int,
    onConfirm: () -> Unit,
    onOpenDetails: () -> Unit,
    onDismiss: () -> Unit,
    hazeState: dev.chrisbanes.haze.HazeState,
) {
    val progress = remember(preview.id) { Animatable(0f) }
    val rotation = remember(preview.id) { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    var dismissing by remember(preview.id) { mutableStateOf(false) }
    var revealing by remember(preview.id) { mutableStateOf(false) }
    var rarityPhase by remember(preview.id) { mutableStateOf(false) }
    var handledCloseRequest by remember(preview.id) { mutableIntStateOf(closeRequest) }
    val targetWidth = (containerWidth - 52.dp).coerceAtMost(390.dp).coerceAtLeast(240.dp)
    val targetWidthPx = with(density) { targetWidth.toPx() }
    val targetHeightPx = targetWidthPx / 0.76f
    val cardCameraDistancePx = with(density) { 18.dp.toPx() }
    val centerX = with(density) { containerWidth.toPx() / 2f }
    val centerY = with(density) { containerHeight.toPx() / 2f }

    LaunchedEffect(preview.id) {
        progress.animateTo(1f, tween(HeikaMotion.spatial, easing = HeikaMotion.spatialEasing))
    }
    LaunchedEffect(opened) {
        if (opened && rotation.value < 180f) {
            revealing = true
            rarityPhase = true
            rotation.animateTo(180f, tween(520, easing = HeikaMotion.spatialEasing))
            revealing = false
            delay(900)
            rarityPhase = false
        }
    }
    LaunchedEffect(closeRequest, opening, revealing, dismissing) {
        if (closeRequest > handledCloseRequest) {
            if (!opening && !revealing && !dismissing) {
                handledCloseRequest = closeRequest
                dismissing = true
                progress.animateTo(0f, tween(HeikaMotion.transition, easing = HeikaMotion.spatialEasing))
                onDismiss()
            }
        }
    }

    fun requestDismiss() {
        if (opening || revealing || dismissing) return
        dismissing = true
        scope.launch {
            progress.animateTo(0f, tween(HeikaMotion.transition, easing = HeikaMotion.spatialEasing))
            onDismiss()
        }
    }

    Box(Modifier.fillMaxSize()) {
        val expand = progress.value.coerceIn(0f, 1f)
        Box(
            Modifier.fillMaxSize()
                .hazeEffect(
                    state = hazeState,
                    style = HazeStyle(
                        backgroundColor = MaterialTheme.colorScheme.background.copy(alpha = 0.18f * expand),
                        tint = HazeTint(Color.Black.copy(alpha = 0.52f * expand)),
                        blurRadius = 24.dp * expand,
                        noiseFactor = 0.018f,
                        fallbackTint = HazeTint(MaterialTheme.colorScheme.background.copy(alpha = 0.78f * expand)),
                    ),
                )
                .background(Color.Black.copy(alpha = 0.42f * expand))
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
                    scaleX = sourceScaleX + (1f - sourceScaleX) * p
                    scaleY = sourceScaleY + (1f - sourceScaleY) * p
                    translationX = source?.let { ((it.left + it.right) / 2f - centerX) * (1f - p) } ?: 0f
                    translationY = source?.let { ((it.top + it.bottom) / 2f - centerY) * (1f - p) } ?: 0f
                    rotationY = rotation.value
                    cameraDistance = cardCameraDistancePx
                    shadowElevation = with(density) { (4.dp + 14.dp * p).toPx() }
                    shape = RoundedCornerShape(HeikaRadii.dailyCard)
                    clip = true
                }
                .clip(RoundedCornerShape(HeikaRadii.dailyCard))
                .border(1.dp, Color(0xFF9AA8AA).copy(alpha = 0.8f), RoundedCornerShape(HeikaRadii.dailyCard)),
        ) {
            if (rotation.value < 90f) {
                PreviewCardBack(
                    number = preview.number,
                    alpha = progress.value,
                    opening = opening,
                    canConfirm = canConfirm && progress.value >= 0.92f,
                    error = error,
                    onConfirm = onConfirm,
                )
            } else {
                PreviewCardFront(
                    post = post,
                    alpha = progress.value,
                    enabled = !revealing && !rarityPhase && post != null,
                    rarityPhase = rarityPhase,
                    onOpenDetails = onOpenDetails,
                    modifier = Modifier.graphicsLayer { rotationY = 180f },
                )
            }
        }
        FlipConfetti(enabled = opened)
        androidx.compose.material3.IconButton(
            onClick = { requestDismiss() },
            enabled = !opening && !revealing && !dismissing,
            modifier = Modifier.align(Alignment.TopEnd).padding(top = 12.dp, end = 13.dp),
        ) {
            Icon(
                Icons.Outlined.Close,
                contentDescription = "关闭预览",
                tint = Color.White.copy(alpha = 0.92f),
                modifier = Modifier.size(26.dp),
            )
        }
    }
}

@Composable
private fun PreviewCardBack(
    number: Int,
    alpha: Float,
    opening: Boolean,
    canConfirm: Boolean,
    error: String?,
    onConfirm: () -> Unit,
) {
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
                onClick = onConfirm,
                enabled = !opening && canConfirm,
                modifier = Modifier.fillMaxWidth().height(48.dp),
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
    }
}

@Composable
private fun PreviewCardFront(
    post: HeikaPost?,
    alpha: Float,
    enabled: Boolean,
    rarityPhase: Boolean,
    onOpenDetails: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val revealBlur by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (rarityPhase) 6f else 0f,
        animationSpec = tween(HeikaMotion.transition, easing = HeikaMotion.standard),
        label = "reveal-content-blur",
    )
    Box(modifier.fillMaxSize().alpha(alpha).background(MaterialTheme.colorScheme.surface)) {
      Column(Modifier.fillMaxSize().blur(revealBlur.dp)) {
        val image = post?.thumbnail
        Box(Modifier.fillMaxWidth().weight(0.60f).background(MaterialTheme.colorScheme.surfaceVariant)) {
            if (image != null && post != null) {
                AsyncImage(
                    model = imageRequest(image, post.cloudId, 0),
                    contentDescription = post.title,
                    imageLoader = LocalHeikaImageLoader.current,
                    modifier = Modifier.fillMaxSize(),
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
                val rating = when {
                    post == null -> "待评级"
                    post.hasRating -> String.format(java.util.Locale.US, "☆  %.1f", post.ratingAverage)
                    else -> "☆  待评级"
                }
                Text(rating, color = HeikaPalette.Gold, fontSize = 10.sp)
            }
            Text(
                post?.title ?: "正在恢复卡片内容",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 17.sp,
                lineHeight = 22.sp,
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
                Text("→", fontSize = 20.sp)
            }
        }
      }
      if (rarityPhase) {
          val tier = post?.rarityTier ?: "pending"
          Column(
              Modifier.align(Alignment.Center).clip(RoundedCornerShape(15.dp))
                  .background(Color(0xD9101417)).border(1.dp, HeikaPalette.Gold.copy(alpha = .52f), RoundedCornerShape(15.dp))
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
}

private fun rarityLabel(tier: String): String = when (tier) {
    "ordinary" -> "普通黑卡"
    "S", "SS", "SSS" -> tier
    else -> "评分形成中"
}

@Composable
private fun FlipConfetti(enabled: Boolean) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(enabled) {
        if (enabled) {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(1_650, easing = LinearEasing))
        }
    }
    if (!enabled || progress.value >= 1f) return
    Canvas(Modifier.fillMaxSize()) {
        val colors = listOf(
            Color(0xFFF2C45E), Color(0xFFF05F77), Color(0xFFFF963E), Color(0xFF55C99A),
            Color(0xFF43C7DF), Color(0xFF6F91F5), Color(0xFFB581E8), Color(0xFFF276C0),
        )
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
private fun CardFront(post: HeikaPost?, modifier: Modifier = Modifier) {
    val image = post?.thumbnail
    var imageFailed by remember(image, post?.cloudId) { mutableStateOf(false) }
    Box(modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant)) {
        if (image != null) {
            AsyncImage(
                model = imageRequest(image, post.cloudId, 0),
                contentDescription = post.title,
                imageLoader = LocalHeikaImageLoader.current,
                modifier = Modifier.fillMaxSize(),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                onState = { state -> imageFailed = state is AsyncImagePainter.State.Error },
            )
        } else {
            Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF55594F), Color(0xFF292B29), Color(0xFF171A1D)))))
        }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .06f), Color.Black.copy(alpha = .86f)))))
        if (imageFailed) Text("图片暂不可用", Modifier.align(Alignment.Center).clip(RoundedCornerShape(9.dp)).background(Color.Black.copy(alpha = .58f)).padding(horizontal = 10.dp, vertical = 7.dp), color = Color.White.copy(alpha = .9f), fontSize = 10.sp)
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(horizontal = 14.dp, vertical = 15.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(post?.tag ?: "黑卡内容", color = Color.White.copy(alpha = .82f), fontSize = 10.sp, maxLines = 1)
            Text(post?.title ?: "已翻开的卡片", color = Color.White, fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold, maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (post?.hasRating == true) Text("☆  ${"%.1f".format(post.ratingAverage)}", color = HeikaPalette.Gold, fontSize = 11.sp)
            if (post != null && post.rarityTier in setOf("ordinary", "S", "SS", "SSS")) {
                Text(rarityLabel(post.rarityTier), color = HeikaPalette.Gold, fontSize = 10.sp)
            }
        }
        if (post == null) Text("内容已记录", Modifier.align(Alignment.TopStart).padding(12.dp), color = Color.White, fontSize = 10.sp)
    }
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
            Icon(Icons.Outlined.Refresh, contentDescription = "重试", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(17.dp))
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

