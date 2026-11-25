package com.heika.nativeapp.feature.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.heika.nativeapp.data.HeikaRelated
import com.heika.nativeapp.data.HeikaRelatedPost
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaRadii

/**
 * 正文之后、评论区之前的关联内容：
 * 所属合集的上一章/下一章、同主题、作者其他、AI 资源、话题。
 * 只渲染服务端真实返回的分组，某一组为空时整组消失。
 */
@Composable
fun RelatedBlocks(
    related: HeikaRelated,
    onOpenPost: (String) -> Unit,
    onOpenSeries: (String) -> Unit,
    onOpenTopic: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val series = related.series
    val groups = listOf(
        Triple("同主题", related.sameTag, "同主题作品"),
        Triple("作者其他", related.authorPosts, "作者的其它作品"),
        Triple("AI 资源", related.aiResources, "相关 AI 资源"),
    ).filter { it.second.isNotEmpty() }
    if (series == null && groups.isEmpty() && related.topics.isEmpty()) return

    Column(modifier.fillMaxWidth().padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (series != null && (series.prevId != null || series.nextId != null)) {
            Column {
                BlockTitle("继续读这个合集", null)
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    if (series.prevId != null) {
                        NavCard("上一篇", series.prevTitle ?: "上一章", Modifier.weight(1f)) { onOpenPost(series.prevId) }
                    }
                    if (series.nextId != null) {
                        NavCard("下一篇", series.nextTitle ?: "下一章", Modifier.weight(1f)) { onOpenPost(series.nextId) }
                    }
                }
                Text(
                    "合集《${series.title}》第 ${series.position}/${series.chapters} 篇",
                    Modifier.padding(horizontal = 18.dp, vertical = 6.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .75f),
                    fontSize = 9.sp,
                )
            }
        }
        groups.forEach { (title, posts, label) ->
            Column {
                BlockTitle(title, "${posts.size} 篇")
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    items(posts, key = { "$title-${it.id}" }) { post ->
                        RelatedCard(post, label) { onOpenPost(post.id) }
                    }
                }
            }
        }
        if (related.topics.isNotEmpty()) {
            Column {
                BlockTitle("相关话题", null)
                LazyRow(
                    Modifier.fillMaxWidth().padding(horizontal = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    items(related.topics, key = { "topic-${it.first}" }) { (_, name) ->
                        Text(
                            "#$name",
                            Modifier.clip(RoundedCornerShape(50))
                                .border(.8.dp, MaterialTheme.colorScheme.outline.copy(alpha = .45f), RoundedCornerShape(50))
                                .clickable { onOpenTopic(name) }
                                .padding(horizontal = 11.dp, vertical = 5.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 10.sp,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BlockTitle(title: String, trailing: String?) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 18.dp).padding(bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        if (trailing != null) Text(trailing, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .75f), fontSize = 9.sp)
    }
}

@Composable
private fun NavCard(kicker: String, title: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(HeikaRadii.chip))
            .background(MaterialTheme.colorScheme.surface)
            .border(.7.dp, MaterialTheme.colorScheme.outline.copy(alpha = .35f), RoundedCornerShape(HeikaRadii.chip))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(kicker, color = MaterialTheme.colorScheme.primary, fontSize = 8.5.sp)
        Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun RelatedCard(post: HeikaRelatedPost, label: String, onClick: () -> Unit) {
    Column(Modifier.width(132.dp).clickable(onClick = onClick), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(
            Modifier.fillMaxWidth().height(76.dp).clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            val cover = post.cover
            if (cover != null) {
                val context = LocalContext.current
                val request = androidx.compose.runtime.remember(context, cover) {
                    ImageRequest.Builder(context).data(cover).crossfade(true).build()
                }
                AsyncImage(model = request, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().height(76.dp))
            } else {
                Box(
                    Modifier.fillMaxWidth().height(76.dp).background(
                        Brush.linearGradient(
                            listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = .16f),
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .5f),
                            ),
                        ),
                    ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(HeikaIcons.List, contentDescription = null, tint = MaterialTheme.colorScheme.primary.copy(alpha = .6f), modifier = Modifier.size(16.dp))
                }
            }
        }
        Text(post.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, maxLines = 2, lineHeight = 13.sp, overflow = TextOverflow.Ellipsis)
        Text(
            post.tag ?: label,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .75f),
            fontSize = 8.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
