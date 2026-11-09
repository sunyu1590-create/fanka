package com.heika.nativeapp.feature.home

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.imageCacheKey
import com.heika.nativeapp.ui.BrandHeader
import com.heika.nativeapp.ui.HeikaPalette
import com.heika.nativeapp.ui.LocalHeikaImageLoader

@Composable
fun HomeScreen(
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BrandHeader(onSearch = onSearch, onNotifications = onNotifications)
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 19.dp, end = 19.dp, top = 14.dp, bottom = 126.dp),
            horizontalArrangement = Arrangement.spacedBy(13.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                            .background(MaterialTheme.colorScheme.surface)
                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.58f), RoundedCornerShape(14.dp))
                            .padding(horizontal = 17.dp, vertical = 15.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("今日已翻开 ${state.openedIds.size.coerceAtMost(state.allowance)} / ${state.allowance} 张", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        Text(if (state.remaining > 0) "还可翻开 ${state.remaining} 张" else "今天已经探索完成", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
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
                    number = index + 1,
                    post = post,
                    opened = opened,
                    opening = state.openingId == id,
                    onClick = {
                        if (opened && post != null) onPost(post) else viewModel.flip(id)
                    },
                )
            }
        }
    }
}

@Composable
private fun FlipCard(number: Int, post: HeikaPost?, opened: Boolean, opening: Boolean, onClick: () -> Unit) {
    val rotation by animateFloatAsState(
        targetValue = if (opened) 180f else 0f,
        animationSpec = tween(durationMillis = 620, easing = FastOutSlowInEasing),
        label = "heika-flip-card",
    )
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.76f)
            .shadow(3.dp, RoundedCornerShape(16.dp))
            .graphicsLayer { rotationY = rotation; cameraDistance = 14 * density }
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, Color(0xFF79868A).copy(alpha = 0.75f), RoundedCornerShape(16.dp))
            .clickable(enabled = !opening, onClick = onClick),
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
private fun CardBack(number: Int) {
    val shape = RoundedCornerShape(15.dp)
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF263236), Color(0xFF10171B), Color(0xFF1A2327))))) {
        Canvas(Modifier.fillMaxSize().padding(6.dp)) {
            val inset = 1.dp.toPx()
            drawRoundRect(color = Color(0xFFB9C6C8).copy(alpha = 0.62f), topLeft = androidx.compose.ui.geometry.Offset(inset, inset), size = androidx.compose.ui.geometry.Size(size.width - inset * 2, size.height - inset * 2), cornerRadius = androidx.compose.ui.geometry.CornerRadius(14.dp.toPx()), style = Stroke(1.dp.toPx()))
            val path = Path().apply {
                moveTo(size.width * .5f, size.height * .26f)
                lineTo(size.width * .84f, size.height * .5f)
                lineTo(size.width * .5f, size.height * .73f)
                lineTo(size.width * .16f, size.height * .5f)
                close()
            }
            drawPath(path, Color(0xFFBFC9CA).copy(alpha = .24f), style = Stroke(1.dp.toPx()))
            for (line in 0..16) {
                val x = size.width * (line / 16f)
                drawLine(Color.White.copy(alpha = 0.035f), start = androidx.compose.ui.geometry.Offset(x, 0f), end = androidx.compose.ui.geometry.Offset(x - size.height * .24f, size.height), strokeWidth = 1.dp.toPx())
            }
        }
        Text(number.toString().padStart(2, '0'), Modifier.align(Alignment.TopStart).padding(18.dp), color = Color(0xFFB7C3C5), fontSize = 14.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Medium)
        Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("黑卡 · HEIKA", color = Color(0xFFF0F0ED), fontSize = 18.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Medium)
        }
        Text("轻触翻开", Modifier.align(Alignment.BottomStart).padding(18.dp), color = Color(0xFFC1C6C7), fontSize = 12.sp, letterSpacing = 1.1.sp)
        Box(Modifier.fillMaxSize().padding(3.dp).border(1.dp, Color.White.copy(alpha = .08f), shape))
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

