package com.heika.nativeapp.feature.discovery

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.heika.nativeapp.data.HeikaRankItem
import com.heika.nativeapp.data.HeikaRelatedPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.HeikaSeriesCard
import com.heika.nativeapp.ui.HeikaCoroutineGuard
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaPulseBlock
import com.heika.nativeapp.ui.HeikaRadii
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AiHotState(
    val hot: List<HeikaRankItem> = emptyList(),
    val series: List<HeikaSeriesCard> = emptyList(),
    val picks: List<HeikaRelatedPost> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
)

/** AI 专区顶部三块：近期热门榜、热门 AI 合集、为你推荐。全部走真实接口，空数据就不渲染。 */
@HiltViewModel
class AiHotViewModel @Inject constructor(private val repository: HeikaRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(AiHotState())
    val state = mutableState.asStateFlow()

    init { load() }

    fun load() = viewModelScope.launch(HeikaCoroutineGuard) {
        mutableState.update { it.copy(loading = true, error = null) }
        runCatching {
            val hot = async { runCatching { repository.rankings("ai")["ai"].orEmpty() }.getOrDefault(emptyList()) }
            val series = async { runCatching { repository.seriesDiscover(channel = "ai", limit = 8).all }.getOrDefault(emptyList()) }
            val picks = async { runCatching { repository.recommendationPosts("ai", 8) }.getOrDefault(emptyList()) }
            Triple(hot.await(), series.await(), picks.await())
        }.onSuccess { (hot, series, picks) ->
            mutableState.value = AiHotState(hot = hot.take(6), series = series.take(6), picks = picks.take(6), loading = false)
        }.onFailure { error ->
            mutableState.update { it.copy(loading = false, error = error.message ?: "AI 热榜暂不可用") }
        }
    }
}

@Composable
fun AiHotSections(
    onOpenPost: (String) -> Unit,
    onOpenSeries: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AiHotViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    if (state.loading) {
        Column(modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            HeikaPulseBlock(Modifier.fillMaxWidth(.34f).height(14.dp), RoundedCornerShape(5.dp))
            repeat(3) { HeikaPulseBlock(Modifier.fillMaxWidth().height(44.dp), RoundedCornerShape(HeikaRadii.chip)) }
        }
        return
    }
    if (state.hot.isEmpty() && state.series.isEmpty() && state.picks.isEmpty()) return

    Column(modifier.fillMaxWidth().padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        if (state.hot.isNotEmpty()) {
            Column {
                BlockHead(kicker = "近 72 小时互动", title = "近期热门", trailing = null)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    state.hot.forEach { item ->
                        HotRankRow(item) {
                            if (item.type == "series") onOpenSeries(item.id) else onOpenPost(item.id)
                        }
                    }
                }
            }
        }
        if (state.series.isNotEmpty()) {
            Column {
                BlockHead(kicker = "按合集读", title = "热门 AI 合集", trailing = "${state.series.size} 个")
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 0.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(state.series, key = { "ai-series-${it.id}" }) { card ->
                        AiSeriesCard(card) { onOpenSeries(card.id) }
                    }
                }
            }
        }
        if (state.picks.isNotEmpty()) {
            Column {
                BlockHead(kicker = "按你的收藏与阅读", title = "为你推荐", trailing = null)
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 0.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(state.picks, key = { "ai-pick-${it.id}" }) { post ->
                        AiPickCard(post) { onOpenPost(post.id) }
                    }
                }
            }
        }
    }
}

@Composable
private fun BlockHead(kicker: String, title: String, trailing: String?) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 8.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(Modifier.weight(1f)) {
            Text(kicker, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 9.sp, letterSpacing = 1.sp)
            Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        }
        if (trailing != null) Text(trailing, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 9.sp)
    }
}

@Composable
private fun HotRankRow(item: HeikaRankItem, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.chip))
            .background(MaterialTheme.colorScheme.surface)
            .border(.7.dp, MaterialTheme.colorScheme.outline.copy(alpha = .32f), RoundedCornerShape(HeikaRadii.chip))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Text(
            "${item.rank}".padStart(2, '0'),
            Modifier.width(20.dp),
            color = if (item.rank <= 3) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .6f),
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(item.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                buildString {
                    append(if (item.type == "series") "合集" else (item.tag ?: "AI 资源"))
                    item.author?.let { append(" · $it") }
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .78f),
                fontSize = 8.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            if (item.type == "series") "合集" else "AI",
            Modifier.clip(RoundedCornerShape(4.dp))
                .background(MaterialTheme.colorScheme.primary.copy(alpha = .1f))
                .padding(horizontal = 4.dp, vertical = 1.dp),
            color = MaterialTheme.colorScheme.primary,
            fontSize = 7.5.sp,
        )
    }
}

@Composable
private fun AiSeriesCard(card: HeikaSeriesCard, onClick: () -> Unit) {
    Column(Modifier.width(104.dp).clickable(onClick = onClick), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(.75f).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
            val cover = card.coverUrl
            if (cover != null) {
                val context = LocalContext.current
                var failed by remember(card.id) { mutableStateOf(false) }
                if (!failed) {
                    val request = remember(context, cover) { ImageRequest.Builder(context).data(cover).crossfade(true).build() }
                    AsyncImage(
                        model = request,
                        contentDescription = "${card.title}封面",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                        onError = { failed = true },
                    )
                } else {
                    CoverText(card)
                }
            } else {
                CoverText(card)
            }
        }
        Text(card.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 10.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("${card.chapters} 篇 · ${card.followCount} 收藏", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun CoverText(card: HeikaSeriesCard) {
    Box(
        Modifier.fillMaxSize().background(
            Brush.linearGradient(
                listOf(
                    MaterialTheme.colorScheme.primary.copy(alpha = .18f),
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .5f),
                ),
            ),
        ),
    ) {
        Column(Modifier.fillMaxSize().padding(7.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Text(card.kindLabel, color = MaterialTheme.colorScheme.primary, fontSize = 7.sp, letterSpacing = 1.sp)
            Text(card.title, color = MaterialTheme.colorScheme.onSurface, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, lineHeight = 11.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun AiPickCard(post: HeikaRelatedPost, onClick: () -> Unit) {
    Row(
        Modifier.width(232.dp).clip(RoundedCornerShape(HeikaRadii.chip))
            .background(MaterialTheme.colorScheme.surface)
            .border(.7.dp, MaterialTheme.colorScheme.outline.copy(alpha = .3f), RoundedCornerShape(HeikaRadii.chip))
            .clickable(onClick = onClick)
            .padding(9.dp),
        horizontalArrangement = Arrangement.spacedBy(9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(44.dp).height(44.dp).clip(RoundedCornerShape(7.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
            val cover = post.cover
            if (cover != null) {
                val context = LocalContext.current
                val request = remember(context, cover) { ImageRequest.Builder(context).data(cover).crossfade(true).build() }
                AsyncImage(model = request, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Icon(HeikaIcons.Sparkles, contentDescription = null, tint = MaterialTheme.colorScheme.primary.copy(alpha = .7f), modifier = Modifier.size(16.dp).align(Alignment.Center))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(post.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, maxLines = 2, lineHeight = 13.sp, overflow = TextOverflow.Ellipsis)
            Text(
                buildString {
                    append(post.tag ?: "AI 资源")
                    post.author?.let { append(" · $it") }
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .78f),
                fontSize = 8.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
