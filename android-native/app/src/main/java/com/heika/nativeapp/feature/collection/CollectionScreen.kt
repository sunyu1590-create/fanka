package com.heika.nativeapp.feature.collection

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.heika.nativeapp.data.HeikaChapter
import com.heika.nativeapp.data.HeikaCollection
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaAvatar
import com.heika.nativeapp.ui.HeikaGlassDialog
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.HeikaNoticeKind
import com.heika.nativeapp.ui.HeikaPulseRow
import com.heika.nativeapp.ui.LocalHeikaImageLoader

/**
 * 合集详情：封面 / 作者 / 类型 / 状态 / 章节目录 / 继续阅读 / 收藏与更新提醒，
 * 作者本人额外拥有章节排序、移除、加入已有作品与资料编辑。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionScreen(
    seriesId: String?,
    onBack: () -> Unit,
    onOpenChapter: (HeikaChapter) -> Unit,
    onAuthor: (String) -> Unit,
    onShare: (HeikaCollection) -> Unit,
    viewModel: CollectionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val collection = state.collection
    val imageLoader = LocalHeikaImageLoader.current
    var pickerOpen by remember { mutableStateOf(false) }
    var metaOpen by remember { mutableStateOf(false) }
    var deleteOpen by remember { mutableStateOf(false) }
    var expandedChapter by remember { mutableStateOf<String?>(null) }
    var selectedWorks by remember { mutableStateOf(setOf<String>()) }

    LaunchedEffect(seriesId) { seriesId?.let(viewModel::load) }
    LaunchedEffect(state.notice) {
        val message = state.notice ?: return@LaunchedEffect
        val kind = if (message.contains("失败") || message.contains("无法")) HeikaNoticeKind.ERROR else HeikaNoticeKind.SUCCESS
        HeikaNoticeBus.show(message, kind)
        viewModel.clearNotice()
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(
            title = collection?.let { "${it.kindLabel}合集" } ?: "合集",
            onBack = onBack,
            trailing = collection?.let { value ->
                {
                    androidx.compose.material3.IconButton(onClick = { onShare(value) }) {
                        Icon(HeikaIcons.Share, contentDescription = "分享合集", tint = MaterialTheme.colorScheme.onBackground, modifier = Modifier.size(19.dp))
                    }
                }
            },
        )
        when {
            state.loading && collection == null -> Box(Modifier.fillMaxSize().padding(20.dp)) {
                HeikaPulseRow(Modifier.fillMaxWidth(), height = 96.dp)
            }
            collection == null -> Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(state.error ?: "合集暂时无法显示", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                TextButton(onClick = { seriesId?.let { viewModel.load(it, force = true) } }) { Text("重试") }
            }
            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 120.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                item {
                    CollectionHero(
                        collection = collection,
                        imageLoader = imageLoader,
                        onAuthor = { onAuthor(collection.creatorId) },
                    )
                }
                if (collection.awaitingReview || collection.isOwner && collection.reviewNote != null) {
                    item {
                        Column(
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 12.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .5f))
                                .padding(horizontal = 12.dp, vertical = 9.dp),
                            verticalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                            Text(
                                if (collection.awaitingReview) "公开信息正在审核" else "上次审核意见",
                                color = MaterialTheme.colorScheme.primary,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                collection.reviewNote ?: "标题、简介、封面等公开信息的修改需要审核，通过后才会替换线上版本。已发布章节不受影响。",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 10.sp,
                                lineHeight = 15.sp,
                            )
                        }
                    }
                }
                item { CollectionActions(collection, state.busy, viewModel, onResume = { collection.resumeChapter?.let(onOpenChapter) }) }
                if (collection.isOwner) {
                    item {
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CollectionOwnerChip("加入作品", HeikaIcons.Add) { selectedWorks = emptySet(); viewModel.loadOwnWorks(); pickerOpen = true }
                            CollectionOwnerChip("编辑资料", HeikaIcons.Edit) { metaOpen = true }
                            Spacer(Modifier.weight(1f))
                            CollectionOwnerChip("删除", HeikaIcons.Delete, danger = true) { deleteOpen = true }
                        }
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("目录", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.width(6.dp))
                        Text("${collection.publishedCount} 章", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        Spacer(Modifier.weight(1f))
                        if (collection.status == "completed") {
                            Text("已完结", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                        }
                    }
                }
                if (collection.chapters.isEmpty()) {
                    item {
                        Text(
                            if (collection.isOwner) "还没有章节，点「加入作品」把已有作品放进来。" else "作者还没有公开章节。",
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 20.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 11.sp,
                        )
                    }
                }
                items(collection.chapters.size, key = { collection.chapters[it].id }) { index ->
                    val chapter = collection.chapters[index]
                    ChapterRow(
                        chapter = chapter,
                        active = chapter.id == collection.progressPostId,
                        expanded = expandedChapter == chapter.id,
                        owner = collection.isOwner,
                        canMoveUp = index > 0,
                        canMoveDown = index < collection.chapters.lastIndex,
                        onClick = {
                            if (chapter.published || collection.isOwner) {
                                viewModel.recordProgress(chapter.id)
                                onOpenChapter(chapter)
                            } else {
                                HeikaNoticeBus.show("本章还在审核中，通过后才会公开", HeikaNoticeKind.WARNING)
                            }
                        },
                        onToggleMenu = { expandedChapter = if (expandedChapter == chapter.id) null else chapter.id },
                        onMove = { delta -> expandedChapter = null; viewModel.move(chapter, delta) },
                        onRemove = { expandedChapter = null; viewModel.removeChapter(chapter) },
                    )
                }
            }
        }
    }

    if (pickerOpen) {
        ModalBottomSheet(
            onDismissRequest = { pickerOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("加入已有作品", color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text("只显示你自己的作品；加入合集不会复制正文，移除也不会删除作品。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, lineHeight = 15.sp)
                if (state.pickerLoading) {
                    HeikaPulseRow(Modifier.fillMaxWidth(), height = 48.dp)
                } else if (state.ownWorks.isEmpty()) {
                    Text("暂无可加入的作品", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                } else {
                    LazyColumn(Modifier.heightIn(max = 340.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(state.ownWorks.size, key = { state.ownWorks[it].cloudId.ifBlank { state.ownWorks[it].id.toString() } }) { index ->
                            val post = state.ownWorks[index]
                            val checked = post.cloudId in selectedWorks
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                                    .background(if (checked) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .7f) else Color.Transparent)
                                    .clickable { selectedWorks = if (checked) selectedWorks - post.cloudId else selectedWorks + post.cloudId }
                                    .padding(horizontal = 10.dp, vertical = 9.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Box(
                                    Modifier.size(18.dp).clip(RoundedCornerShape(5.dp))
                                        .border(1.dp, if (checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, RoundedCornerShape(5.dp))
                                        .background(if (checked) MaterialTheme.colorScheme.primary else Color.Transparent),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (checked) Icon(HeikaIcons.Check, contentDescription = null, tint = MaterialTheme.colorScheme.surface, modifier = Modifier.size(12.dp))
                                }
                                Text(post.title.ifBlank { "未命名作品" }, Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TextButton(onClick = { pickerOpen = false }) { Text("取消") }
                    Spacer(Modifier.weight(1f))
                    TextButton(
                        enabled = selectedWorks.isNotEmpty() && !state.busy,
                        onClick = {
                            viewModel.addWorks(selectedWorks.toList())
                            pickerOpen = false
                        },
                    ) { Text(if (selectedWorks.isEmpty()) "加入" else "加入 ${selectedWorks.size} 篇") }
                }
            }
        }
    }

    if (metaOpen && collection != null) {
        CollectionMetaDialog(
            initial = collection,
            busy = state.busy,
            onDismiss = { metaOpen = false },
            onSave = { title, description, kind, status ->
                viewModel.saveMeta(title, description, kind, status, collection.coverUrl) { metaOpen = false }
            },
        )
    }
    if (deleteOpen && collection != null) {
        HeikaGlassDialog(
            title = "删除这个合集？",
            message = "「${collection.title}」会被删除，其中的作品仍保留在作品列表里，不会被一起删除。",
            confirmText = "删除",
            destructive = true,
            onConfirm = {
                deleteOpen = false
                viewModel.deleteSeries(onDeleted = onBack)
            },
            onCancel = { deleteOpen = false },
        )
    }
}

@Composable
private fun CollectionHero(collection: HeikaCollection, imageLoader: coil3.ImageLoader, onAuthor: () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        collection.coverUrl?.let { cover ->
            val context = LocalContext.current
            var coverFailed by remember(cover) { mutableStateOf(false) }
            val request = remember(context, cover) {
                ImageRequest.Builder(context).data(cover).crossfade(true).build()
            }
            Box(Modifier.fillMaxWidth().aspectRatio(1.9f).background(MaterialTheme.colorScheme.surfaceVariant)) {
                if (!coverFailed) {
                    AsyncImage(
                        model = request,
                        contentDescription = "${collection.title}封面",
                        imageLoader = imageLoader,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                        onError = { coverFailed = true },
                    )
                } else {
                    // 封面加载失败不留空白大块，也不伪造图片：直接退化为纯色底 + 类型文字。
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(collection.kindLabel, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                }
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .34f))),
                    ),
                )
            }
        }
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    collection.kindLabel,
                    Modifier.clip(RoundedCornerShape(6.dp))
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = .14f))
                        .padding(horizontal = 7.dp, vertical = 3.dp),
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(collection.statusLabel, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                Text("·", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .6f), fontSize = 9.sp)
                Text("${collection.publishedCount} 章 · ${collection.followCount} 人收藏", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
            }
            Text(collection.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, lineHeight = 27.sp)
            if (collection.description.isNotBlank()) {
                Text(collection.description, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 17.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
            }
            Row(Modifier.fillMaxWidth().clickable(onClick = onAuthor).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HeikaAvatar(collection.creatorAvatar, collection.creatorName, 28.dp, contentDescription = "${collection.creatorName}头像")
                Text(collection.creatorName, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.weight(1f))
                Icon(HeikaIcons.Forward, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
            }
        }
    }
}

@Composable
private fun CollectionActions(collection: HeikaCollection, busy: Boolean, viewModel: CollectionViewModel, onResume: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.CenterVertically) {
            val resumeLabel = if (collection.progressIndex >= 0) "继续阅读 · 第 ${collection.progressIndex + 1} 章" else "开始阅读"
            Text(
                resumeLabel,
                Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.primary)
                    .clickable(enabled = !busy && collection.resumeChapter != null, onClick = onResume)
                    .padding(vertical = 12.dp),
                color = MaterialTheme.colorScheme.surface,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Row(
                Modifier.clip(RoundedCornerShape(12.dp))
                    .border(1.dp, if (collection.following) MaterialTheme.colorScheme.primary.copy(alpha = .55f) else MaterialTheme.colorScheme.outline.copy(alpha = .6f), RoundedCornerShape(12.dp))
                    .clickable(enabled = !busy, onClick = viewModel::toggleFollow)
                    .padding(horizontal = 13.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Icon(
                    if (collection.following) HeikaIcons.SaveFilled else HeikaIcons.SaveOutline,
                    contentDescription = null,
                    tint = if (collection.following) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
                )
                Text(if (collection.following) "已收藏" else "收藏", color = if (collection.following) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            }
        }
        if (collection.following) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("新章节过审后提醒我", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Switch(
                    checked = collection.notify,
                    onCheckedChange = { viewModel.setNotify(it) },
                    enabled = !busy,
                    modifier = Modifier.height(26.dp),
                )
            }
        }
    }
}

@Composable
private fun CollectionOwnerChip(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, danger: Boolean = false, onClick: () -> Unit) {
    val tint = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier.clip(RoundedCornerShape(9.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(13.dp))
        Text(text, color = tint, fontSize = 10.sp)
    }
}

@Composable
private fun ChapterRow(
    chapter: HeikaChapter,
    active: Boolean,
    expanded: Boolean,
    owner: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onClick: () -> Unit,
    onToggleMenu: () -> Unit,
    onMove: (Int) -> Unit,
    onRemove: () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(11.dp),
        ) {
            Text(
                "%02d".format(chapter.chapter),
                Modifier.widthIn(min = 22.dp),
                color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .75f),
                fontSize = 11.sp,
                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        chapter.title,
                        Modifier.weight(1f, fill = false),
                        color = MaterialTheme.colorScheme.onBackground,
                        fontSize = 13.sp,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (!chapter.published) {
                        Text(
                            chapter.statusLabel.ifBlank { "未发布" },
                            Modifier.clip(RoundedCornerShape(4.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(horizontal = 4.dp, vertical = 1.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 8.sp,
                        )
                    } else if (active) {
                        Text("读到这", color = MaterialTheme.colorScheme.primary, fontSize = 8.sp)
                    }
                }
                if (chapter.excerpt.isNotBlank()) {
                    Text(chapter.excerpt, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, lineHeight = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Text(chapter.date, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .7f), fontSize = 9.sp)
            }
            if (owner) {
                Icon(
                    HeikaIcons.More,
                    contentDescription = "章节操作",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp).clickable(onClick = onToggleMenu),
                )
            }
        }
        if (expanded && owner) {
            Row(
                Modifier.fillMaxWidth().padding(start = 52.dp, end = 20.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                TextButton(onClick = { onMove(-1) }, enabled = canMoveUp) { Text("上移", fontSize = 10.sp) }
                TextButton(onClick = { onMove(1) }, enabled = canMoveDown) { Text("下移", fontSize = 10.sp) }
                TextButton(onClick = onRemove) { Text("移出合集", fontSize = 10.sp, color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

@Composable
internal fun CollectionMetaDialog(
    initial: HeikaCollection?,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSave: (String, String, String, String) -> Unit,
) {
    var title by remember { mutableStateOf(initial?.title.orEmpty()) }
    var description by remember { mutableStateOf(initial?.description.orEmpty()) }
    var kind by remember { mutableStateOf(initial?.kind ?: "serial") }
    var status by remember { mutableStateOf(initial?.status ?: "ongoing") }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        containerColor = MaterialTheme.colorScheme.surface,
        title = { Text(if (initial == null) "新建合集" else "编辑合集资料", fontSize = 15.sp, fontWeight = FontWeight.SemiBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Text("名称必填，简介与封面可选。公开信息修改后会进入审核。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, lineHeight = 15.sp)
                OutlinedTextField(
                    value = title,
                    onValueChange = { if (it.length <= 48) title = it },
                    label = { Text("合集名称", fontSize = 11.sp) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { if (it.length <= 240) description = it },
                    label = { Text("简介（可选）", fontSize = 11.sp) },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("类型", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("serial" to "连载", "tutorial" to "教程", "resource" to "资源").forEach { (key, label) ->
                        MetaChip(label, kind == key) { kind = key }
                    }
                }
                Text("状态", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("ongoing" to "连载中", "completed" to "已完结").forEach { (key, label) ->
                        MetaChip(label, status == key) { status = key }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && title.trim().length >= 2, onClick = { onSave(title, description, kind, status) }) {
                if (busy) CircularProgressIndicator(Modifier.size(13.dp), strokeWidth = 1.6.dp) else Text("保存")
            }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun MetaChip(label: String, active: Boolean, onClick: () -> Unit) {
    Text(
        label,
        Modifier.clip(RoundedCornerShape(8.dp))
            .background(if (active) MaterialTheme.colorScheme.primary.copy(alpha = .16f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .6f))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 10.sp,
    )
}
