package com.heika.nativeapp.feature.discovery

import android.util.Log
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.remember
import coil3.request.crossfade
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalDensity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.paging.LoadState
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.paging.compose.itemKey
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import coil3.request.ImageRequest
import com.heika.nativeapp.data.FeedFilter
import com.heika.nativeapp.data.HeikaCategory
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.imageCacheKey
import com.heika.nativeapp.ui.BrandHeader
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.HeikaRadii
import java.util.Locale

@Composable
fun DiscoveryScreen(
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    viewModel: DiscoveryViewModel = hiltViewModel(),
) {
    DisposableEffect(Unit) {
        Log.i("HEIKA_NATIVE", "renderer=compose screen=discovery")
        onDispose { }
    }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val feedLayout by viewModel.feedLayout.collectAsStateWithLifecycle()
    val posts = viewModel.posts.collectAsLazyPagingItems()
    val communityGrid = rememberLazyStaggeredGridState()
    val aiGrid = rememberLazyStaggeredGridState()
    val filter = state.filter
    val categories = if (filter.channel == "community") state.communityCategories else state.aiCategories
    val tags = if (filter.channel == "community") state.communityTags else state.aiTags
    var communityCollapsePx by rememberSaveable { mutableFloatStateOf(0f) }
    var aiCollapsePx by rememberSaveable { mutableFloatStateOf(0f) }
    val rangeDp = 42.dp + (if (tags.isNotEmpty()) 36.dp else 0.dp) +
        (if (filter.channel == "ai") 36.dp else 0.dp) + 40.dp
    val density = LocalDensity.current
    val rangePx = with(density) { rangeDp.toPx() }
    val collapsedPx = if (filter.channel == "community") communityCollapsePx else aiCollapsePx
    androidx.compose.runtime.LaunchedEffect(filter.channel, rangePx) {
        communityCollapsePx = communityCollapsePx.coerceAtMost(rangePx)
        aiCollapsePx = aiCollapsePx.coerceAtMost(rangePx)
    }
    val collapseConnection = remember(filter.channel, rangePx) {
        object : NestedScrollConnection {
            override fun onPreScroll(available: androidx.compose.ui.geometry.Offset, source: NestedScrollSource): androidx.compose.ui.geometry.Offset {
                val current = if (filter.channel == "community") communityCollapsePx else aiCollapsePx
                val next = when {
                    available.y < 0f -> (current - available.y).coerceAtMost(rangePx)
                    available.y > 0f -> (current - available.y).coerceAtLeast(0f)
                    else -> current
                }
                val consumedY = current - next
                if (filter.channel == "community") communityCollapsePx = next else aiCollapsePx = next
                return androidx.compose.ui.geometry.Offset(0f, consumedY)
            }
        }
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).nestedScroll(collapseConnection)) {
        BrandHeader(onSearch = onSearch, onNotifications = onNotifications) {
            androidx.compose.material3.IconButton(onClick = onNotifications) {
                Icon(Icons.Outlined.NotificationsNone, contentDescription = "通知", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            androidx.compose.material3.IconButton(onClick = { posts.refresh() }) {
                Icon(Icons.Outlined.Refresh, contentDescription = "刷新内容", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(
            Modifier.fillMaxWidth().height(42.dp).padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("发现", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(19.dp))
            ChannelOption("精选", filter.channel == "community") { viewModel.selectChannel("community") }
            Spacer(Modifier.width(17.dp))
            ChannelOption("AI", filter.channel == "ai") { viewModel.selectChannel("ai") }
            Spacer(Modifier.weight(1f))
            Text(
                "${filter.category?.name ?: if (filter.channel == "community") "推荐" else "AI"} · ${filter.sort}",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable {
                    if (filter.channel == "community") communityCollapsePx = 0f else aiCollapsePx = 0f
                },
            )
            androidx.compose.material3.IconButton(onClick = {
                if (filter.channel == "community") communityCollapsePx = 0f else aiCollapsePx = 0f
            }, modifier = Modifier.size(34.dp)) {
                Icon(Icons.Outlined.Tune, contentDescription = "筛选", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            }
        }
        Box(
            Modifier.fillMaxWidth()
                .height(with(density) { (rangePx - collapsedPx).coerceAtLeast(0f).toDp() })
                .clipToBounds(),
        ) {
            Column(
                Modifier.fillMaxWidth().height(rangeDp).offset { IntOffset(0, -collapsedPx.toInt()) },
            ) {
                LazyRow(
                    Modifier.height(42.dp),
                    contentPadding = PaddingValues(horizontal = 19.dp),
                    horizontalArrangement = Arrangement.spacedBy(22.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    item(key = "all-categories") {
                        CategoryTab("推荐", selected = filter.category == null) { viewModel.selectCategory(null) }
                    }
                    items(categories, key = { "category-${it.id}" }) { category ->
                        CategoryTab(category.name, selected = filter.category?.id == category.id) { viewModel.selectCategory(category) }
                    }
                }
                if (tags.isNotEmpty()) {
                    LazyRow(
                        Modifier.height(36.dp),
                        contentPadding = PaddingValues(horizontal = 19.dp),
                        horizontalArrangement = Arrangement.spacedBy(15.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        item(key = "all-tags") { CompactFilter("全部话题", filter.topic == null) { viewModel.selectTopic(null) } }
                        items(tags.take(12), key = { "topic-${it.id}" }) { tag ->
                            CompactFilter("#${tag.name}", filter.topic == tag.name) { viewModel.selectTopic(if (filter.topic == tag.name) null else tag.name) }
                        }
                    }
                }
                if (filter.channel == "ai") {
                    val types = listOf(
                        null to "全部资源",
                        "knowledge_article" to "知识",
                        "agent" to "Agent",
                        "skill" to "Skill",
                        "prompt" to "Prompt",
                        "ai_tool" to "工具",
                        "tutorial" to "教程",
                    )
                    LazyRow(
                        Modifier.height(36.dp),
                        contentPadding = PaddingValues(horizontal = 19.dp),
                        horizontalArrangement = Arrangement.spacedBy(15.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        items(types, key = { "ai-type-${it.first ?: "all"}" }) { (type, label) ->
                            CompactFilter(label, filter.contentType == type) { viewModel.selectContentType(type) }
                        }
                    }
                }
                LazyRow(
                    Modifier.height(40.dp),
                    contentPadding = PaddingValues(horizontal = 19.dp),
                    horizontalArrangement = Arrangement.spacedBy(23.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val sorts = if (filter.channel == "community") listOf("推荐", "最新", "高评分", "关注") else listOf("推荐", "最新", "热门")
                    items(sorts, key = { "sort-$it" }) { sort -> SortTab(sort, filter.sort == sort) { viewModel.selectSort(sort) } }
                }
            }
        }
        val gridState = if (filter.channel == "community") communityGrid else aiGrid
        FeedGrid(
            posts = posts,
            state = gridState,
            onPost = onPost,
            columns = if (feedLayout == "single") 1 else 2,
            modifier = Modifier.weight(1f),
            filter = filter,
            onSortChange = viewModel::selectSort,
        )
    }
}

@Composable
private fun ChannelOption(label: String, selected: Boolean, onClick: () -> Unit) {
    val color by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        tween(220), label = "discover-channel-color",
    )
    val indicatorWidth by animateDpAsState(if (selected) 18.dp else 0.dp, tween(240), label = "discover-channel-indicator")
    Column(
        Modifier.clickable(onClick = onClick).padding(vertical = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(label, color = color, fontSize = 13.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
        Box(Modifier.width(indicatorWidth).height(2.dp).clip(RoundedCornerShape(1.dp)).background(MaterialTheme.colorScheme.primary))
    }
}

@Composable
private fun CategoryTab(label: String, selected: Boolean, onClick: () -> Unit) {
    Column(Modifier.clickable(onClick = onClick).padding(horizontal = 1.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(label, color = if (selected) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
        Box(Modifier.height(2.dp).width((label.length * 14).dp).background(if (selected) MaterialTheme.colorScheme.primary else Color.Transparent))
    }
}

@Composable
private fun CompactFilter(label: String, selected: Boolean, onClick: () -> Unit) {
    val color by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        tween(180), label = "discover-filter-color",
    )
    Text(
        label,
        Modifier.clip(RoundedCornerShape(HeikaRadii.control)).clickable(onClick = onClick)
            .background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .09f) else Color.Transparent)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        color = color,
        fontSize = 11.sp,
        fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
        maxLines = 1,
    )
}

@Composable
private fun SortTab(label: String, selected: Boolean, onClick: () -> Unit) {
    val color by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant,
        tween(200), label = "discover-sort-color",
    )
    val indicatorWidth by animateDpAsState(if (selected) (label.length * 13).dp else 0.dp, tween(240), label = "discover-sort-indicator")
    Column(
        Modifier.clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(label, color = color, fontSize = 12.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
        Box(Modifier.width(indicatorWidth).height(2.dp).clip(RoundedCornerShape(1.dp)).background(MaterialTheme.colorScheme.primary))
    }
}

@Composable
private fun FeedGrid(
    posts: androidx.paging.compose.LazyPagingItems<HeikaPost>,
    state: LazyStaggeredGridState,
    onPost: (HeikaPost) -> Unit,
    columns: Int,
    modifier: Modifier = Modifier,
    filter: FeedFilter,
    onSortChange: (String) -> Unit,
) {
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(columns.coerceIn(1, 2)),
        state = state,
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 9.dp, bottom = 128.dp),
        horizontalArrangement = Arrangement.spacedBy(13.dp),
        verticalItemSpacing = 18.dp,
    ) {
        items(count = posts.itemCount, key = posts.itemKey { it.cloudId }) { index ->
            val post = posts[index] ?: return@items
            FeedCard(post, onClick = { onPost(post) })
        }
        when {
            posts.loadState.refresh is LoadState.Loading && posts.itemCount == 0 -> item(span = StaggeredGridItemSpan.FullLine) {
                Box(Modifier.fillMaxWidth().height(150.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(24.dp), color = MaterialTheme.colorScheme.primary, strokeWidth = 2.dp)
                }
            }
            posts.loadState.refresh is LoadState.Error && posts.itemCount == 0 -> item(span = StaggeredGridItemSpan.FullLine) {
                EmptyFeed(message = (posts.loadState.refresh as LoadState.Error).error.message ?: "内容暂时无法加载", onRetry = posts::retry)
            }
            posts.loadState.append is LoadState.Loading -> item(span = StaggeredGridItemSpan.FullLine) {
                Box(Modifier.fillMaxWidth().height(60.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(20.dp), color = MaterialTheme.colorScheme.primary, strokeWidth = 2.dp)
                }
            }
            posts.loadState.append is LoadState.Error -> item(span = StaggeredGridItemSpan.FullLine) {
                androidx.compose.material3.TextButton(onClick = posts::retry, modifier = Modifier.fillMaxWidth()) { Text("加载更多失败 · 点击重试") }
            }
            posts.loadState.refresh is LoadState.NotLoading && posts.itemCount == 0 -> item(span = StaggeredGridItemSpan.FullLine) {
                val noCuratedAi = filter.channel == "ai" && filter.sort == "推荐"
                EmptyFeed(
                    message = if (noCuratedAi) "暂无推荐内容" else "暂无内容",
                    actionLabel = if (noCuratedAi) "查看最新内容" else "重新加载",
                    onRetry = if (noCuratedAi) ({ onSortChange("最新") }) else posts::refresh,
                )
            }
        }
    }
}

@Composable
internal fun FeedCard(post: HeikaPost, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val image = post.thumbnail
    Column(modifier.fillMaxWidth()) {
        if (image != null) {
            var imageFailed by remember(image, post.cloudId) { mutableStateOf(false) }
            val ratio = remember(post.id) { listOf(.78f, .88f, 1.02f)[Math.floorMod(post.id, 3)] }
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.feedCard)).clickable(onClick = onClick)
                    .background(MaterialTheme.colorScheme.surfaceVariant).aspectRatio(ratio),
            ) {
                val context = LocalContext.current
                val request = remember(image, post.cloudId) {
                    ImageRequest.Builder(context).data(image)
                        .memoryCacheKey(imageCacheKey(post.cloudId, image, "feed-thumb"))
                        .diskCacheKey(imageCacheKey(post.cloudId, image, "feed-thumb"))
                        .crossfade(130).build()
                }
                AsyncImage(
                    request,
                    contentDescription = post.title,
                    imageLoader = LocalHeikaImageLoader.current,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                    onState = { state -> imageFailed = state is AsyncImagePainter.State.Error },
                )
                if (imageFailed) {
                    Text(
                        "图片暂不可用",
                        Modifier.align(Alignment.Center).clip(RoundedCornerShape(9.dp)).background(Color.Black.copy(alpha = .58f)).padding(horizontal = 10.dp, vertical = 7.dp),
                        color = Color.White.copy(alpha = .9f),
                        fontSize = 10.sp,
                    )
                }
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = .27f), Color.Transparent, Color.Black.copy(alpha = .7f)))))
                Box(Modifier.align(Alignment.TopStart).padding(9.dp).clip(RoundedCornerShape(HeikaRadii.categoryTag)).background(Color.Black.copy(alpha = .46f)).padding(horizontal = 11.dp, vertical = 6.dp)) {
                    Text(post.tag, color = Color.White, fontSize = 10.sp, maxLines = 1)
                }
                RatingTag(post, Modifier.align(Alignment.TopEnd).padding(8.dp))
                Text(post.title, Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(horizontal = 12.dp, vertical = 13.dp), color = Color.White, fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        } else {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.feedCard)).clickable(onClick = onClick)
                    .background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .65f), RoundedCornerShape(HeikaRadii.feedCard))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(post.tag, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.weight(1f))
                    RatingTag(post)
                }
                Text(post.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold, maxLines = 4, overflow = TextOverflow.Ellipsis)
                Text(post.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp, maxLines = 5, overflow = TextOverflow.Ellipsis)
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(post.author, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Icon(Icons.Outlined.FavoriteBorder, contentDescription = "赞", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
            Text(" ${post.likeCount}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
        }
    }
}

@Composable
private fun RatingTag(post: HeikaPost, modifier: Modifier = Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(HeikaRadii.ratingTag)).background(Color.Black.copy(alpha = .47f))
            .border(1.dp, HeikaGold.copy(alpha = .5f), RoundedCornerShape(HeikaRadii.ratingTag))
            .padding(horizontal = 9.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(Icons.Outlined.StarOutline, contentDescription = null, tint = HeikaGold, modifier = Modifier.size(14.dp))
        Text(if (post.hasRating) String.format(Locale.US, "%.1f", post.ratingAverage) else "待评级", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun EmptyFeed(message: String, actionLabel: String = "重新加载", onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 34.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
        androidx.compose.material3.OutlinedButton(onClick = onRetry) { Text(actionLabel) }
    }
}

private val HeikaGold = Color(0xFFD8BB70)

