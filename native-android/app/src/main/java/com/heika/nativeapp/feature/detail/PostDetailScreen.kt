package com.heika.nativeapp.feature.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkBorder
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.FilterChip

@Composable
fun PostDetailScreen(
    post: HeikaPost? = null,
    postKey: String? = null,
    onBack: () -> Unit,
    onAuthor: (String) -> Unit,
    onLogin: () -> Unit,
    onShare: (HeikaPost) -> Unit,
    viewModel: PostDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var draft by remember(post?.cloudId, postKey) { mutableStateOf("") }
    var replyTo by remember(post?.cloudId, postKey) { mutableStateOf<String?>(null) }
    var reportOpen by remember(post?.cloudId, postKey) { mutableStateOf(false) }
    var reportReason by remember { mutableStateOf("垃圾营销或重复内容") }
    var reportNote by remember { mutableStateOf("") }
    LaunchedEffect(state.commentSubmitted) {
        if (state.commentSubmitted > 0) {
            draft = ""
            replyTo = null
        }
    }
    LaunchedEffect(post?.cloudId, postKey) {
        if (post != null) viewModel.load(post) else if (!postKey.isNullOrBlank()) viewModel.loadByKey(postKey)
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("内容详情", onBack)
        if (state.loading && state.post == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else if (state.post == null) {
            Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(state.error ?: "内容暂时无法显示", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = viewModel::reload) { Icon(Icons.Outlined.Refresh, null); Text("重试") }
            }
        } else {
            val item = state.post!!
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(13.dp),
            ) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        item.images.forEach { image ->
                            AsyncImage(
                                model = image,
                                contentDescription = item.title,
                                contentScale = ContentScale.FillWidth,
                                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)),
                            )
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                            Text(item.tag, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                            if (item.hasRating) Text("★ ${"%.1f".format(item.ratingAverage)}", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                            else Text("★ 待评级", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                            Spacer(Modifier.weight(1f))
                            Text("${item.viewCount} 阅读", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                        Text(item.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 22.sp, lineHeight = 31.sp, fontWeight = FontWeight.SemiBold)
                        Text(item.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 24.sp)
                        item.tags.takeIf { it.isNotEmpty() }?.let { tags ->
                            Text(tags.joinToString("  ") { "#$it" }, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                        }
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f).clickable(enabled = item.authorId != null) { item.authorId?.let(onAuthor) }) {
                                Text(item.author, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                Text(item.date, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            }
                            if (item.authorId != null) Text(if (state.following) "已关注" else "关注", Modifier.clickable { viewModel.toggleFollow() }.padding(horizontal = 10.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            IconButton(onClick = viewModel::toggleLike) { Icon(Icons.Outlined.FavoriteBorder, "点赞", tint = if (state.liked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                            Text("${item.likeCount + if (state.liked) 1 else 0}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                            IconButton(onClick = viewModel::toggleSaved) { Icon(Icons.Outlined.BookmarkBorder, "收藏", tint = if (state.saved) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                            Text("${if (state.saved) "已收藏" else "收藏"}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                            Spacer(Modifier.weight(1f))
                            if (state.average != null) Text("★ ${"%.1f".format(state.average)} · ${state.ratingCount}", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("为内容评分", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                            (1..5).forEach { score ->
                                Text(if ((state.rating ?: 0) >= score) "★" else "☆", Modifier.clickable { viewModel.rate(score) }.padding(4.dp), color = MaterialTheme.colorScheme.primary, fontSize = 19.sp)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                            Text("分享", Modifier.clickable { onShare(item) }.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp)
                            Text("举报", Modifier.clickable { reportOpen = true }.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        }
                        Text("评论 ${state.comments.size}", Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onBackground, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        state.notice?.let { message ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(message, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                                if (message.contains("登录")) TextButton(onClick = onLogin) { Text("登录") }
                            }
                        }
                    }
                }
                items(state.comments, key = { it.id }) { comment ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(comment.author, color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.weight(1f))
                            Text("回复", Modifier.clickable { replyTo = comment.id }.padding(4.dp), color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                        }
                        Text(comment.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 19.sp)
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
                if (state.comments.isEmpty() && !state.loading) item { Text("还没有评论，来写下第一条。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp) }
            }
            Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it.take(1000) },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text(if (replyTo == null) "写下你的评论" else "回复评论…") },
                    maxLines = 3,
                )
                IconButton(enabled = draft.isNotBlank() && !state.sending, onClick = { viewModel.comment(draft, replyTo) }) {
                    if (state.sending) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Icon(Icons.Outlined.Send, "发送评论", tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
    if (reportOpen) {
        val reasons = listOf("垃圾营销或重复内容", "骚扰、仇恨或攻击", "虚假或误导信息", "侵权或未经授权转载", "不适宜或危险内容", "其他")
        AlertDialog(
            onDismissRequest = { reportOpen = false },
            title = { Text("举报内容") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Text("举报信息仅用于平台安全与人工复核。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    reasons.forEach { reason -> FilterChip(reason, reportReason == reason, { reportReason = reason }) }
                    OutlinedTextField(value = reportNote, onValueChange = { reportNote = it.take(300) }, label = { Text("补充说明（选填）") }, maxLines = 3)
                }
            },
            confirmButton = { TextButton(onClick = { viewModel.report(reportReason, reportNote); reportOpen = false }) { Text("提交") } },
            dismissButton = { TextButton(onClick = { reportOpen = false }) { Text("取消") } },
        )
    }
}
