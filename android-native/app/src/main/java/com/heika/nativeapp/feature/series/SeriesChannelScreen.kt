package com.heika.nativeapp.feature.series

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.heika.nativeapp.data.HeikaSeriesCard
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaPulseBlock
import com.heika.nativeapp.ui.HeikaPulseLine
import com.heika.nativeapp.ui.HeikaRadii

private val SORTS = listOf("recommended" to "推荐", "hot" to "热门", "updated" to "更新", "new" to "最新", "follows" to "收藏")

/**
 * 合集频道：分类 → 本周精选 → 继续阅读（无记录隐藏）→ 近期热门 → 最近更新 → 为你推荐 → 全部合集。
 * 每个分区只在有真实数据时渲染，数量不足时整块消失，不做占位假卡片。
 */
@Composable
fun SeriesChannelPane(
    onOpenSeries: (String) -> Unit,
    onLogin: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SeriesChannelViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val data = state.data

    if (state.loading && data == null) {
        SeriesChannelSkeleton(modifier)
        return
    }
    if (state.error != null && data == null) {
        SeriesChannelError(state.error ?: "合集加载失败", onRetry = viewModel::refresh, modifier = modifier)
        return
    }

    LazyColumn(
        modifier.fillMaxSize(),
        state = listState,
        contentPadding = PaddingValues(bottom = 120.dp),
    ) {
        if (data == null) return@LazyColumn

        if (data.categories.size > 1) {
            item(key = "categories") {
                LazyRow(
                    Modifier.fillMaxWidth().padding(top = 6.dp),
                    contentPadding = PaddingValues(horizontal = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    item(key = "all") {
                        SeriesChip("全部", state.category == null) { viewModel.selectCategory(null) }
                    }
                    items(data.categories, key = { "cat-${it.first}" }) { (id, name) ->
                        SeriesChip(name, state.category == id) { viewModel.selectCategory(if (state.category == id) null else id) }
                    }
                }
            }
        }

        if (data.featured.isNotEmpty()) {
            item(key = "featured") {
                Column(Modifier.padding(top = 20.dp)) {
                    SeriesSectionHead(
                        kicker = if (data.featuredSource == "editorial") "编辑精选" else "值得从头读",
                        title = "本周精选",
                        trailing = "${data.featured.size} 个合集",
                    )
                    val lead = data.featured.first()
                    val rest = data.featured.drop(1).take(3)
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 18.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        FeaturedSeriesCard(lead, Modifier.weight(1.35f)) { onOpenSeries(lead.id) }
                        if (rest.isNotEmpty()) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                rest.forEach { card ->
                                    MiniSeriesRow(card) { onOpenSeries(card.id) }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (data.continueReading.isNotEmpty()) {
            item(key = "continue") {
                Column(Modifier.padding(top = 22.dp)) {
                    SeriesSectionHead(kicker = "接着上次", title = "继续阅读", trailing = "${data.continueReading.size} 个合集")
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 18.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(data.continueReading, key = { "continue-${it.id}" }) { card ->
                            ContinueSeriesCard(card) { onOpenSeries(card.id) }
                        }
                    }
                }
            }
        }

        if (data.trending.isNotEmpty()) {
            item(key = "trending") {
                Column(Modifier.padding(top = 22.dp)) {
                    SeriesSectionHead(kicker = "近 72 小时互动", title = "近期热门", trailing = "按点赞 · 收藏 · 阅读")
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 18.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(data.trending, key = { "trend-${it.id}" }) { card ->
                            TrendingSeriesCard(card) { onOpenSeries(card.id) }
                        }
                    }
                }
            }
        }

        if (data.updated.isNotEmpty()) {
            item(key = "updated") {
                Column(Modifier.padding(top = 22.dp)) {
                    SeriesSectionHead(kicker = "刚更新", title = "最近更新", trailing = null)
                    Column(Modifier.padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        data.updated.take(6).forEach { card ->
                            UpdatedSeriesRow(card) { onOpenSeries(card.id) }
                        }
                    }
                }
            }
        }

        if (data.recommended.isNotEmpty()) {
            item(key = "recommended") {
                Column(Modifier.padding(top = 22.dp)) {
                    SeriesSectionHead(
                        kicker = if (data.recommendedColdStart) "先看看大家都在读" else "按你的收藏与阅读",
                        title = "为你推荐",
                        trailing = null,
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 18.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(data.recommended, key = { "rec-${it.id}" }) { card ->
                            RecommendSeriesCard(card) { onOpenSeries(card.id) }
                        }
                    }
                }
            }
        }

        item(key = "all-head") {
            Column(Modifier.padding(top = 26.dp)) {
                SeriesSectionHead(kicker = "按标签读下去", title = "全部合集", trailing = "${data.total} 个")
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    items(SORTS, key = { "sort-${it.first}" }) { (key, label) ->
                        SeriesChip(label, state.sort == key) { viewModel.selectSort(key) }
                    }
                }
                Spacer(Modifier.height(10.dp))
            }
        }

        if (data.all.isEmpty()) {
            item(key = "empty") {
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 34.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(HeikaIcons.List, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .6f), modifier = Modifier.size(26.dp))
                    Text(
                        if (state.category != null) "这个分类下暂时没有合集" else "还没有公开的合集",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                    Text("合集由作者把相关作品收在一起，按顺序读下去。", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .7f), fontSize = 10.sp, textAlign = TextAlign.Center)
                }
            }
        } else {
            items(data.all.chunked(2), key = { "row-${it.first().id}" }) { row ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 18.dp).padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    row.forEach { card ->
                        SeriesGridCard(card, Modifier.weight(1f)) { onOpenSeries(card.id) }
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
            if (data.hasMore) {
                item(key = "more") {
                    Box(
                        Modifier.fillMaxWidth().padding(horizontal = 18.dp).padding(top = 4.dp)
                            .clip(RoundedCornerShape(HeikaRadii.chip))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .38f))
                            .clickable(enabled = !state.appending) { viewModel.loadMore() }
                            .padding(vertical = 11.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (state.appending) CircularProgressIndicator(Modifier.size(15.dp), strokeWidth = 1.6.dp)
                        else Text("加载更多", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

/* --------------------------------- 组件 --------------------------------- */

@Composable
private fun SeriesSectionHead(kicker: String, title: String, trailing: String?) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 18.dp).padding(bottom = 10.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(Modifier.weight(1f)) {
            Text(kicker, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 9.sp, letterSpacing = 1.sp)
            Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        }
        if (trailing != null) Text(trailing, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 9.sp)
    }
}

@Composable
private fun SeriesChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val accent = MaterialTheme.colorScheme.primary
    Text(
        label,
        Modifier.clip(RoundedCornerShape(50))
            .background(if (selected) accent.copy(alpha = .14f) else Color.Transparent)
            .border(.8.dp, if (selected) accent.copy(alpha = .55f) else MaterialTheme.colorScheme.outline.copy(alpha = .45f), RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        color = if (selected) accent else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 10.5.sp,
        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
    )
}

/** 封面：真实封面优先，缺图时用类型 + 标题的排版封面，不做灰色空块。 */
@Composable
private fun SeriesCover(card: HeikaSeriesCard, modifier: Modifier = Modifier, compact: Boolean = false) {
    val context = LocalContext.current
    var failed by remember(card.id) { mutableStateOf(false) }
    Box(modifier.clip(RoundedCornerShape(if (compact) 6.dp else 9.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
        val cover = card.coverUrl
        if (cover != null && !failed) {
            val request = remember(context, cover) { ImageRequest.Builder(context).data(cover).crossfade(true).build() }
            AsyncImage(
                model = request,
                contentDescription = "${card.title}封面",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                onError = { failed = true },
            )
        } else {
            Box(
                Modifier.fillMaxSize().background(
                    Brush.linearGradient(
                        listOf(
                            MaterialTheme.colorScheme.primary.copy(alpha = .2f),
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f),
                        ),
                    ),
                ),
            ) {
                Column(
                    Modifier.fillMaxSize().padding(if (compact) 6.dp else 9.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(card.kindLabel, color = MaterialTheme.colorScheme.primary, fontSize = if (compact) 7.sp else 8.sp, letterSpacing = 1.sp)
                    Text(
                        card.title,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = if (compact) 9.sp else 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        lineHeight = if (compact) 11.sp else 14.sp,
                        maxLines = if (compact) 3 else 4,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun FeaturedSeriesCard(card: HeikaSeriesCard, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(HeikaRadii.collectionCard))
            .background(MaterialTheme.colorScheme.surface)
            .border(.8.dp, MaterialTheme.colorScheme.outline.copy(alpha = .4f), RoundedCornerShape(HeikaRadii.collectionCard))
            .clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SeriesCover(card, Modifier.width(74.dp).aspectRatio(.75f))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        card.kindLabel,
                        Modifier.clip(RoundedCornerShape(4.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = .12f)).padding(horizontal = 4.dp, vertical = 1.dp),
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 8.sp,
                    )
                    Text("${card.chapters} 篇", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 8.sp)
                }
                Text(card.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, lineHeight = 18.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    card.description.ifBlank { "把相关作品收在一起，按顺序读下去。" },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 9.5.sp,
                    lineHeight = 13.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text("${card.authorName} · ${card.followCount} 人收藏", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .75f), fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 10.dp).padding(bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("查看合集", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Icon(HeikaIcons.Forward, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(13.dp))
        }
    }
}

@Composable
private fun MiniSeriesRow(card: HeikaSeriesCard, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.chip))
            .background(MaterialTheme.colorScheme.surface)
            .border(.7.dp, MaterialTheme.colorScheme.outline.copy(alpha = .35f), RoundedCornerShape(HeikaRadii.chip))
            .clickable(onClick = onClick)
            .padding(7.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SeriesCover(card, Modifier.width(36.dp).aspectRatio(.75f), compact = true)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(card.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, maxLines = 2, lineHeight = 13.sp, overflow = TextOverflow.Ellipsis)
            Text("${card.chapters} 篇 · ${card.followCount} 收藏", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ContinueSeriesCard(card: HeikaSeriesCard, onClick: () -> Unit) {
    Row(
        Modifier.widthIn(max = 260.dp).clip(RoundedCornerShape(HeikaRadii.chip))
            .background(MaterialTheme.colorScheme.surface)
            .border(.7.dp, MaterialTheme.colorScheme.outline.copy(alpha = .35f), RoundedCornerShape(HeikaRadii.chip))
            .clickable(onClick = onClick)
            .padding(9.dp),
        horizontalArrangement = Arrangement.spacedBy(9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SeriesCover(card, Modifier.width(42.dp).aspectRatio(.75f), compact = true)
        Column(Modifier.widthIn(max = 170.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(card.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("已读 ${card.readCount}/${card.chapters} 章", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 8.5.sp)
            Box(Modifier.fillMaxWidth().height(2.5.dp).clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                Box(Modifier.fillMaxWidth((card.progressPercent / 100f).coerceIn(0f, 1f)).height(2.5.dp).clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary))
            }
        }
    }
}

@Composable
private fun TrendingSeriesCard(card: HeikaSeriesCard, onClick: () -> Unit) {
    Column(Modifier.width(112.dp).clickable(onClick = onClick), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Box {
            SeriesCover(card, Modifier.fillMaxWidth().aspectRatio(.75f))
            Text(
                "${card.rank}".padStart(2, '0'),
                Modifier.padding(6.dp).clip(RoundedCornerShape(5.dp))
                    .background(if (card.rank <= 3) MaterialTheme.colorScheme.primary else Color.Black.copy(alpha = .45f))
                    .padding(horizontal = 5.dp, vertical = 1.dp),
                color = if (card.rank <= 3) MaterialTheme.colorScheme.surface else Color.White,
                fontSize = 8.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Text(card.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, maxLines = 2, lineHeight = 13.sp, overflow = TextOverflow.Ellipsis)
        Text("${card.chapters} 篇 · ${card.authorName}", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun UpdatedSeriesRow(card: HeikaSeriesCard, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.chip)).clickable(onClick = onClick).padding(vertical = 6.dp, horizontal = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SeriesCover(card, Modifier.width(30.dp).aspectRatio(.75f), compact = true)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(card.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${card.kindLabel} · ${card.chapters} 篇 · ${card.authorName}", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 8.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(timeAgo(card.updatedAt), color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .7f), fontSize = 8.sp)
    }
}

@Composable
private fun RecommendSeriesCard(card: HeikaSeriesCard, onClick: () -> Unit) {
    Column(Modifier.width(126.dp).clickable(onClick = onClick), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        SeriesCover(card, Modifier.fillMaxWidth().aspectRatio(.75f))
        Text(card.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(card.reason ?: "${card.kindLabel} · ${card.chapters} 篇", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun SeriesGridCard(card: HeikaSeriesCard, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(modifier.clip(RoundedCornerShape(HeikaRadii.collectionCard)).clickable(onClick = onClick), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        SeriesCover(card, Modifier.fillMaxWidth().aspectRatio(.75f))
        Text(card.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("${card.kindLabel} · ${card.chapters} 篇 · ${card.authorName}", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 8.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(timeAgo(card.updatedAt), color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .65f), fontSize = 8.sp)
    }
}

@Composable
private fun SeriesChannelSkeleton(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            repeat(4) { HeikaPulseBlock(Modifier.width(56.dp).height(26.dp), RoundedCornerShape(50)) }
        }
        HeikaPulseLine(height = 16.dp, widthFraction = .4f)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            HeikaPulseBlock(Modifier.weight(1.35f).height(150.dp), RoundedCornerShape(HeikaRadii.collectionCard))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(3) { HeikaPulseBlock(Modifier.fillMaxWidth().height(44.dp), RoundedCornerShape(9.dp)) }
            }
        }
        HeikaPulseLine(height = 14.dp, widthFraction = .3f)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            repeat(3) { HeikaPulseBlock(Modifier.width(112.dp).aspectRatio(.75f), RoundedCornerShape(9.dp)) }
        }
    }
}

@Composable
private fun SeriesChannelError(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(HeikaIcons.List, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .55f), modifier = Modifier.size(30.dp))
        Spacer(Modifier.height(10.dp))
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(12.dp))
        Text(
            "重试",
            Modifier.clip(RoundedCornerShape(50))
                .border(.8.dp, MaterialTheme.colorScheme.outline.copy(alpha = .6f), RoundedCornerShape(50))
                .clickable(onClick = onRetry)
                .padding(horizontal = 16.dp, vertical = 7.dp),
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 11.sp,
        )
    }
}

private fun timeAgo(iso: String): String {
    val time = runCatching { java.time.Instant.parse(iso) }.getOrNull() ?: return ""
    val hours = java.time.Duration.between(time, java.time.Instant.now()).toHours()
    return when {
        hours < 1 -> "刚刚更新"
        hours < 24 -> "${hours} 小时前更新"
        hours < 24 * 30 -> "${hours / 24} 天前更新"
        else -> "${hours / (24 * 30)} 个月前更新"
    }
}
