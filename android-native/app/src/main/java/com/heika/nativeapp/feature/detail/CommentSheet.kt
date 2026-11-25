package com.heika.nativeapp.feature.detail

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.heika.nativeapp.ui.HeikaAvatar
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.HeikaReadingPalette
import com.heika.nativeapp.ui.LocalHeikaBodyTextScale
import com.heika.nativeapp.ui.heikaReadingPalette
import com.heika.nativeapp.ui.rememberReduceMotion

/**
 * 评论面板（方案 A+C）：抖音式底部上拉 + 完整讨论能力。
 *
 * 为什么不再把评论放在正文里：正文是阅读空间，评论是讨论空间，两者混在一条
 * 滚动流里会互相打断。这里把评论收进独立面板，正文只保留一个「参与讨论」入口。
 *
 * 面板始终是不透明实心底色，不做玻璃——正文透过评论区会直接影响可读性。
 */
@Composable
fun CommentSheet(
    visible: Boolean,
    comments: List<NativeComment>,
    total: Int,
    sort: String,
    loading: Boolean,
    loadingMore: Boolean,
    hasMore: Boolean,
    error: String?,
    sending: Boolean,
    draft: String,
    replyToName: String?,
    likeBusyIds: Set<String>,
    currentUserId: String?,
    authorId: String?,
    onDraftChange: (String) -> Unit,
    onCancelReply: () -> Unit,
    onSend: () -> Unit,
    onClose: () -> Unit,
    onSort: (String) -> Unit,
    onLoadMore: () -> Unit,
    onRetry: () -> Unit,
    onLike: (String) -> Unit,
    onMore: (NativeComment) -> Unit,
    onReply: (NativeComment) -> Unit,
    focusInput: Boolean,
    onFocusHandled: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!visible) return
    val palette = heikaReadingPalette()
    val density = LocalDensity.current
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val listState = rememberLazyListState()
    // 默认 70%，最多拉到 96%；松手吸附到最近的档位，避免停在半截。
    var fraction by remember { mutableFloatStateOf(0.7f) }
    var expanded by remember { mutableStateOf(false) }
    val targetFraction = if (expanded) 0.96f else 0.7f
    val reduceMotion = rememberReduceMotion()
    val animatedFraction by animateFloatAsState(
        targetValue = targetFraction,
        animationSpec = tween(if (reduceMotion) 0 else 300, easing = HeikaMotion.openEasing),
        label = "comment-sheet-fraction",
    )

    BoxWithConstraints(Modifier.fillMaxSize().zIndex(20f)) {
        val maxPx = with(density) { maxHeight.toPx() }
        Box(
            Modifier.fillMaxSize()
                .background(Color.Black.copy(alpha = 0.36f))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
        )
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(maxHeight * animatedFraction)
                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                .background(palette.panel)
                .imePadding()
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
        ) {
            // 拖动区：向上拉扩展，向下拉先回落再关闭。
            Box(
                Modifier.fillMaxWidth()
                    .draggable(
                        orientation = Orientation.Vertical,
                        state = rememberDraggableState { delta ->
                            val next = (fraction - delta / maxPx).coerceIn(0.3f, 0.96f)
                            fraction = next
                            expanded = next > 0.83f
                        },
                        onDragStopped = {
                            when {
                                fraction < 0.46f -> { onClose(); fraction = 0.7f; expanded = false }
                                fraction > 0.83f -> expanded = true
                                else -> expanded = false
                            }
                        },
                    )
                    .padding(top = 8.dp, bottom = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.width(38.dp).height(4.dp).clip(RoundedCornerShape(999.dp)).background(palette.line))
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    if (total > 0) "全部评论" else "评论",
                    color = palette.title,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                if (total > 0) Text("  $total", color = palette.muted, fontSize = 12.sp)
                Spacer(Modifier.weight(1f))
                Box(
                    Modifier.size(32.dp).clip(RoundedCornerShape(50))
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                            expanded = !expanded
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        if (expanded) HeikaIcons.Close else HeikaIcons.ArrowUp,
                        contentDescription = if (expanded) "收起面板" else "展开到全屏",
                        tint = palette.muted,
                        modifier = Modifier.size(16.dp),
                    )
                }
                Box(
                    Modifier.size(32.dp).clip(RoundedCornerShape(50))
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(HeikaIcons.Close, contentDescription = "关闭评论", tint = palette.muted, modifier = Modifier.size(17.dp))
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                listOf("hot" to "热门", "new" to "最新").forEach { (key, label) ->
                    val selected = sort == key
                    Text(
                        label,
                        Modifier.clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onSort(key) }
                            .padding(vertical = 4.dp),
                        color = if (selected) palette.title else palette.muted,
                        fontSize = 12.sp,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(palette.line))
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            ) {
                if (loading && comments.isEmpty()) item(key = "loading") {
                    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = palette.accent)
                        Text("正在加载评论…", Modifier.padding(top = 8.dp), color = palette.muted, fontSize = 11.sp)
                    }
                }
                if (error != null) item(key = "error") {
                    Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(error, Modifier.weight(1f), color = palette.muted, fontSize = 12.sp)
                        TextButton(onClick = onRetry) { Text("重试", fontSize = 12.sp) }
                    }
                }
                val roots = comments.filter { it.parentId == null || comments.none { parent -> parent.id == it.parentId } }
                val byParent = comments.filter { it.parentId != null }.groupBy { it.parentId!! }
                items(roots, key = { it.id }) { root ->
                    CommentEntry(
                        comment = root,
                        palette = palette,
                        isAuthor = authorId != null && root.authorId == authorId,
                        likeBusy = root.id in likeBusyIds,
                        likeBusyIds = likeBusyIds,
                        replies = byParent[root.id].orEmpty(),
                        replyCount = byParent[root.id].orEmpty().size,
                        onLike = { onLike(root.id) },
                        onMore = { onMore(root) },
                        onReply = { onReply(root) },
                        onLikeReply = { onLike(it.id) },
                        onMoreReply = { onMore(it) },
                        onReplyReply = { onReply(it) },
                        nested = false,
                    )
                }
                if (hasMore) item(key = "more") {
                    Text(
                        if (loadingMore) "正在加载…" else "加载更多评论",
                        Modifier.fillMaxWidth()
                            .clickable(enabled = !loadingMore, onClick = onLoadMore)
                            .padding(vertical = 14.dp),
                        color = palette.accent,
                        fontSize = 12.sp,
                    )
                }
                if (!loading && error == null && comments.isEmpty()) item(key = "empty") {
                    Text(
                        "还没有评论，来聊聊你的想法。",
                        Modifier.fillMaxWidth().padding(vertical = 26.dp),
                        color = palette.muted,
                        fontSize = 12.sp,
                    )
                }
            }
            Column(
                Modifier.fillMaxWidth().background(palette.panel).navigationBarsPadding(),
            ) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(palette.line))
                if (replyToName != null) {
                    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("回复 $replyToName", Modifier.weight(1f), color = palette.accent, fontSize = 11.sp)
                        Text(
                            "取消",
                            Modifier.clickable(enabled = !sending) { onCancelReply() }.padding(horizontal = 8.dp, vertical = 4.dp),
                            color = palette.muted,
                            fontSize = 11.sp,
                        )
                    }
                }
                Row(
                    Modifier.fillMaxWidth().padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Box(
                        Modifier.weight(1f).heightIn(min = 40.dp, max = 96.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(palette.field)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        BasicTextField(
                            value = draft,
                            onValueChange = { onDraftChange(it.take(1000)) },
                            modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                            enabled = !sending,
                            maxLines = 4,
                            textStyle = androidx.compose.ui.text.TextStyle(color = palette.body, fontSize = 14.sp, lineHeight = 20.sp),
                            decorationBox = { inner ->
                                Box {
                                    if (draft.isEmpty()) Text("说说你的想法…", color = palette.muted, fontSize = 14.sp)
                                    inner()
                                }
                            },
                        )
                    }
                    IconButton(
                        enabled = !sending,
                        onClick = {
                            if (draft.isBlank()) {
                                focusRequester.requestFocus()
                                keyboard?.show()
                            } else onSend()
                        },
                        modifier = Modifier.size(44.dp),
                    ) {
                        if (sending) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = palette.accent)
                        else Icon(
                            if (draft.isBlank()) HeikaIcons.Comment else HeikaIcons.Send,
                            contentDescription = if (draft.isBlank()) "聚焦输入框" else "发送评论",
                            tint = if (draft.isNotBlank()) palette.accent else palette.muted,
                            modifier = Modifier.size(21.dp),
                        )
                    }
                }
            }
        }
    }

    // 从底栏输入框进入时，面板展开后再聚焦，避免键盘和动画抢帧。
    LaunchedEffect(focusInput) {
        if (focusInput) {
            kotlinx.coroutines.delay(320)
            runCatching { focusRequester.requestFocus() }
            keyboard?.show()
            onFocusHandled()
        }
    }
}

@Composable
private fun CommentEntry(
    comment: NativeComment,
    palette: HeikaReadingPalette,
    isAuthor: Boolean,
    likeBusy: Boolean,
    likeBusyIds: Set<String>,
    replies: List<NativeComment>,
    replyCount: Int,
    onLike: () -> Unit,
    onMore: () -> Unit,
    onReply: () -> Unit,
    onLikeReply: (NativeComment) -> Unit,
    onMoreReply: (NativeComment) -> Unit,
    onReplyReply: (NativeComment) -> Unit,
    nested: Boolean,
    replyTargetName: String? = null,
) {
    var repliesOpen by remember(comment.id) { mutableStateOf(false) }
    val bodyScale = LocalHeikaBodyTextScale.current
    Row(
        Modifier.fillMaxWidth().padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        HeikaAvatar(comment.authorAvatar, comment.author, if (nested) 28.dp else 34.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    comment.author,
                    color = palette.secondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (isAuthor) Text(
                    "作者",
                    Modifier.clip(RoundedCornerShape(4.dp)).background(palette.accent.copy(alpha = .16f)).padding(horizontal = 5.dp, vertical = 1.dp),
                    color = palette.accent,
                    fontSize = 9.sp,
                )
            }
            Text(
                if (replyTargetName == null) comment.body else "回复 $replyTargetName：${comment.body}",
                color = palette.body,
                fontSize = 14.sp * bodyScale,
                lineHeight = 21.sp * bodyScale,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(comment.createdAt.take(10), color = palette.muted, fontSize = 11.sp)
                Text(
                    "回复",
                    Modifier.clickable(onClick = onReply).padding(horizontal = 10.dp, vertical = 6.dp),
                    color = palette.muted,
                    fontSize = 11.sp,
                )
                if (replyCount > 0) Text(
                    if (repliesOpen) "收起回复" else "展开 $replyCount 条回复",
                    Modifier.clickable { repliesOpen = !repliesOpen }.padding(horizontal = 2.dp, vertical = 6.dp),
                    color = palette.accent,
                    fontSize = 11.sp,
                )
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onLike, enabled = !likeBusy, modifier = Modifier.size(30.dp)) {
                    Icon(
                        if (comment.liked) HeikaIcons.LikeFilled else HeikaIcons.LikeOutline,
                        contentDescription = "评论点赞",
                        tint = if (comment.liked) palette.accent else palette.muted,
                        modifier = Modifier.size(15.dp),
                    )
                }
                if (comment.likeCount > 0) Text(comment.likeCount.toString(), color = palette.muted, fontSize = 10.sp)
                IconButton(onClick = onMore, modifier = Modifier.size(30.dp)) {
                    Icon(HeikaIcons.More, contentDescription = "评论操作", tint = palette.muted, modifier = Modifier.size(16.dp))
                }
            }
            if (repliesOpen && replies.isNotEmpty()) {
                Column(Modifier.padding(top = 2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    replies.sortedBy { it.createdAt }.forEach { reply ->
                        CommentEntry(
                            comment = reply,
                            palette = palette,
                            isAuthor = isAuthor && reply.authorId == comment.authorId,
                            likeBusy = reply.id in likeBusyIds,
                            likeBusyIds = likeBusyIds,
                            replies = emptyList(),
                            replyCount = 0,
                            onLike = { onLikeReply(reply) },
                            onMore = { onMoreReply(reply) },
                            onReply = { onReplyReply(reply) },
                            onLikeReply = {},
                            onMoreReply = {},
                            onReplyReply = {},
                            nested = true,
                            replyTargetName = comment.author,
                        )
                    }
                }
            }
        }
    }
}
