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
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.LaunchedEffect
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.paging.LoadState
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.paging.compose.itemKey
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter
import coil3.request.ImageRequest
import com.heika.nativeapp.data.FeedFilter
import com.heika.nativeapp.data.HeikaCategory
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.imageCacheKey
import com.heika.nativeapp.ui.BrandHeader
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.LocalHeikaMotion
import com.heika.nativeapp.ui.HeikaRadii
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.HeikaSolidBadgeSurface
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.LocalHeikaTitleTextScale
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.heikaSharedPostImage
import com.heika.nativeapp.ui.heikaSharedPostMeta
import com.heika.nativeapp.ui.sharedAuthorKey
import com.heika.nativeapp.ui.sharedImageKey
import com.heika.nativeapp.ui.sharedRatingKey
import com.heika.nativeapp.ui.sharedTagKey
import com.heika.nativeapp.ui.HeikaImageRatioCache
import com.heika.nativeapp.ui.heikaPhotoTextShadow
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import java.util.Locale
import com.heika.nativeapp.ui.HeikaPulseFeed
import com.heika.nativeapp.ui.HeikaPulseRow
import com.heika.nativeapp.feature.series.SeriesChannelPane

@Composable
@OptIn(ExperimentalSharedTransitionApi::class, ExperimentalMaterial3Api::class)
fun DiscoveryScreen(
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onAiResources: () -> Unit,
    onOpenMall: () -> Unit,
    onOpenSeries: (String) -> Unit,
    onOpenPostById: (String) -> Unit,
    onLogin: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    hazeState: HazeState,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    sharedElementsEnabled: Boolean,
    viewModel: DiscoveryViewModel = hiltViewModel(),
    adViewModel: DiscoveryAdViewModel = hiltViewModel(),
) {
    DisposableEffect(Unit) {
        Log.i("HEIKA_NATIVE", "renderer=compose screen=discovery")
        onDispose { }
    }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val seriesActive by viewModel.seriesActive.collectAsStateWithLifecycle()
    val adState by adViewModel.state.collectAsStateWithLifecycle()
    val feedLayout by viewModel.feedLayout.collectAsStateWithLifecycle()
    val posts = viewModel.posts.collectAsLazyPagingItems()
    val communityGrid = rememberLazyStaggeredGridState()
    val aiGrid = rememberLazyStaggeredGridState()
    val badgeHazeState = rememberHazeState()
    val filter = state.filter
    LaunchedEffect(adViewModel) { adViewModel.refresh() }
    val lifecycleOwner = LocalLifecycleOwner.current
    var discoveryResumedOnce by remember { mutableStateOf(false) }
    DisposableEffect(lifecycleOwner, adViewModel) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                if (discoveryResumedOnce) adViewModel.refresh() else discoveryResumedOnce = true
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val categories = if (filter.channel == "community") state.communityCategories else state.aiCategories
    val tags = if (filter.channel == "community") state.communityTags else state.aiTags
    var communityCollapsePx by rememberSaveable { mutableFloatStateOf(0f) }
    var aiCollapsePx by rememberSaveable { mutableFloatStateOf(0f) }
    var extraFiltersExpanded by rememberSaveable { mutableStateOf(false) }
    var categoryExpanded by rememberSaveable { mutableStateOf(false) }
    val rangeDp = 42.dp + (if (categoryExpanded && categories.size > 3) 38.dp else 0.dp) + if (extraFiltersExpanded) {
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

    // 合集频道有自己的分区结构，不需要社区/AI 的分类吸顶条，避免它压住频道内容。
    val collapseRange = if (seriesActive) 0.dp else rangeDp
    val collapsePx = if (seriesActive) 0f else collapsedPx
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).nestedScroll(collapseConnection)) {
        BrandHeader(
            onSearch = onSearch,
            onNotifications = onNotifications,
            trailing = {
                // 方案A：外层胶囊只留一层很薄的暖灰底，不再靠厚重底色/描边强调；
                // 选中态由内部按钮自己表达，普通频道不再重复描边。
                Row(
                    Modifier.padding(start = 8.dp).clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .24f))
                        .padding(3.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ChannelOption("精选", !seriesActive && filter.channel == "community", compact = true) {
                        viewModel.selectChannel("community")
                        HeikaNoticeBus.showSelection("已切换到精选")
                    }
                    ChannelOption("AI", !seriesActive && filter.channel == "ai", compact = true, leadingIcon = HeikaIcons.Sparkles, goldAccent = true) {
                        viewModel.selectChannel("ai")
                        HeikaNoticeBus.showSelection("已切换到 AI")
                    }
                    ChannelOption("合集", seriesActive, compact = true) {
                        viewModel.selectChannel("series")
                        HeikaNoticeBus.showSelection("已切换到合集")
                    }
                    ChannelOption("商城", false, compact = true) { onOpenMall() }
                }
            },
            showSearch = false,
        )
        Box(
            Modifier.fillMaxWidth()
                .height(with(density) { (collapseRange.toPx() - collapsePx).coerceAtLeast(0f).toDp() })
                .clipToBounds(),
        ) {
            Column(
                Modifier.fillMaxWidth().height(collapseRange).offset { IntOffset(0, -collapsePx.toInt()) },
            ) {
                // 分类由 AI 自动打，长尾分类默认收进「更多」；与网页端保持同一套交互。
                val primaryCategories = categories.take(3)
                val extraCategories = categories.drop(3)
                val selectedExtraCategory = filter.category?.takeIf { current -> extraCategories.any { it.id == current.id } }
                // 第二行：分类导航横向滚动，搜索与筛选按钮固定在右侧。
                // 「探索 AI 资源」不放在这里，改作内容流首项随正文滚动（仅回到顶部才再次出现）。
                Row(
                    Modifier.fillMaxWidth().height(42.dp).padding(start = 16.dp, end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    LazyRow(
                        Modifier.weight(1f).height(42.dp),
                        contentPadding = PaddingValues(end = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                    item(key = "all-categories") {
                        CategoryTab("推荐", selected = filter.category == null) {
                            viewModel.selectCategory(null)
                            HeikaNoticeBus.showSelection("已显示推荐内容")
                        }
                    }
                    items(primaryCategories, key = { "category-${it.id}" }) { category ->
                        CategoryTab(category.name, selected = filter.category?.id == category.id) {
                            viewModel.selectCategory(category)
                            HeikaNoticeBus.showSelection("分类：${category.name}")
                        }
                    }
                    // 收起的选中项仍然显示，避免用户看不到自己选了什么。
                    if (selectedExtraCategory != null && !categoryExpanded) {
                        item(key = "category-selected-extra") {
                            CategoryTab(selectedExtraCategory.name, selected = true) {
                                viewModel.selectCategory(selectedExtraCategory)
                            }
                        }
                    }
                    if (extraCategories.isNotEmpty()) {
                        item(key = "category-more") {
                            CategoryTab(if (categoryExpanded) "收起" else "更多 ${extraCategories.size}", selected = false) {
                                categoryExpanded = !categoryExpanded
                            }
                        }
                    }
                    }
                    androidx.compose.material3.IconButton(
                        onClick = onSearch,
                        modifier = Modifier.size(38.dp),
                    ) {
                        Icon(HeikaIcons.Search, contentDescription = "搜索", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(19.dp))
                    }
                    androidx.compose.material3.IconButton(
                        onClick = {
                            extraFiltersExpanded = !extraFiltersExpanded
                            if (filter.channel == "community") communityCollapsePx = 0f else aiCollapsePx = 0f
                        },
                        modifier = Modifier.size(38.dp),
                    ) {
                        Icon(HeikaIcons.Filter, contentDescription = if (extraFiltersExpanded) "收起筛选" else "展开筛选", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(19.dp))
                    }
                }
                if (categoryExpanded && extraCategories.isNotEmpty()) {
                    LazyRow(
                        Modifier.height(38.dp),
                        contentPadding = PaddingValues(horizontal = 19.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        items(extraCategories, key = { "category-extra-${it.id}" }) { category ->
                            CategoryTab(category.name, selected = filter.category?.id == category.id) {
                                viewModel.selectCategory(category)
                                HeikaNoticeBus.showSelection("分类：${category.name}")
                            }
                        }
                    }
                }
                if (extraFiltersExpanded && tags.isNotEmpty()) {
                    LazyRow(
                        Modifier.height(36.dp),
                        contentPadding = PaddingValues(horizontal = 19.dp),
                        horizontalArrangement = Arrangement.spacedBy(15.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        item(key = "all-tags") { CompactFilter("全部话题", filter.topic == null) {
                            viewModel.selectTopic(null)
                            HeikaNoticeBus.showSelection("已显示全部话题")
                        } }
                        items(tags.take(12), key = { "topic-${it.id}" }) { tag ->
                            CompactFilter("#${tag.name}", filter.topic == tag.name) {
                                val topic = if (filter.topic == tag.name) null else tag.name
                                viewModel.selectTopic(topic)
                                HeikaNoticeBus.showSelection(if (topic == null) "已取消话题筛选" else "话题：#${tag.name}")
                            }
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
                            CompactFilter(label, filter.contentType == type) {
                                viewModel.selectContentType(type)
                                HeikaNoticeBus.showSelection(if (type == null) "已显示全部 AI 资源" else "资源类型：$label")
                            }
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
                    items(sorts, key = { "sort-$it" }) { sort -> SortTab(sort, filter.sort == sort) {
                        viewModel.selectSort(sort)
                        HeikaNoticeBus.showSelection("排序：$sort")
                    } }
                }
            }
        }
        if (seriesActive) {
            SeriesChannelPane(
                onOpenSeries = onOpenSeries,
                onLogin = onLogin,
                modifier = Modifier.weight(1f).fillMaxWidth(),
            )
            return@Column
        }
        val gridState = if (filter.channel == "community") communityGrid else aiGrid
        PullToRefreshBox(
            isRefreshing = posts.itemCount > 0 && posts.loadState.refresh is LoadState.Loading,
            onRefresh = { posts.refresh(); adViewModel.refresh() },
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
                ad = if (filter.channel == "community") adState.ad else null,
                adUnavailable = filter.channel == "community" && adState.unavailable,
                aiEntry = if (filter.channel == "ai") {
                    {
                        Column {
                            AiHotSections(onOpenPost = onOpenPostById, onOpenSeries = onOpenSeries)
                            AiResourceSpaceEntry(hazeState = badgeHazeState, onClick = onAiResources)
                        }
                    }
                } else null,
            )
        }
    }
}

/**
 * 探索 AI 资源入口：一张紧凑的横向功能卡（左图标 / 中间两行文案 / 右箭头），
 * 不再单独铺一排六个图标，也不做金色高亮。它随信息流滚动，不固定吸顶。
 */
@Composable
private fun AiResourceSpaceEntry(hazeState: HazeState, onClick: () -> Unit) {
    // 紧凑功能入口：去掉双层背景与模糊，只用弱底色 + 细边框；
    // 左右不再额外内缩，和下方内容卡共用 FeedGrid 的 18dp 边距。
    val shape = RoundedCornerShape(HeikaRadii.control)
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .38f))
            .border(.6.dp, MaterialTheme.colorScheme.outline.copy(alpha = .24f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier.size(28.dp).clip(RoundedCornerShape(9.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .72f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(HeikaIcons.BrainCircuit, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("探索 AI 资源", color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text("Agent · Skills · Prompt", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(HeikaIcons.ArrowUpRight, contentDescription = "进入 AI 资源中心", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
    }
}

@Composable
private fun ChannelOption(label: String, selected: Boolean, compact: Boolean = false, leadingIcon: androidx.compose.ui.graphics.vector.ImageVector? = null, goldAccent: Boolean = false, onClick: () -> Unit) {
    val motion = LocalHeikaMotion.current
    val animSpec = tween<Color>(
        HeikaMotion.scaled(HeikaMotion.quick, motion.mode, motion.speed),
        easing = HeikaMotion.openEasing,
    )
    val accent = if (goldAccent) com.heika.nativeapp.ui.HeikaPalette.Gold else MaterialTheme.colorScheme.primary
    val color by animateColorAsState(
        if (selected) accent else MaterialTheme.colorScheme.onSurfaceVariant,
        animSpec, label = "discover-channel-color-$label",
    )
    // 选中只用轻量暖灰；AI 频道附一点品牌金，不铺满整条顶栏。普通频道不再描边。
    val selectedBg = if (goldAccent) accent.copy(alpha = .14f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .86f)
    val background by animateColorAsState(
        if (selected) selectedBg else Color.Transparent,
        animSpec, label = "discover-channel-bg-$label",
    )
    Row(
        Modifier.widthIn(min = if (compact) (if (leadingIcon != null) 54.dp else 46.dp) else 62.dp)
            .height(32.dp)
            .clip(RoundedCornerShape(50))
            .background(background)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leadingIcon != null) {
            Icon(leadingIcon, contentDescription = null, tint = color, modifier = Modifier.size(11.dp))
            Spacer(Modifier.width(2.dp))
        }
        Text(
            label,
            color = color,
            fontSize = 10.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
        )
    }
}

/**
 * 分类选中态：轻量圆角矩形底色 + 字重变化，普通分类不再独立描边。
 * 高度/字号/间距与主频道胶囊对齐，小屏横向滚动时不缩小字号。
 */
@Composable
private fun CategoryTab(label: String, selected: Boolean, onClick: () -> Unit) {
    val motion = LocalHeikaMotion.current
    val animSpec = tween<Color>(
        HeikaMotion.scaled(HeikaMotion.quick, motion.mode, motion.speed),
        easing = HeikaMotion.openEasing,
    )
    val color by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant,
        animSpec, label = "discover-category-color-$label",
    )
    val background by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .68f) else Color.Transparent,
        animSpec, label = "discover-category-bg-$label",
    )
    Box(
        Modifier.height(32.dp).clip(RoundedCornerShape(HeikaRadii.chip))
            .background(background)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = color,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
        )
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
private fun DiscoveryAdCard(ad: DiscoveryAd, onClick: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    val imagePainter = ad.imageUrl?.takeIf { ad.kind == "image" }?.let { image ->
        rememberAsyncImagePainter(
            model = ImageRequest.Builder(LocalContext.current).data(image).crossfade(true).build(),
            imageLoader = LocalHeikaImageLoader.current,
        )
    }
    val imageState = imagePainter?.state?.collectAsStateWithLifecycle()?.value
    Row(
        Modifier.fillMaxWidth()
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface)
            .border(.8.dp, MaterialTheme.colorScheme.primary.copy(alpha = .30f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(HeikaIcons.Megaphone, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                Text("黑卡 · 推荐", color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.1.sp)
            }
            Text(ad.title, color = MaterialTheme.colorScheme.onSurface, fontSize = 20.sp, lineHeight = 27.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (ad.body.isNotBlank()) Text(ad.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 21.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (imageState is AsyncImagePainter.State.Success) {
            Image(
                painter = imagePainter,
                contentDescription = "广告：${ad.title}",
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(width = 76.dp, height = 76.dp).clip(RoundedCornerShape(10.dp)),
            )
        }
        Icon(HeikaIcons.Forward, contentDescription = "打开推荐作品", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
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
    ad: DiscoveryAd? = null,
    adUnavailable: Boolean = false,
    aiEntry: (@Composable () -> Unit)? = null,
) {
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(columns.coerceIn(1, 2)),
        state = state,
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 9.dp, bottom = 128.dp),
        horizontalArrangement = Arrangement.spacedBy(13.dp),
        verticalItemSpacing = 18.dp,
    ) {
        // 「探索 AI 资源」是内容流的普通首项：随正文滚出视野，只有回到顶部才会再次出现，
        // 不做滚动方向判断的强制显隐。
        if (aiEntry != null) item(key = "ai-resource-entry", span = StaggeredGridItemSpan.FullLine) {
            aiEntry()
        }
        if (ad != null) item(key = "discovery-ad", span = StaggeredGridItemSpan.FullLine) {
            DiscoveryAdCard(ad, onClick = { onPost(ad.post) })
        }
        if (ad == null && adUnavailable) item(key = "discovery-ad-unavailable", span = StaggeredGridItemSpan.FullLine) {
            Text("广告暂时无法加载", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
        }
        items(count = posts.itemCount, key = posts.itemKey { it.cloudId }) { index ->
            val post = posts[index] ?: return@items
            FeedCard(post, onClick = { onPost(post) }, hazeState = hazeState, sharedTransitionScope = sharedTransitionScope, animatedVisibilityScope = animatedVisibilityScope, sharedElementsEnabled = sharedElementsEnabled)
        }
        when {
            posts.loadState.refresh is LoadState.Loading && posts.itemCount == 0 -> item(span = StaggeredGridItemSpan.FullLine) {
                HeikaPulseFeed(Modifier.fillMaxWidth().padding(horizontal = 18.dp), cards = 3, cardHeight = 150.dp)
            }
            posts.loadState.refresh is LoadState.Error && posts.itemCount == 0 -> item(span = StaggeredGridItemSpan.FullLine) {
                EmptyFeed(message = (posts.loadState.refresh as LoadState.Error).error.message ?: "内容暂时无法加载", onRetry = posts::retry)
            }
            posts.loadState.append is LoadState.Loading -> item(span = StaggeredGridItemSpan.FullLine) {
                HeikaPulseRow(Modifier.padding(horizontal = 18.dp, vertical = 8.dp), height = 56.dp)
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
    val photoShadow = heikaPhotoTextShadow()
    // 标题共享已撤掉（卡面 15sp 与详情 22sp 差距太大，中途字号会跳），
    // 改由标签、评分、作者名做等比共享。
    val metaSharedReady = sharedElementsEnabled && sharedTransitionScope != null && animatedVisibilityScope != null
    val tagSharedModifier = if (metaSharedReady) with(sharedTransitionScope!!) {
        Modifier.heikaSharedPostMeta(this, animatedVisibilityScope!!, post.sharedTagKey())
    } else Modifier
    val ratingSharedModifier = if (metaSharedReady) with(sharedTransitionScope!!) {
        Modifier.heikaSharedPostMeta(this, animatedVisibilityScope!!, post.sharedRatingKey())
    } else Modifier
    val authorSharedModifier = if (metaSharedReady) with(sharedTransitionScope!!) {
        Modifier.heikaSharedPostMeta(this, animatedVisibilityScope!!, post.sharedAuthorKey())
    } else Modifier
    val cardShape = RoundedCornerShape(HeikaRadii.feedCard)
    Column(
        modifier.fillMaxWidth()
            .clip(cardShape)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .55f), cardShape),
    ) {
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
                Modifier.fillMaxWidth().clickable(onClick = onClick)
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
                        onState = { state ->
                            imageFailed = state is AsyncImagePainter.State.Error
                            if (state is AsyncImagePainter.State.Success) {
                                val size = state.painter.intrinsicSize
                                HeikaImageRatioCache.remember(post.cloudId, size.width, size.height)
                            }
                        },
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
                HeikaSolidBadgeSurface(
                    hazeState = hazeState,
                    modifier = Modifier.align(Alignment.TopStart).padding(6.dp),
                    shape = RoundedCornerShape(HeikaRadii.categoryTag),
                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.5.dp),
                ) {
                    Text(post.tag, tagSharedModifier, color = MaterialTheme.colorScheme.onSurface, fontSize = 9.sp, lineHeight = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                RatingTag(post, Modifier.align(Alignment.TopEnd).padding(6.dp), hazeState = hazeState, contentColor = MaterialTheme.colorScheme.onSurface, contentModifier = ratingSharedModifier)
                Text(post.title, Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(horizontal = 12.dp, vertical = 13.dp), style = androidx.compose.ui.text.TextStyle(shadow = photoShadow), color = Color.White, fontSize = 15.sp * titleScale, lineHeight = 20.sp * titleScale, fontWeight = FontWeight.SemiBold, maxLines = 3, overflow = TextOverflow.Ellipsis)
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
                Modifier.fillMaxWidth().clickable(onClick = onClick)
                    .then(sharedCardModifier).padding(horizontal = 13.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(post.tag, tagSharedModifier, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.weight(1f))
                    RatingTag(post, hazeState = hazeState, contentColor = MaterialTheme.colorScheme.onSurface, contentModifier = ratingSharedModifier)
                }
                Text(post.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp * titleScale, lineHeight = 20.sp * titleScale, fontWeight = FontWeight.SemiBold, maxLines = 4, overflow = TextOverflow.Ellipsis)
                Text(post.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp, maxLines = 5, overflow = TextOverflow.Ellipsis)
            }
        }
        // 底部操作区：左侧作者与认证标识，右侧点赞与分享，两列卡片统一规则。
        Row(
            Modifier.fillMaxWidth().padding(start = 11.dp, end = 8.dp, top = 7.dp, bottom = 7.dp).heightIn(min = 38.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(post.author, Modifier.then(authorSharedModifier), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                post.authorBadges.take(3).forEach { badge ->
                    val badgeTint = runCatching { Color(android.graphics.Color.parseColor(badge.color)) }.getOrDefault(MaterialTheme.colorScheme.primary)
                    Icon(HeikaIcons.Shield, contentDescription = "${badge.label}认证", tint = badgeTint, modifier = Modifier.size(13.dp))
                }
            }
            Icon(HeikaIcons.LikeOutline, contentDescription = "赞", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            Text("${post.likeCount}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            val shareContext = LocalContext.current
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).clickable {
                    val url = if (post.channel == "ai") "https://moonclean.shop/?aiPost=${post.id}&cloudId=${android.net.Uri.encode(post.cloudId)}" else "https://moonclean.shop/?post=${post.id}"
                    val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(android.content.Intent.EXTRA_TEXT, "${post.title}\n$url")
                    }
                    shareContext.startActivity(android.content.Intent.createChooser(intent, "分享内容"))
                },
                contentAlignment = Alignment.Center,
            ) {
                Icon(HeikaIcons.Share, contentDescription = "分享", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
private fun RatingTag(
    post: HeikaPost,
    modifier: Modifier = Modifier,
    hazeState: HazeState? = null,
    contentColor: Color = Color.White,
    contentModifier: Modifier = Modifier,
) {
    HeikaSolidBadgeSurface(
        hazeState = hazeState,
        modifier = modifier,
        shape = RoundedCornerShape(HeikaRadii.ratingTag),
        contentPadding = PaddingValues(horizontal = 5.dp, vertical = 2.5.dp),
    ) {
        Row(contentModifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            Icon(HeikaIcons.StarOutline, contentDescription = null, tint = HeikaGold, modifier = Modifier.size(10.dp))
            Text(if (post.hasRating) String.format(Locale.US, "%.1f", post.ratingAverage) else "待评级", color = contentColor, fontSize = 9.sp, lineHeight = 12.sp, fontWeight = FontWeight.Medium)
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
