package com.heika.nativeapp.feature.discovery

import android.util.Log
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.draw.alpha
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
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.HeikaLiquidBadgeSurface
import com.heika.nativeapp.ui.LocalHeikaTitleTextScale
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.heikaSharedPostImage
import com.heika.nativeapp.ui.sharedImageKey
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import java.util.Locale

@Composable
@OptIn(ExperimentalSharedTransitionApi::class, ExperimentalMaterial3Api::class)
fun DiscoveryScreen(
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onAiResources: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    hazeState: HazeState,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    sharedElementsEnabled: Boolean,
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
    val badgeHazeState = rememberHazeState()
    val filter = state.filter
    val categories = if (filter.channel == "community") state.communityCategories else state.aiCategories
    val tags = if (filter.channel == "community") state.communityTags else state.aiTags
    var communityCollapsePx by rememberSaveable { mutableFloatStateOf(0f) }
    var aiCollapsePx by rememberSaveable { mutableFloatStateOf(0f) }
    var extraFiltersExpanded by rememberSaveable { mutableStateOf(false) }
    val rangeDp = 42.dp + (if (filter.channel == "ai") 96.dp else 0.dp) + if (extraFiltersExpanded) {
        (if (tags.isNotEmpty()) 36.dp else 0.dp) + (if (filter.channel == "ai") 36.dp else 0.dp) + 40.dp
    } else 0.dp
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
        BrandHeader(
            onSearch = onSearch,
            onNotifications = onNotifications,
            trailing = {
                androidx.compose.material3.IconButton(onClick = onNotifications) {
                    Icon(HeikaIcons.Notifications, contentDescription = "通知", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                androidx.compose.material3.IconButton(onClick = {
                    extraFiltersExpanded = !extraFiltersExpanded
                    if (filter.channel == "community") communityCollapsePx = 0f else aiCollapsePx = 0f
                }) {
                    Icon(HeikaIcons.Filter, contentDescription = if (extraFiltersExpanded) "收起筛选" else "展开筛选", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            hazeState = hazeState,
        )
        Row(
            Modifier.fillMaxWidth().height(42.dp).padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .42f))
                    .padding(3.dp),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ChannelOption("精选", filter.channel == "community") { viewModel.selectChannel("community") }
                ChannelOption("AI", filter.channel == "ai") { viewModel.selectChannel("ai") }
            }
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
        }
        Box(
            Modifier.fillMaxWidth()
                .height(with(density) { (rangePx - collapsedPx).coerceAtLeast(0f).toDp() })
                .clipToBounds(),
        ) {
            Column(
                Modifier.fillMaxWidth().height(rangeDp).offset { IntOffset(0, -collapsedPx.toInt()) },
            ) {
                if (filter.channel == "ai") AiResourceSpaceEntry(hazeState = badgeHazeState, onClick = onAiResources)
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
                if (extraFiltersExpanded && tags.isNotEmpty()) {
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
                if (extraFiltersExpanded && filter.channel == "ai") {
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
                if (extraFiltersExpanded) LazyRow(
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
        PullToRefreshBox(
            isRefreshing = posts.itemCount > 0 && posts.loadState.refresh is LoadState.Loading,
            onRefresh = { posts.refresh() },
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
            FeedGrid(
                posts = posts,
                state = gridState,
                onPost = onPost,
                columns = if (feedLayout == "single") 1 else 2,
                modifier = Modifier.fillMaxSize(),
                filter = filter,
                onSortChange = viewModel::selectSort,
                hazeState = badgeHazeState,
                sharedTransitionScope = sharedTransitionScope,
                animatedVisibilityScope = animatedVisibilityScope,
                sharedElementsEnabled = sharedElementsEnabled,
            )
        }
    }
}

@Composable
private fun AiResourceSpaceEntry(hazeState: HazeState, onClick: () -> Unit) {
    val entries = listOf(
        HeikaIcons.Robot to "Agent", HeikaIcons.Blocks to "Skills", HeikaIcons.Terminal to "Prompt",
        HeikaIcons.Wrench to "工具", HeikaIcons.BrainCircuit to "知识", HeikaIcons.Text to "案例",
    )
    Column(
        Modifier.fillMaxWidth().height(96.dp).padding(horizontal = 16.dp, vertical = 3.dp)
            .clip(RoundedCornerShape(15.dp))
            .hazeEffect(
                state = hazeState,
                style = dev.chrisbanes.haze.HazeStyle(
                    backgroundColor = MaterialTheme.colorScheme.surface,
                    tint = dev.chrisbanes.haze.HazeTint(MaterialTheme.colorScheme.surface.copy(alpha = .22f)),
                    blurRadius = 18.dp,
                    noiseFactor = 0f,
                    fallbackTint = dev.chrisbanes.haze.HazeTint(MaterialTheme.colorScheme.surface.copy(alpha = .92f)),
                ),
            )
            .background(MaterialTheme.colorScheme.surface.copy(alpha = .72f))
            .border(.7.dp, MaterialTheme.colorScheme.outline.copy(alpha = .45f), RoundedCornerShape(15.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("探索 AI 资源", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text("Agent · Skills · Prompt · 更多", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1)
            }
            Icon(HeikaIcons.ArrowUpRight, contentDescription = "进入 AI 资源中心", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(17.dp))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            entries.forEach { (icon, label) ->
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
                    Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun ChannelOption(label: String, selected: Boolean, onClick: () -> Unit) {
    val color by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        tween(220), label = "discover-channel-color",
    )
    Box(
        Modifier.width(74.dp).height(34.dp).clip(RoundedCornerShape(50))
            .background(if (selected) MaterialTheme.colorScheme.surface else Color.Transparent)
            .border(.7.dp, if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .58f) else MaterialTheme.colorScheme.outline.copy(alpha = .48f), RoundedCornerShape(50))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = color, fontSize = 12.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium)
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
    Box(
        Modifier.clip(RoundedCornerShape(9.dp))
            .background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .10f) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 6.dp),
    ) {
        Text(label, color = color, fontSize = 12.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
    }
}

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
internal fun FeedGrid(
    posts: androidx.paging.compose.LazyPagingItems<HeikaPost>,
    state: LazyStaggeredGridState,
    onPost: (HeikaPost) -> Unit,
    columns: Int,
    modifier: Modifier = Modifier,
    filter: FeedFilter,
    onSortChange: (String) -> Unit,
    hazeState: HazeState,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    sharedElementsEnabled: Boolean,
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
            FeedCard(post, onClick = { onPost(post) }, hazeState = hazeState, sharedTransitionScope = sharedTransitionScope, animatedVisibilityScope = animatedVisibilityScope, sharedElementsEnabled = sharedElementsEnabled)
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
@OptIn(ExperimentalSharedTransitionApi::class)
internal fun FeedCard(
    post: HeikaPost,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    hazeState: HazeState? = null,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
    sharedElementsEnabled: Boolean = false,
) {
    val image = post.thumbnail
    val titleScale = LocalHeikaTitleTextScale.current
    Column(modifier.fillMaxWidth()) {
        if (image != null) {
            var imageFailed by remember(image, post.cloudId) { mutableStateOf(false) }
            var imageRetry by remember(image, post.cloudId) { mutableStateOf(0) }
            val ratio = remember(post.id) { listOf(.78f, .88f, 1.02f)[Math.floorMod(post.id, 3)] }
            val sharedImageModifier = if (sharedElementsEnabled && sharedTransitionScope != null && animatedVisibilityScope != null) {
                with(sharedTransitionScope) {
                    Modifier.heikaSharedPostImage(
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = animatedVisibilityScope,
                        postKey = post.sharedImageKey(),
                        isDetail = false,
                        enabled = true,
                    )
                }
            } else Modifier
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.feedCard)).clickable(onClick = onClick)
                    .background(MaterialTheme.colorScheme.surfaceVariant).aspectRatio(ratio),
            ) {
                val context = LocalContext.current
                val request = remember(image, post.cloudId, imageRetry) {
                    ImageRequest.Builder(context).data(image)
                        .memoryCacheKey(imageCacheKey(post.cloudId, image, "feed-thumb"))
                        .diskCacheKey(imageCacheKey(post.cloudId, image, "feed-thumb"))
                        .crossfade(130).build()
                }
                Box(
                    Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant)
                        .then(sharedImageModifier)
                        .then(hazeState?.let { Modifier.hazeSource(it) } ?: Modifier),
                ) {
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
                            Modifier.align(Alignment.Center).clip(RoundedCornerShape(9.dp)).background(Color.Black.copy(alpha = .58f))
                                .clickable { imageRetry++; imageFailed = false }
                                .padding(horizontal = 10.dp, vertical = 7.dp),
                            color = Color.White.copy(alpha = .9f),
                            fontSize = 10.sp,
                        )
                    }
                }
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = .27f), Color.Transparent, Color.Black.copy(alpha = .7f)))))
                HeikaLiquidBadgeSurface(
                    hazeState = hazeState,
                    modifier = Modifier.align(Alignment.TopStart).padding(8.dp),
                    shape = RoundedCornerShape(HeikaRadii.categoryTag),
                    contentPadding = PaddingValues(horizontal = 7.dp, vertical = 3.dp),
                ) {
                    Text(post.tag, color = MaterialTheme.colorScheme.onSurface, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                RatingTag(post, Modifier.align(Alignment.TopEnd).padding(8.dp), hazeState = hazeState, contentColor = MaterialTheme.colorScheme.onSurface)
                Text(post.title, Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(horizontal = 12.dp, vertical = 13.dp), color = Color.White, fontSize = 15.sp * titleScale, lineHeight = 20.sp * titleScale, fontWeight = FontWeight.SemiBold, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        } else {
            val sharedCardModifier = if (sharedElementsEnabled && sharedTransitionScope != null && animatedVisibilityScope != null) {
                with(sharedTransitionScope) {
                    Modifier.heikaSharedPostImage(
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = animatedVisibilityScope,
                        postKey = post.sharedImageKey(),
                        isDetail = false,
                        enabled = true,
                    )
                }
            } else Modifier
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.feedCard)).clickable(onClick = onClick)
                    .background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .65f), RoundedCornerShape(HeikaRadii.feedCard))
                    .then(sharedCardModifier).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(post.tag, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.weight(1f))
                    RatingTag(post, hazeState = hazeState, contentColor = MaterialTheme.colorScheme.onSurface)
                }
                Text(post.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp * titleScale, lineHeight = 20.sp * titleScale, fontWeight = FontWeight.SemiBold, maxLines = 4, overflow = TextOverflow.Ellipsis)
                Text(post.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp, maxLines = 5, overflow = TextOverflow.Ellipsis)
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(post.author, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Icon(HeikaIcons.LikeOutline, contentDescription = "赞", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
            Text(" ${post.likeCount}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
            Icon(HeikaIcons.OpenInNew, contentDescription = "打开内容详情", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 5.dp).size(12.dp).alpha(.62f))
        }
    }
}

@Composable
private fun RatingTag(post: HeikaPost, modifier: Modifier = Modifier, hazeState: HazeState? = null, contentColor: Color = Color.White) {
    HeikaLiquidBadgeSurface(
        hazeState = hazeState,
        modifier = modifier,
        shape = RoundedCornerShape(HeikaRadii.ratingTag),
        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 3.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(HeikaIcons.StarOutline, contentDescription = null, tint = HeikaGold, modifier = Modifier.size(12.dp))
            Text(if (post.hasRating) String.format(Locale.US, "%.1f", post.ratingAverage) else "待评", color = contentColor, fontSize = 9.sp, fontWeight = FontWeight.Medium)
        }
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

