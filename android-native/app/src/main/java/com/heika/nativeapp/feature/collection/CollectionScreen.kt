package com.heika.nativeapp.feature.collection

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.compose.ui.text.style.TextAlign
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
import com.heika.nativeapp.ui.HeikaRadii
import com.heika.nativeapp.ui.LocalHeikaImageLoader

/**
 * 合集详情分两种形态，不再混在一起：
 * 阅读态 —— 紧凑竖版封面 + 基础信息 + 开始/继续阅读、收藏、分享 + 章节目录；
 * 管理态 —— 合集资料 / 章节管理 / 发布与审核三个分组，删除收进右上角「更多」。
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
    var moreOpen by remember { mutableStateOf(false) }
    var manageMode by remember { mutableStateOf(false) }
    var expandedChapter by remember { mutableStateOf<String?>(null) }
    var selectedWorks by remember { mutableStateOf(setOf<String>()) }

    LaunchedEffect(seriesId) { seriesId?.let(viewModel::load) }
    LaunchedEffect(collection?.id) { if (collection == null) manageMode = false }
    LaunchedEffect(state.notice) {
        val message = state.notice ?: return@LaunchedEffect
        val kind = if (message.contains("失败") || message.contains("无法")) HeikaNoticeKind.ERROR else HeikaNoticeKind.SUCCESS
        HeikaNoticeBus.show(message, kind)
        viewModel.clearNotice()
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(
            title = if (manageMode) "管理合集" else collection?.let { "${it.kindLabel}合集" } ?: "合集",
            onBack = { if (manageMode) manageMode = false else onBack() },
            trailing = collection?.let { value ->
                {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { onShare(value) }) {
                            Icon(HeikaIcons.Share, contentDescription = "分享合集", tint = MaterialTheme.colorScheme.onBackground, modifier = Modifier.size(19.dp))
                        }
                        if (value.isOwner) {
                            Box {
                                IconButton(onClick = { moreOpen = true }) {
                                    Icon(HeikaIcons.More, contentDescription = "更多", tint = MaterialTheme.colorScheme.onBackground, modifier = Modifier.size(19.dp))
                                }
                                DropdownMenu(expanded = moreOpen, onDismissRequest = { moreOpen = false }) {
                                    DropdownMenuItem(
                                        text = { Text(if (manageMode) "返回阅读页" else "管理合集", fontSize = 12.sp) },
                                        onClick = { moreOpen = false; manageMode = !manageMode },
                                    )
                                    DropdownMenuItem(
                                        text = { Text("删除合集", fontSize = 12.sp, color = MaterialTheme.colorScheme.error) },
                                        onClick = { moreOpen = false; deleteOpen = true },
                                    )
                                }
                            }
                        }
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
            manageMode -> ManageBody(
                collection = collection,
                busy = state.busy,
                expandedChapter = expandedChapter,
                onEditMeta = { metaOpen = true },
                onAddWorks = { selectedWorks = emptySet(); viewModel.loadOwnWorks(); pickerOpen = true },
                onToggleChapterMenu = { id -> expandedChapter = if (expandedChapter == id) null else id },
                onMoveChapter = { chapter, delta -> expandedChapter = null; viewModel.move(chapter, delta) },
                onRemoveChapter = { chapter -> expandedChapter = null; viewModel.removeChapter(chapter) },
                onOpenChapter = { chapter ->
                    viewModel.recordProgress(chapter.id)
                    manageMode = false
                    onOpenChapter(chapter)
                },
                onResubmit = {
                    viewModel.saveMeta(
                        collection.title, collection.description, collection.kind, collection.status, collection.coverUrl,
                    ) {}
                },
            )
            else -> ReadBody(
                collection = collection,
                busy = state.busy,
                imageLoader = imageLoader,
                onAuthor = { onAuthor(collection.creatorId) },
                onManage = { manageMode = true },
                onResume = { collection.resumeChapter?.let(onOpenChapter) },
                onToggleFollow = viewModel::toggleFollow,
                onToggleNotify = viewModel::setNotify,
                onOpenChapter = { chapter ->
                    if (chapter.published) {
                        viewModel.recordProgress(chapter.id)
                        onOpenChapter(chapter)
                    } else {
                        HeikaNoticeBus.show("本章还在审核中，通过后才会公开", HeikaNoticeKind.WARNING)
                    }
                },
            )
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
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.chip))
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

/* ------------------------------ 阅读态 ------------------------------ */

@Composable
private fun ReadBody(
    collection: HeikaCollection,
    busy: Boolean,
    imageLoader: coil3.ImageLoader,
    onAuthor: () -> Unit,
    onManage: () -> Unit,
    onResume: () -> Unit,
    onToggleFollow: () -> Unit,
    onToggleNotify: (Boolean) -> Unit,
    onOpenChapter: (HeikaChapter) -> Unit,
) {
    // 目录顺序与展开量只影响展示：服务端返回的章节顺序永远是真实阅读顺序。
    var descending by rememberSaveable(collection.id) { mutableStateOf(false) }
    var tocLimit by rememberSaveable(collection.id) { mutableIntStateOf(12) }
    val ordered = remember(collection.chapters, descending) {
        if (descending) collection.chapters.reversed() else collection.chapters
    }
    val visible = ordered.take(tocLimit)
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 120.dp),
    ) {
        item { CollectionSummary(collection, imageLoader, onAuthor) }
        item { CollectionActions(collection, busy, onResume = onResume, onToggleFollow = onToggleFollow, onToggleNotify = onToggleNotify, onManage = onManage) }
        if (collection.publishedCount > 0) item { ReadingProgress(collection) }
        reviewNoteOrState(collection)?.let { note ->
            item { ReviewStrip(note.title, note.text, note.tone) }
        }
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 14.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("目录", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(6.dp))
                Text("${collection.publishedCount} 章 · 已读 ${collection.readCount}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                if (collection.status == "completed") Text("已完结", color = MaterialTheme.colorScheme.primary, fontSize = 9.sp)
                if (collection.chapters.size > 1) {
                    Spacer(Modifier.width(8.dp))
                    Row(
                        Modifier.clip(RoundedCornerShape(50))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .42f))
                            .clickable { descending = !descending }
                            .padding(horizontal = 9.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Text(if (descending) "倒序 ↓" else "正序 ↑", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                    }
                }
            }
        }
        if (collection.chapters.isEmpty()) {
            item {
                Text(
                    if (collection.isOwner) "还没有章节，可以在「管理」里加入已有作品。" else "作者还没有公开章节。",
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 20.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp,
                )
            }
        }
        items(visible.size, key = { visible[it].id }) { index ->
            val chapter = visible[index]
            ChapterRow(
                chapter = chapter,
                active = chapter.id == collection.progressPostId,
                expanded = false,
                owner = false,
                canMoveUp = false,
                canMoveDown = false,
                onClick = { onOpenChapter(chapter) },
                onToggleMenu = {},
                onMove = {},
                onRemove = {},
            )
        }
        if (ordered.size > tocLimit) {
            item {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)
                        .clip(RoundedCornerShape(HeikaRadii.chip))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .4f))
                        .clickable { tocLimit += 24 }
                        .padding(vertical = 10.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("展开剩余 ${ordered.size - tocLimit} 章", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
            }
        }
    }
}

/** 阅读进度：只展示真实已读章节数，未开始阅读时不占位。 */
@Composable
private fun ReadingProgress(collection: HeikaCollection) {
    val percent = collection.progressPercent.coerceIn(0, 100)
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 10.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (percent == 0) "还没开始读" else "已读 ${collection.readCount}/${collection.publishedCount} 章",
                Modifier.weight(1f),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 10.sp,
            )
            Text("$percent%", color = if (percent == 0) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
        }
        Box(
            Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(50))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f)),
        ) {
            Box(
                Modifier.fillMaxWidth(percent / 100f).height(3.dp).clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.primary),
            )
        }
    }
}

private data class ReviewNote(val title: String, val text: String, val tone: String)

/**
 * 审核提示只按真实状态渲染：通过或没有记录时不渲染；审核中只写「审核中」；
 * 退回修改才展示真实原因，绝不把 null / undefined 当成文案显示。
 */
private fun reviewNoteOrState(collection: HeikaCollection): ReviewNote? {
    if (!collection.isOwner) return null
    return when {
        collection.reviewRejected -> ReviewNote(
            title = "退回修改",
            text = collection.reviewNote?.let { "审核意见：$it" } ?: "合集资料未通过审核，请按平台规范修改后重新提交。",
            tone = "rejected",
        )
        collection.reviewPending -> ReviewNote(
            title = "审核中",
            text = if (collection.publishedCount > 0) "公开信息修改已提交，线上版本继续展示。" else "新合集待审核，仅自己可见。",
            tone = "pending",
        )
        else -> null
    }
}

@Composable
private fun ReviewStrip(title: String, text: String, tone: String) {
    val accent = if (tone == "rejected") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 10.dp)
            .clip(RoundedCornerShape(HeikaRadii.chip))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f))
            .border(.8.dp, accent.copy(alpha = .35f), RoundedCornerShape(HeikaRadii.chip))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(title, color = accent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, lineHeight = 15.sp)
    }
}

/** 紧凑封面：竖版 3:4 放在左侧，右侧是名称 / 作者 / 类型 / 状态 / 章数，没有封面时用品牌色渐变占位。 */
@Composable
private fun CollectionSummary(collection: HeikaCollection, imageLoader: coil3.ImageLoader, onAuthor: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 8.dp, bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(13.dp)) {
            Box(
                Modifier.width(88.dp).aspectRatio(0.75f).clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                val cover = collection.coverUrl
                if (cover != null) {
                    val context = LocalContext.current
                    var coverFailed by remember(cover) { mutableStateOf(false) }
                    val request = remember(context, cover) { ImageRequest.Builder(context).data(cover).crossfade(true).build() }
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
                        CoverFallback(collection)
                    }
                } else {
                    CoverFallback(collection)
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(
                        collection.kindLabel,
                        Modifier.clip(RoundedCornerShape(5.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = .13f))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(collection.statusLabel, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                    Text("· ${collection.publishedCount} 章", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                }
                Text(
                    collection.title,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 24.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(Modifier.fillMaxWidth().clickable(onClick = onAuthor).padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    HeikaAvatar(collection.creatorAvatar, collection.creatorName, 24.dp, contentDescription = "${collection.creatorName}头像")
                    Text(collection.creatorName, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${collection.followCount} 人收藏", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 9.sp)
                }
            }
        }
        if (collection.description.isNotBlank()) {
            Text(
                collection.description,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.5.sp,
                lineHeight = 17.sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun CoverFallback(collection: HeikaCollection) {
    Box(
        Modifier.fillMaxSize().background(
            Brush.linearGradient(
                listOf(
                    MaterialTheme.colorScheme.primary.copy(alpha = .22f),
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .5f),
                ),
            ),
        ),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(HeikaIcons.List, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
            Text(collection.kindLabel, color = MaterialTheme.colorScheme.primary, fontSize = 9.sp, letterSpacing = 1.sp)
        }
    }
}

@Composable
private fun CollectionActions(
    collection: HeikaCollection,
    busy: Boolean,
    onResume: () -> Unit,
    onToggleFollow: () -> Unit,
    onToggleNotify: (Boolean) -> Unit,
    onManage: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            val resumeLabel = if (collection.progressIndex >= 0) "继续阅读 · 第 ${collection.progressIndex + 1} 章" else "开始阅读"
            Text(
                resumeLabel,
                Modifier.weight(1f).clip(RoundedCornerShape(HeikaRadii.chip))
                    .background(MaterialTheme.colorScheme.primary)
                    .clickable(enabled = !busy && collection.resumeChapter != null, onClick = onResume)
                    .padding(vertical = 12.dp),
                color = MaterialTheme.colorScheme.surface,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            Row(
                Modifier.clip(RoundedCornerShape(HeikaRadii.chip))
                    .border(1.dp, if (collection.following) MaterialTheme.colorScheme.primary.copy(alpha = .55f) else MaterialTheme.colorScheme.outline.copy(alpha = .6f), RoundedCornerShape(HeikaRadii.chip))
                    .clickable(enabled = !busy, onClick = onToggleFollow)
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
            if (collection.isOwner) {
                Row(
                    Modifier.clip(RoundedCornerShape(HeikaRadii.chip))
                        .background(MaterialTheme.colorScheme.surface)
                        .clickable(onClick = onManage)
                        .padding(horizontal = 13.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Icon(HeikaIcons.Edit, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
                    Text("管理", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
            }
        }
        if (collection.following) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("新章节过审后提醒我", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Switch(
                    checked = collection.notify,
                    onCheckedChange = onToggleNotify,
                    enabled = !busy,
                    modifier = Modifier.height(26.dp),
                )
            }
        }
    }
}

/* ------------------------------ 管理态 ------------------------------ */

@Composable
private fun ManageBody(
    collection: HeikaCollection,
    busy: Boolean,
    expandedChapter: String?,
    onEditMeta: () -> Unit,
    onAddWorks: () -> Unit,
    onToggleChapterMenu: (String) -> Unit,
    onMoveChapter: (HeikaChapter, Int) -> Unit,
    onRemoveChapter: (HeikaChapter) -> Unit,
    onOpenChapter: (HeikaChapter) -> Unit,
    onResubmit: () -> Unit,
) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 120.dp),
    ) {
        item {
            ManageGroup("合集资料") {
                Row(Modifier.fillMaxWidth().clickable(onClick = onEditMeta).padding(horizontal = 13.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                    Box(Modifier.width(44.dp).aspectRatio(0.75f).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                        CoverFallback(collection)
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(collection.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${collection.kindLabel} · ${collection.statusLabel} · ${collection.chapters.size} 章",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 10.sp,
                        )
                    }
                    Text("编辑", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                    Icon(HeikaIcons.Forward, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .6f), modifier = Modifier.size(15.dp))
                }
            }
        }
        item {
            ManageGroup("章节管理") {
                if (collection.chapters.isEmpty()) {
                    Text(
                        "还没有章节，先加入一篇已有作品。",
                        Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 16.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.sp,
                    )
                } else {
                    collection.chapters.forEachIndexed { index, chapter ->
                        if (index > 0) HorizontalDivider(Modifier.padding(start = 44.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .4f))
                        ChapterRow(
                            chapter = chapter,
                            active = chapter.id == collection.progressPostId,
                            expanded = expandedChapter == chapter.id,
                            owner = true,
                            canMoveUp = index > 0,
                            canMoveDown = index < collection.chapters.lastIndex,
                            onClick = { onOpenChapter(chapter) },
                            onToggleMenu = { onToggleChapterMenu(chapter.id) },
                            onMove = { delta -> onMoveChapter(chapter, delta) },
                            onRemove = { onRemoveChapter(chapter) },
                        )
                    }
                }
                HorizontalDivider(Modifier.padding(start = 13.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .4f))
                Row(
                    Modifier.fillMaxWidth().clickable(enabled = !busy, onClick = onAddWorks).padding(horizontal = 13.dp, vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Icon(HeikaIcons.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(15.dp))
                    Text("添加已有作品", color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
        item {
            ManageGroup("发布与审核") {
                val note = reviewNoteOrState(collection)
                val title = note?.title ?: "已通过审核"
                val text = note?.text ?: "合集公开可见，新章节发布后自动进入审核。"
                val accent = when (note?.tone) {
                    "rejected" -> MaterialTheme.colorScheme.error
                    "pending" -> MaterialTheme.colorScheme.primary
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                }
                Column(Modifier.fillMaxWidth().padding(13.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(title, color = accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.5.sp, lineHeight = 15.sp)
                }
                HorizontalDivider(Modifier.padding(start = 13.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .4f))
                Row(
                    Modifier.fillMaxWidth().clickable(enabled = !busy, onClick = onResubmit).padding(horizontal = 13.dp, vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Icon(HeikaIcons.Upload, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
                    Text(if (busy) "提交中…" else "重新提交审核", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
            }
        }
        item {
            Text(
                "删除合集在右上角「更多」里；删除后作品仍会保留。",
                Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 10.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f),
                fontSize = 10.sp,
            )
        }
    }
}

@Composable
private fun ManageGroup(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 7.dp)) {
        Text(title, Modifier.padding(start = 3.dp, bottom = 7.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.group))
                .background(MaterialTheme.colorScheme.surface)
                .border(.8.dp, MaterialTheme.colorScheme.outline.copy(alpha = .35f), RoundedCornerShape(HeikaRadii.group)),
            content = content,
        )
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
            Modifier.fillMaxWidth().clickable(onClick = onClick).padding(start = 13.dp, end = 20.dp, top = 11.dp, bottom = 11.dp),
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
                    } else if (chapter.read) {
                        Text("已读", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 8.sp)
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
                Modifier.fillMaxWidth().padding(start = 44.dp, end = 20.dp, bottom = 8.dp),
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
