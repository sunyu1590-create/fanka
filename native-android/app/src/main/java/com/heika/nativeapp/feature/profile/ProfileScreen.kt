package com.heika.nativeapp.feature.profile

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.runtime.snapshotFlow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.feature.discovery.FeedCard
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaRadii

private val ProfileTabs = listOf("我的作品" to "works", "我的收藏" to "bookmarks", "我的点赞" to "liked")

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ProfileScreen(
    userId: String?,
    onBack: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    onDraft: (HeikaPost) -> Unit,
    onSettings: () -> Unit,
    onMembership: () -> Unit,
    onMessage: (String) -> Unit,
    onLogin: () -> Unit,
    onEditProfile: () -> Unit = {},
    onExplore: () -> Unit = {},
    onManageWorks: () -> Unit = {},
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var selected by remember(userId) { mutableStateOf("works") }
    val worksState = rememberLazyStaggeredGridState()
    val bookmarksState = rememberLazyStaggeredGridState()
    val likedState = rememberLazyStaggeredGridState()
    val gridState = when (selected) { "bookmarks" -> bookmarksState; "liked" -> likedState; else -> worksState }
    LaunchedEffect(userId) { viewModel.load(userId) }

    if (state.loading && state.profile == null) {
        Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            if (userId == null) ProfileBrandHeader(onSettings, onMembership) else BackHeader("用户主页", onBack)
            Column(Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(13.dp), verticalAlignment = Alignment.CenterVertically) {
                    SkeletonBlock(62.dp, CircleShape)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SkeletonBlock(150.dp, RoundedCornerShape(6.dp), 17.dp)
                        SkeletonBlock(210.dp, RoundedCornerShape(6.dp), 12.dp)
                        SkeletonBlock(115.dp, RoundedCornerShape(6.dp), 10.dp)
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { repeat(3) { Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) { SkeletonBlock(28.dp, RoundedCornerShape(6.dp), 17.dp); SkeletonBlock(52.dp, RoundedCornerShape(6.dp), 10.dp) } } }
                SkeletonBlock(Modifier.fillMaxWidth(), 60.dp, RoundedCornerShape(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    repeat(2) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                            SkeletonBlock(Modifier.fillMaxWidth(), 160.dp, RoundedCornerShape(HeikaRadii.feedCard))
                            SkeletonBlock(120.dp, RoundedCornerShape(6.dp), 12.dp)
                        }
                    }
                }
            }
        }
        return
    }
    if (state.profile == null) {
        Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            if (userId == null) ProfileBrandHeader(onSettings, onMembership) else BackHeader("用户主页", onBack)
            Column(Modifier.fillMaxWidth().padding(28.dp), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(state.error ?: "个人主页暂不可用", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(if (state.error?.contains("登录") == true) "登录" else "重试", Modifier.clickable { if (state.error?.contains("登录") == true) onLogin() else viewModel.load(userId, force = true) }.padding(12.dp), color = MaterialTheme.colorScheme.primary)
            }
        }
        return
    }

    val profile = state.profile!!
    val posts = when (selected) { "bookmarks" -> state.bookmarks; "liked" -> state.liked; else -> state.posts }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (userId == null) ProfileBrandHeader(onSettings, onMembership) else BackHeader("用户主页", onBack)
        Box(Modifier.fillMaxSize()) {
            val swipeThreshold = with(LocalDensity.current) { 54.dp.toPx() }
            LazyVerticalStaggeredGrid(
                columns = StaggeredGridCells.Fixed(2), state = gridState,
                modifier = Modifier.fillMaxSize().pointerInput(selected) {
                    var dragDistance = 0f
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { change, amount -> change.consume(); dragDistance += amount },
                        onDragEnd = {
                            if (kotlin.math.abs(dragDistance) >= swipeThreshold) {
                                val index = ProfileTabs.indexOfFirst { it.second == selected }.coerceAtLeast(0)
                                selected = ProfileTabs[(index + if (dragDistance < 0) 1 else -1).coerceIn(ProfileTabs.indices)].second
                            }
                            dragDistance = 0f
                        },
                        onDragCancel = { dragDistance = 0f },
                    )
                },
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 0.dp, bottom = 128.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalItemSpacing = 15.dp,
            ) {
                item(span = StaggeredGridItemSpan.FullLine) {
                    Column {
                        Row(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                            AsyncImage(profile.avatar, contentDescription = "${profile.nickname}头像", contentScale = ContentScale.Crop, modifier = Modifier.size(62.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                    Text(profile.nickname, color = MaterialTheme.colorScheme.onBackground, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    if (userId == null) Text(profile.tier.uppercase(), Modifier.clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = .12f)).padding(horizontal = 7.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.primary, fontSize = 9.sp)
                                }
                                Text(profile.bio.ifBlank { "记录生活，继续探索。" }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
                                Text("HEIKA ID · ${profile.id.take(8).uppercase()}", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .78f), fontSize = 9.sp, modifier = Modifier.padding(top = 5.dp))
                            }
                            if (userId == null) Icon(Icons.Outlined.Edit, "编辑资料", Modifier.size(38.dp).clip(CircleShape).clickable(onClick = onEditProfile).padding(9.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (state.own) {
                            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceAround) {
                                ProfileStat(state.stats.totalOpened.toString(), "累计翻卡")
                                ProfileStat(state.stats.streak.toString(), "连续探索")
                                ProfileStat(state.stats.bookmarks.toString(), "我的收藏")
                            }
                            Row(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 13.dp).clip(RoundedCornerShape(HeikaRadii.surface)).background(MaterialTheme.colorScheme.surface).clickable(onClick = onExplore).padding(horizontal = 14.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.EmojiEvents, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                Column(Modifier.weight(1f).padding(start = 10.dp)) {
                                    Text("探索成长 · LV.${state.stats.level}", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                    Text("${state.stats.experience} EXP · ${state.stats.progress}% 至下一级", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
                                }
                                Icon(Icons.Outlined.ChevronRight, "探索中心", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        } else {
                            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                ProfileStat(state.posts.size.toString(), "作品")
                                ProfileStat(state.followerCount.toString(), "关注者")
                                if (profile.showBookmarks) ProfileStat(state.bookmarks.size.toString(), "收藏")
                            }
                        }
                        if (state.refreshing) Text("正在同步最新资料…", Modifier.padding(bottom = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        state.error?.let { error ->
                            Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(error, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                                Text("重试", Modifier.clickable { viewModel.load(userId, force = true) }.padding(8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                            }
                        }
                        state.notice?.let { Text(it, Modifier.padding(bottom = 8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp) }
                        if (!state.own) Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 10.dp)) {
                            Text(if (state.following) "已关注 · ${state.followerCount}" else "关注 · ${state.followerCount}", Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surface).clickable(onClick = viewModel::toggleFollow).padding(11.dp), color = MaterialTheme.colorScheme.onBackground)
                            Text("发私信", Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surface).clickable { onMessage(profile.id) }.padding(11.dp), color = MaterialTheme.colorScheme.onBackground)
                        }
                        if (state.own && selected == "works" && state.drafts.isNotEmpty()) {
                            Text("草稿 ${state.drafts.size} 篇 · 继续编辑", Modifier.fillMaxWidth().clickable { onDraft(state.drafts.first()) }.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                        }
                        if (state.own && selected == "works") {
                            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text("我的作品", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                                Text("作品管理  ›", Modifier.clickable(onClick = onManageWorks).padding(8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                                Text("${state.posts.size} 篇", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            }
                        }
                    }
                }
                item(span = StaggeredGridItemSpan.FullLine) { ProfileTabBar(selected) { selected = it } }
                if (posts.isEmpty()) item(span = StaggeredGridItemSpan.FullLine) {
                    Text(when (selected) { "works" -> "还没有公开作品。"; "bookmarks" -> "还没有可见收藏。"; else -> "还没有点赞内容。" }, Modifier.fillMaxWidth().padding(vertical = 28.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
                items(posts, key = { it.cloudId.ifBlank { it.id.toString() } }) { post ->
                    FeedCard(post) { if (post.rawJson.let { runCatching { org.json.JSONObject(it).optString("status") == "draft" }.getOrDefault(false) }) onDraft(post) else onPost(post) }
                }
                if (state.loadingMore == when (selected) { "works" -> "own"; "bookmarks" -> "bookmarks"; else -> "liked" }) item(span = StaggeredGridItemSpan.FullLine) {
                    CircularProgressIndicator(Modifier.padding(14.dp).size(20.dp), strokeWidth = 2.dp)
                }
            }
            if (gridState.firstVisibleItemIndex >= 2) {
                ProfileTabBar(selected, modifier = Modifier.align(Alignment.TopCenter).fillMaxWidth().background(MaterialTheme.colorScheme.background)) { selected = it }
            }
        }
    }
    LaunchedEffect(selected, gridState, state.own, state.hasMoreWorks, state.hasMoreBookmarks, state.hasMoreLiked, state.loadingMore) {
        snapshotFlow { gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { lastVisible ->
                val hasMore = when (selected) { "works" -> state.hasMoreWorks; "bookmarks" -> state.hasMoreBookmarks; else -> state.hasMoreLiked }
                if (state.own && hasMore && lastVisible >= gridState.layoutInfo.totalItemsCount - 4) {
                    viewModel.loadMore(when (selected) { "works" -> "own"; "bookmarks" -> "bookmarks"; else -> "liked" })
                }
            }
    }
}

@Composable
private fun ProfileTabBar(selected: String, modifier: Modifier = Modifier, onSelect: (String) -> Unit) {
    Column(modifier) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            ProfileTabs.forEach { (title, key) ->
                Box(Modifier.weight(1f).clickable { onSelect(key) }.padding(vertical = 13.dp), contentAlignment = Alignment.Center) {
                    Text(title, color = if (selected == key) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = if (selected == key) FontWeight.SemiBold else FontWeight.Normal)
                }
            }
        }
        BoxWithConstraints(Modifier.fillMaxWidth().height(2.dp)) {
            val tabWidth = maxWidth / 3
            val indicatorOffset by animateDpAsState(tabWidth * ProfileTabs.indexOfFirst { it.second == selected }.coerceAtLeast(0), label = "profile-tab-indicator")
            Box(Modifier.offset(x = indicatorOffset).width(tabWidth).height(2.dp).background(MaterialTheme.colorScheme.primary))
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .45f))
    }
}

@Composable
private fun ProfileBrandHeader(onSettings: () -> Unit, onMembership: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(58.dp).padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("黑卡", color = MaterialTheme.colorScheme.onBackground, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Text("HEIKA", Modifier.padding(start = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, letterSpacing = 2.sp)
        Spacer(Modifier.weight(1f))
        Text("会员中心", Modifier.clickable(onClick = onMembership).padding(horizontal = 8.dp, vertical = 10.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
        Icon(Icons.Outlined.Settings, "设置", Modifier.size(38.dp).clip(CircleShape).clickable(onClick = onSettings).padding(9.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ProfileStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(value, color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
    }
}

@Composable
private fun SkeletonBlock(width: androidx.compose.ui.unit.Dp, shape: androidx.compose.ui.graphics.Shape, height: androidx.compose.ui.unit.Dp = width) {
    Box(Modifier.size(width = width, height = height).clip(shape).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .72f)))
}

@Composable
private fun SkeletonBlock(modifier: Modifier, height: androidx.compose.ui.unit.Dp, shape: androidx.compose.ui.graphics.Shape) {
    Box(modifier.height(height).clip(shape).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .72f)))
}
