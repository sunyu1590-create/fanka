package com.heika.nativeapp.feature.collection

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heika.nativeapp.data.HeikaCollection
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.HeikaNoticeKind
import com.heika.nativeapp.ui.HeikaPulseRow

/**
 * 作者主页的合集区：横向卡片列出作者的连载 / 教程 / 资源合集，作者本人还多一个新建入口。
 * 只做入口，不重复详情页的目录与进度。
 */
@Composable
fun AuthorCollectionsSection(
    creatorId: String?,
    own: Boolean,
    onOpenCollection: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CollectionListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var createOpen by remember { mutableStateOf(false) }
    LaunchedEffect(creatorId, own) { viewModel.load(if (own) null else creatorId) }
    LaunchedEffect(state.notice) {
        val message = state.notice ?: return@LaunchedEffect
        HeikaNoticeBus.show(message, if (message.contains("失败")) HeikaNoticeKind.ERROR else HeikaNoticeKind.SUCCESS)
        viewModel.clearNotice()
    }
    if (state.loading && state.items.isEmpty()) {
        HeikaPulseRow(modifier.fillMaxWidth().padding(horizontal = 20.dp), height = 56.dp)
        return
    }
    if (state.items.isEmpty() && !own) return

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("合集", color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text("${state.items.size} 个", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
        }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            state.items.forEach { collection ->
                CollectionChip(collection) { onOpenCollection(collection.id) }
            }
            if (own) {
                Row(
                    Modifier.width(104.dp).clip(RoundedCornerShape(12.dp))
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .5f), RoundedCornerShape(12.dp))
                        .clickable { createOpen = true }
                        .padding(vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(HeikaIcons.Add, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(13.dp))
                    Text("新建合集", Modifier.padding(start = 4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                }
            }
        }
    }

    if (createOpen) {
        CollectionMetaDialog(
            initial = null,
            busy = state.saving,
            onDismiss = { createOpen = false },
            onSave = { title, description, kind, status ->
                viewModel.create(title, description, kind, status, null) { created ->
                    createOpen = false
                    onOpenCollection(created.id)
                }
            },
        )
    }
}

@Composable
private fun CollectionChip(collection: HeikaCollection, onClick: () -> Unit) {
    Column(
        Modifier.width(152.dp).clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 11.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(
                collection.kindLabel,
                Modifier.clip(RoundedCornerShape(5.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = .15f)).padding(horizontal = 5.dp, vertical = 1.dp),
                color = MaterialTheme.colorScheme.primary,
                fontSize = 8.sp,
            )
            if (collection.awaitingReview) Text("待审", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 8.sp)
            else Text(collection.statusLabel, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 8.sp)
        }
        Text(collection.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text("${collection.publishedCount} 章", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
    }
}
