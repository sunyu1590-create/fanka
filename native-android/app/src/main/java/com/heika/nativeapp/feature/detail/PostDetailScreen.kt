package com.heika.nativeapp.feature.detail

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import kotlinx.coroutines.delay
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.imageCacheKey
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.FilterChip
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.HeikaGlassSurface
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.heikaSharedPostImage
import dev.chrisbanes.haze.HazeState

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
fun PostDetailScreen(
    post: HeikaPost? = null,
    postKey: String? = null,
    onBack: () -> Unit,
    onAuthor: (String) -> Unit,
    onLogin: () -> Unit,
    onShare: (HeikaPost) -> Unit,
    hazeState: HazeState,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    sharedElementsEnabled: Boolean,
    viewModel: PostDetailViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    val readingMode by viewModel.readingMode.collectAsStateWithLifecycle()
    val imageLoader = LocalHeikaImageLoader.current
    val viewportWidth = LocalConfiguration.current.screenWidthDp.dp
    var draft by remember(post?.cloudId, postKey) { mutableStateOf("") }
    var replyTo by remember(post?.cloudId, postKey) { mutableStateOf<String?>(null) }
    var reportOpen by remember(post?.cloudId, postKey) { mutableStateOf(false) }
    var reportReason by remember { mutableStateOf("垃圾营销或重复内容") }
    var reportNote by remember { mutableStateOf("") }
    var moreOpen by remember { mutableStateOf(false) }
    var feedbackOpen by remember { mutableStateOf(false) }
    var feedbackText by remember { mutableStateOf("") }
    var feedbackCategory by remember { mutableStateOf("problem") }
    var commentMenu by remember { mutableStateOf<NativeComment?>(null) }
    var commentReport by remember { mutableStateOf<NativeComment?>(null) }
    var commentDeleteConfirm by remember { mutableStateOf<NativeComment?>(null) }
    var postDeleteConfirm by remember { mutableStateOf(false) }
    var expandedReplyThreads by remember { mutableStateOf(setOf<String>()) }
    LaunchedEffect(state.commentSubmitted) {
        if (state.commentSubmitted > 0) {
            replyTo?.let { targetId ->
                var target = state.comments.firstOrNull { it.id == targetId }
                val seen = mutableSetOf<String>()
                while (true) {
                    val current = target ?: break
                    val parentId = current.parentId ?: break
                    if (!seen.add(current.id)) break
                    target = state.comments.firstOrNull { it.id == parentId }
                }
                expandedReplyThreads = expandedReplyThreads + (target?.id ?: targetId)
            }
            draft = ""
            replyTo = null
        }
    }
    LaunchedEffect(post?.cloudId, postKey) {
        if (post != null) viewModel.load(post) else if (!postKey.isNullOrBlank()) viewModel.loadByKey(postKey)
    }
    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(state.post?.let { if (it.channel == "ai") "AI · HEIKA" else "${it.tag} · HEIKA" } ?: "内容详情", onBack, trailing = {
            Box {
                androidx.compose.material3.IconButton(onClick = { moreOpen = true }) { Icon(HeikaIcons.More, "更多操作") }
                DropdownMenu(expanded = moreOpen, onDismissRequest = { moreOpen = false }) {
                    val current = state.post
                    if (current != null) {
                        DropdownMenuItem(text = { Text("复制链接") }, leadingIcon = { Icon(HeikaIcons.Copy, null) }, onClick = {
                            moreOpen = false
                            val url = if (current.channel == "ai") "https://moonclean.shop/?aiPost=${current.id}&cloudId=${android.net.Uri.encode(current.cloudId)}" else "https://moonclean.shop/?post=${current.id}"
                            (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("HEIKA 内容链接", url))
                            viewModel.showNotice("链接已复制")
                        })
                        DropdownMenuItem(text = { Text("分享内容") }, leadingIcon = { Icon(HeikaIcons.Share, null) }, onClick = { moreOpen = false; onShare(current) })
                        DropdownMenuItem(text = { Text("内容反馈") }, leadingIcon = { Icon(HeikaIcons.Comment, null) }, onClick = { moreOpen = false; feedbackOpen = true })
                        DropdownMenuItem(text = { Text("举报内容") }, leadingIcon = { Icon(HeikaIcons.Report, null) }, onClick = { moreOpen = false; commentReport = null; reportOpen = true })
                        current.tags.firstOrNull()?.let { topic ->
                            DropdownMenuItem(text = { Text("减少话题推荐 · #$topic") }, leadingIcon = { Icon(HeikaIcons.Block, null) }, onClick = { moreOpen = false; viewModel.muteTopic(topic) })
                        }
                        if (current.authorId != null) {
                            DropdownMenuItem(text = { Text("不感兴趣：减少此作者推荐") }, leadingIcon = { Icon(HeikaIcons.Block, null) }, onClick = { moreOpen = false; viewModel.muteAuthor() })
                            DropdownMenuItem(text = { Text("屏蔽作者") }, leadingIcon = { Icon(HeikaIcons.Block, null) }, onClick = { moreOpen = false; viewModel.blockAuthor() })
                        }
                        if (state.currentUserId != null && state.currentUserId == current.authorId) {
                            DropdownMenuItem(text = { Text("删除内容") }, leadingIcon = { Icon(Icons.Outlined.Delete, null) }, onClick = { moreOpen = false; postDeleteConfirm = true })
                        }
                    }
                }
            }
        })
        if (state.loading && state.post == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else if (state.post == null) {
            Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(state.error ?: "内容暂时无法显示", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = viewModel::reload) { Icon(Icons.Outlined.Refresh, null); Text("重试") }
            }
        } else {
            val item = state.post!!
            val listState = rememberLazyListState()
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(13.dp),
            ) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (item.images.size > 1) {
                            val pagerState = rememberPagerState(pageCount = { item.images.size })
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Box(Modifier.requiredWidth(viewportWidth).offset(x = (-18).dp).aspectRatio(1f).background(MaterialTheme.colorScheme.surfaceVariant)) {
                                    HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                                        val sharedImageModifier = if (page == 0 && sharedElementsEnabled) with(sharedTransitionScope) {
                                            Modifier.heikaSharedPostImage(sharedTransitionScope, animatedVisibilityScope, item.cloudId.ifBlank { item.id.toString() }, isDetail = true, enabled = true)
                                        } else Modifier
                                        RetryableDetailImage(
                                            url = item.images[page], postId = item.cloudId, variant = "detail-full-$page",
                                            contentDescription = "${item.title}，第 ${page + 1} 张",
                                            imageLoader = imageLoader,
                                            contentScale = ContentScale.Fit,
                                            modifier = Modifier.fillMaxSize().then(sharedImageModifier),
                                        )
                                    }
                                }
                                Text("${pagerState.currentPage + 1} / ${item.images.size}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.align(Alignment.End))
                            }
                        } else item.images.forEachIndexed { index, image ->
                            val sharedImageModifier = if (index == 0 && sharedElementsEnabled) with(sharedTransitionScope) {
                                Modifier.heikaSharedPostImage(sharedTransitionScope, animatedVisibilityScope, item.cloudId.ifBlank { item.id.toString() }, isDetail = true, enabled = true)
                            } else Modifier
                            RetryableDetailImage(
                                url = image, postId = item.cloudId, variant = "detail-full-$index",
                                contentDescription = item.title,
                                imageLoader = imageLoader,
                                contentScale = ContentScale.FillWidth,
                                modifier = Modifier.requiredWidth(viewportWidth).offset(x = (-18).dp).heightIn(min = 180.dp).then(sharedImageModifier),
                            )
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                            Text(item.tag, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                            Icon(HeikaIcons.StarOutline, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                            if (item.hasRating) Text(String.format(java.util.Locale.US, "%.1f", item.ratingAverage), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                            else Text("待评级", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                            Spacer(Modifier.weight(1f))
                            Text("${item.viewCount} 阅读", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                        Text(item.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 22.sp, lineHeight = 31.sp, fontWeight = FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth().clickable(enabled = item.authorId != null) { item.authorId?.let(onAuthor) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (!item.authorAvatar.isNullOrBlank()) AsyncImage(item.authorAvatar, "${item.author}头像", imageLoader = imageLoader, contentScale = ContentScale.Crop, modifier = Modifier.size(38.dp).clip(androidx.compose.foundation.shape.CircleShape))
                            else Icon(HeikaIcons.Profile, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(38.dp).clip(androidx.compose.foundation.shape.CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).padding(8.dp))
                            Column(Modifier.weight(1f)) {
                                Text(item.author, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                Text(item.date, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            }
                            if (item.authorId != null) androidx.compose.material3.OutlinedButton(onClick = viewModel::toggleFollow, enabled = !state.followSending, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                                if (state.followSending) CircularProgressIndicator(Modifier.size(13.dp), strokeWidth = 1.7.dp)
                                else Text(if (state.following) "已关注" else "关注", fontSize = 11.sp)
                            }
                        }
                        val bodyFont = when (readingMode) { "focus" -> 16.sp; "night" -> 15.sp; else -> 14.sp }
                        val bodyLine = when (readingMode) { "focus" -> 28.sp; "night" -> 27.sp; else -> 24.sp }
                        Text(item.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = bodyFont, lineHeight = bodyLine)
                        if (item.channel == "ai") {
                            AiResourceDetails(
                                contentType = item.contentType,
                                resourceData = item.resourceData,
                                versions = state.aiVersions,
                                versionsLoading = state.aiVersionsLoading,
                                versionsError = state.aiVersionsError,
                                feedbackSending = state.aiFeedbackSending,
                                feedbackSubmitted = state.aiFeedbackSubmitted,
                                onRetryVersions = { viewModel.loadAiVersions(item, force = true) },
                                onSubmitFeedback = { kind, details -> viewModel.submitAiFeedback(kind, details) },
                            )
                        }
                        item.tags.takeIf { it.isNotEmpty() }?.let { tags ->
                            Text(tags.joinToString("  ") { "#$it" }, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                        }
                        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("评分", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            (1..5).forEach { score ->
                                RatingStar(score, (state.rating ?: 0) >= score, ratingColor(score), state.ratingAnimationKey, state.ratingAnimationScore, !state.ratingSending, onClick = { viewModel.rate(score) })
                            }
                            Spacer(Modifier.weight(1f))
                            val average by animateFloatAsState(state.average?.toFloat() ?: 0f, tween(HeikaMotion.rating, easing = HeikaMotion.standard), label = "post-rating-average")
                            Text(state.average?.let { String.format(java.util.Locale.US, "%.1f", average) } ?: "—", color = if (state.average != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            if (state.ratingSending) CircularProgressIndicator(Modifier.padding(start = 4.dp).size(14.dp), strokeWidth = 1.8.dp)
                        }
                        state.ratingError?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Icon(HeikaIcons.Comment, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(17.dp))
                            Text("评论 ${state.comments.size}", color = MaterialTheme.colorScheme.onBackground, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        state.notice?.let { message ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(message, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                                if (message.contains("登录")) TextButton(onClick = onLogin) { Text("登录") }
                            }
                        }
                    }
                }
                if (state.commentsLoading && state.comments.isEmpty()) item(key = "comments-loading") {
                    Text("正在加载评论…", Modifier.fillMaxWidth().padding(vertical = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
                state.commentsError?.let { error -> item(key = "comments-error") {
                    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(error, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                        TextButton(onClick = viewModel::retryComments) { Text("重试") }
                    }
                } }
                val roots = state.comments.filter { it.parentId == null || state.comments.none { parent -> parent.id == it.parentId } }
                val commentsById = state.comments.associateBy { it.id }
                val repliesByParent = state.comments.mapNotNull { comment -> comment.parentId?.let { it to comment } }.groupBy({ it.first }, { it.second })
                items(roots, key = { it.id }) { comment ->
                    Column(Modifier.fillMaxWidth().padding(vertical = 9.dp)) {
                        CommentRow(comment, onReply = { replyTo = comment.id }, onLike = { viewModel.toggleCommentLike(comment.id) }, onMore = { commentMenu = comment }, likeBusy = comment.id in state.commentLikesSending, replyEnabled = !state.sending)
                        val replies = buildList {
                            val visited = mutableSetOf<String>()
                            fun appendChildren(parentId: String, depth: Int) {
                                if (depth > 8) return
                                repliesByParent[parentId].orEmpty().forEach { child ->
                                    if (visited.add(child.id)) {
                                        add(child to depth)
                                        appendChildren(child.id, depth + 1)
                                    }
                                }
                            }
                            appendChildren(comment.id, 1)
                        }
                        if (replies.isNotEmpty()) {
                            TextButton(onClick = { expandedReplyThreads = if (comment.id in expandedReplyThreads) expandedReplyThreads - comment.id else expandedReplyThreads + comment.id }, modifier = Modifier.padding(start = 42.dp)) {
                                Text(if (comment.id in expandedReplyThreads) "收起回复" else "展开 ${replies.size} 条回复", fontSize = 11.sp)
                            }
                            if (comment.id in expandedReplyThreads) Column(Modifier.padding(start = 40.dp)) {
                                replies.forEach { (reply, depth) ->
                                    val targetName = reply.parentId?.let { commentsById[it]?.author }
                                    CommentRow(reply, onReply = { replyTo = reply.id }, onLike = { viewModel.toggleCommentLike(reply.id) }, onMore = { commentMenu = reply }, likeBusy = reply.id in state.commentLikesSending, reply = true, replyTargetName = targetName, replyEnabled = !state.sending, modifier = Modifier.padding(start = (depth.coerceAtMost(2) * 10).dp))
                                }
                            }
                        }
                        androidx.compose.material3.HorizontalDivider(Modifier.padding(top = 7.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = .36f), thickness = .5.dp)
                    }
                }
                if (state.commentsHasMore) item {
                    Text(
                        if (state.loadingMoreComments) "正在加载…" else "加载更多评论",
                        Modifier.fillMaxWidth().clickable(enabled = !state.loadingMoreComments) { viewModel.loadMoreComments() }.padding(12.dp),
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 12.sp,
                    )
                }
                if (state.comments.isEmpty() && !state.loading && !state.commentsLoading && state.commentsError == null) item { Text("暂无评论", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(vertical = 18.dp)) }
            }
            Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background).padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Column(Modifier.weight(1f)) {
                    if (replyTo != null) Row(Modifier.fillMaxWidth().padding(start = 5.dp, bottom = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("回复 ${state.comments.firstOrNull { it.id == replyTo }?.author ?: "评论"}", Modifier.weight(1f), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                        Text("取消", Modifier.clickable(enabled = !state.sending) { replyTo = null }.padding(5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                    }
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surface).padding(start = 15.dp, end = 5.dp, top = 5.dp, bottom = 5.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        BasicTextField(value = draft, onValueChange = { draft = it.take(1000) }, modifier = Modifier.weight(1f).heightIn(min = 40.dp, max = 112.dp).padding(vertical = 10.dp), enabled = !state.sending, maxLines = 4, textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface), decorationBox = { inner -> Box { if (draft.isEmpty()) Text("说点什么…", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp); inner() } })
                        IconButton(enabled = draft.isNotBlank() && !state.sending, onClick = { viewModel.comment(draft, replyTo) }) {
                            if (state.sending) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Icon(HeikaIcons.Publish, "发送评论", tint = if (draft.isNotBlank()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                InteractionIconButton(selected = state.liked, sending = state.interactionSending, outline = HeikaIcons.LikeOutline, filled = HeikaIcons.LikeFilled, description = "点赞", onClick = viewModel::toggleLike)
                Text("${state.likeCount ?: state.post?.likeCount ?: 0}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                InteractionIconButton(selected = state.saved, sending = state.interactionSending, outline = HeikaIcons.SaveOutline, filled = HeikaIcons.SaveFilled, description = "收藏", onClick = viewModel::toggleSaved)
                IconButton(onClick = { state.post?.let(onShare) }) { Icon(HeikaIcons.Share, "分享内容", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
    }
    }
    if (reportOpen) {
        val reasons = listOf("垃圾营销或重复内容", "骚扰、仇恨或攻击", "虚假或误导信息", "侵权或未经授权转载", "不适宜或危险内容", "其他")
        AlertDialog(
            onDismissRequest = { reportOpen = false; commentReport = null },
            title = { Text("举报内容") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Text("举报信息仅用于平台安全与人工复核。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    reasons.forEach { reason -> FilterChip(reason, reportReason == reason, { reportReason = reason }) }
                    OutlinedTextField(value = reportNote, onValueChange = { reportNote = it.take(300) }, label = { Text("补充说明（选填）") }, maxLines = 3)
                }
            },
            confirmButton = { TextButton(enabled = !state.operationSending, onClick = {
                commentReport?.let { viewModel.reportComment(it.id, reportReason, reportNote) } ?: viewModel.report(reportReason, reportNote)
                reportOpen = false
                commentReport = null
            }) { Text(if (state.operationSending) "提交中…" else "提交") } },
            dismissButton = { TextButton(onClick = { reportOpen = false; commentReport = null }) { Text("取消") } },
        )
    }
    commentMenu?.let { comment ->
        AlertDialog(
            onDismissRequest = { commentMenu = null },
            title = { Text("评论操作") },
            text = { Text(comment.body, maxLines = 4, overflow = TextOverflow.Ellipsis) },
            confirmButton = { TextButton(onClick = {
                (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("评论", comment.body))
                viewModel.showNotice("评论已复制")
                commentMenu = null
            }) { Icon(HeikaIcons.Copy, null); Text("复制") } },
            dismissButton = {
                Row {
                    TextButton(onClick = { replyTo = comment.id; commentMenu = null }) { Text("回复") }
                    TextButton(onClick = { commentReport = comment; reportReason = "垃圾营销或重复内容"; reportNote = ""; reportOpen = true; commentMenu = null }) { Text("举报") }
                    if (state.currentUserId != null && state.currentUserId == comment.authorId) TextButton(enabled = !state.operationSending, onClick = { commentDeleteConfirm = comment; commentMenu = null }) { Text("删除") }
                }
            },
        )
    }
    commentDeleteConfirm?.let { comment ->
        AlertDialog(
            onDismissRequest = { commentDeleteConfirm = null },
            title = { Text("删除评论？") },
            text = { Text("该操作不可撤销。") },
            confirmButton = { TextButton(enabled = !state.operationSending, onClick = { viewModel.deleteComment(comment.id); commentDeleteConfirm = null }) { Text("删除") } },
            dismissButton = { TextButton(onClick = { commentDeleteConfirm = null }) { Text("取消") } },
        )
    }
    if (postDeleteConfirm) AlertDialog(
        onDismissRequest = { if (!state.operationSending) postDeleteConfirm = false },
        title = { Text("删除内容？") },
        text = { Text("删除后内容将从社区移除，此操作不可撤销。") },
        confirmButton = { TextButton(enabled = !state.operationSending, onClick = { viewModel.deletePost(onBack); postDeleteConfirm = false }) { Text(if (state.operationSending) "删除中…" else "删除") } },
        dismissButton = { TextButton(enabled = !state.operationSending, onClick = { postDeleteConfirm = false }) { Text("取消") } },
    )
    if (feedbackOpen) {
        AlertDialog(
            onDismissRequest = { feedbackOpen = false },
            title = { Text("内容反馈") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip("问题", feedbackCategory == "problem", { feedbackCategory = "problem" })
                        FilterChip("建议", feedbackCategory == "suggestion", { feedbackCategory = "suggestion" })
                        FilterChip("其他", feedbackCategory == "other", { feedbackCategory = "other" })
                    }
                    OutlinedTextField(value = feedbackText, onValueChange = { feedbackText = it.take(3000) }, label = { Text("反馈内容（至少 10 字）") }, minLines = 3, maxLines = 5)
                }
            },
            confirmButton = { TextButton(enabled = feedbackText.trim().length >= 10 && !state.operationSending, onClick = { viewModel.submitContentFeedback(feedbackCategory, "内容：${state.post?.title.orEmpty()}\n${feedbackText.trim()}"); feedbackOpen = false }) { Text(if (state.operationSending) "提交中…" else "提交") } },
            dismissButton = { TextButton(onClick = { feedbackOpen = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun InteractionIconButton(selected: Boolean, sending: Boolean, outline: androidx.compose.ui.graphics.vector.ImageVector, filled: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) .88f else 1f, tween(140), label = "${description}-press")
    IconButton(onClick = onClick, enabled = !sending, interactionSource = source) {
        if (sending) CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 1.8.dp)
        else Icon(if (selected) filled else outline, description, tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.graphicsLayer { scaleX = scale; scaleY = scale })
    }
}

@Composable
private fun CommentRow(
    comment: NativeComment,
    onReply: () -> Unit,
    onLike: () -> Unit,
    onMore: () -> Unit,
    likeBusy: Boolean,
    reply: Boolean = false,
    replyTargetName: String? = null,
    replyEnabled: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val imageLoader = LocalHeikaImageLoader.current
    Row(modifier.fillMaxWidth().padding(start = if (reply) 4.dp else 0.dp), horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.Top) {
        if (!comment.authorAvatar.isNullOrBlank()) AsyncImage(comment.authorAvatar, "${comment.author}头像", imageLoader = imageLoader, contentScale = ContentScale.Crop, modifier = Modifier.size(if (reply) 28.dp else 36.dp).clip(androidx.compose.foundation.shape.CircleShape))
        else Icon(HeikaIcons.Profile, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(if (reply) 28.dp else 36.dp).clip(androidx.compose.foundation.shape.CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).padding(6.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(comment.author, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (replyTargetName == null) comment.body else "回复 $replyTargetName：${comment.body}", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, lineHeight = 19.sp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(comment.createdAt.take(10), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Text("回复", Modifier.clickable(enabled = replyEnabled, onClick = onReply).padding(horizontal = 9.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onLike, enabled = !likeBusy, modifier = Modifier.size(32.dp)) {
                    Icon(if (comment.liked) HeikaIcons.LikeFilled else HeikaIcons.LikeOutline, "评论点赞", tint = if (comment.liked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                }
                if (comment.likeCount > 0) Text(comment.likeCount.toString(), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                androidx.compose.material3.IconButton(onClick = onMore, modifier = Modifier.size(32.dp)) {
                    Icon(HeikaIcons.More, "评论操作", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(17.dp))
                }
            }
        }
    }
}

@Composable
private fun RetryableDetailImage(
    url: String,
    postId: String,
    variant: String,
    contentDescription: String,
    imageLoader: coil3.ImageLoader,
    contentScale: ContentScale,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var attempt by remember(url, postId, variant) { mutableStateOf(0) }
    var failed by remember(url, postId, variant) { mutableStateOf(false) }
    val request = remember(context, url, postId, variant, attempt) {
        ImageRequest.Builder(context).data(url)
            .memoryCacheKey(imageCacheKey(postId, url, variant))
            .diskCacheKey(imageCacheKey(postId, url, variant))
            .crossfade(150).build()
    }
    Box(modifier) {
        AsyncImage(
            model = request,
            contentDescription = contentDescription,
            imageLoader = imageLoader,
            contentScale = contentScale,
            modifier = Modifier.fillMaxSize(),
            onState = { failed = it is coil3.compose.AsyncImagePainter.State.Error },
        )
        if (failed) {
            Text(
                "图片加载失败 · 重试",
                Modifier.align(Alignment.Center).clip(RoundedCornerShape(8.dp))
                    .background(Color.Black.copy(alpha = 0.62f))
                    .clickable { attempt++; failed = false }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                color = Color.White,
                fontSize = 12.sp,
            )
        }
    }
}

private fun ratingColor(score: Int) = Color(0xFFD0B571)

@Composable
private fun RatingStar(
    score: Int,
    selected: Boolean,
    color: Color,
    animationKey: Int,
    animationScore: Int,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val scale = remember { Animatable(1f) }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressScale by animateFloatAsState(if (pressed) .88f else 1f, tween(HeikaMotion.quick), label = "rating-star-press-$score")
    val haptics = LocalHapticFeedback.current
    val tint by animateColorAsState(
        targetValue = if (selected) color else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f),
        animationSpec = tween(190),
        label = "rating-star-color-$score",
    )
    LaunchedEffect(animationKey, animationScore, score) {
        if (animationKey == 0 || score > animationScore) return@LaunchedEffect
        delay((score - 1) * 58L)
        scale.animateTo(1.16f, tween(110))
        scale.animateTo(1f, tween(180))
    }
    Box(
        modifier = Modifier.size(40.dp)
            .selectable(selected = selected, interactionSource = interaction, indication = null, enabled = enabled, role = Role.RadioButton) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (selected) HeikaIcons.StarFilled else HeikaIcons.StarOutline,
            contentDescription = "$score 星",
            modifier = Modifier.graphicsLayer { scaleX = scale.value * pressScale; scaleY = scale.value * pressScale }.size(22.dp),
            tint = tint,
        )
    }
}
