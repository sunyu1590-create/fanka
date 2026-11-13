@file:OptIn(androidx.compose.animation.ExperimentalSharedTransitionApi::class)

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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.feature.discovery.FeedCard
import com.heika.nativeapp.feature.exploration.ExplorationLogic
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaRadii
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.LocalHeikaImageLoader

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
    onDailyTasks: () -> Unit = onExplore,
    onManageWorks: () -> Unit = {},
    sharedTransitionScope: androidx.compose.animation.SharedTransitionScope? = null,
    animatedVisibilityScope: androidx.compose.animation.AnimatedVisibilityScope? = null,
    sharedElementsEnabled: Boolean = false,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var selected by remember(userId) { mutableStateOf("works") }
    var hasResumedOnce by remember(userId) { mutableStateOf(false) }
    val lifecycleOwner = LocalLifecycleOwner.current
    val worksState = rememberLazyStaggeredGridState()
    val bookmarksState = rememberLazyStaggeredGridState()
    val likedState = rememberLazyStaggeredGridState()
    val gridState = when (selected) { "bookmarks" -> bookmarksState; "liked" -> likedState; else -> worksState }
    LaunchedEffect(userId) { viewModel.load(userId) }
    DisposableEffect(lifecycleOwner, userId, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                if (hasResumedOnce && userId == null) viewModel.refreshExplorationSummary()
                hasResumedOnce = true
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

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
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalItemSpacing = 12.dp,
            ) {
                item(span = StaggeredGridItemSpan.FullLine) {
                    Column {
                        Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                            AsyncImage(profile.avatar, contentDescription = "${profile.nickname}头像", imageLoader = LocalHeikaImageLoader.current, contentScale = ContentScale.Crop, modifier = Modifier.size(56.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                    Text(profile.nickname, color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    if (userId == null) Text("LV${state.stats.level}", Modifier.clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = .12f)).padding(horizontal = 7.dp, vertical = 3.dp), color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                                }
                                if (profile.bio.isNotBlank()) Text(profile.bio, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                                Text("HEIKA ID · ${profile.id.take(8).uppercase()}", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .72f), fontSize = 9.sp, modifier = Modifier.padding(top = 2.dp))
                                val attributes = state.profileAttributes
                                val visibleDetails = buildList {
                                    if (attributes.visibility["gender"] == true && attributes.gender.isNotBlank()) {
                                        val genderLabel = when (attributes.gender) { "female" -> "女"; "male" -> "男"; "nonbinary" -> "非二元"; "undisclosed" -> "不愿透露"; else -> "" }
                                        if (genderLabel.isNotBlank()) add("性别 $genderLabel")
                                    }
                                    if (attributes.visibility["mbti"] == true && attributes.mbti.isNotBlank()) add(attributes.mbti)
                                    if (attributes.visibility["birthday"] == true && attributes.birthday.isNotBlank()) add(attributes.birthday)
                                    if (attributes.visibility["hobbies"] == true && attributes.hobbies.isNotEmpty()) add("兴趣 ${attributes.hobbies.take(3).joinToString("、")}")
                                }
                                if (visibleDetails.isNotEmpty()) Text(visibleDetails.joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .82f), fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
                            }
                            if (userId == null) Icon(HeikaIcons.Edit, "编辑资料", Modifier.size(42.dp).clip(CircleShape).clickable(onClick = onEditProfile).padding(10.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (state.own) {
                            Row(Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 4.dp), horizontalArrangement = Arrangement.SpaceAround) {
                                ProfileStat(state.stats.totalOpened.toString(), "累计翻卡")
                                ProfileStat(state.stats.streak.toString(), "连续探索")
                                ProfileStat(state.stats.bookmarks.toString(), "我的收藏")
                            }
                            val levelProgress = ExplorationLogic.progression(state.stats.experience)
                            Column(Modifier.fillMaxWidth().padding(top = 5.dp, bottom = 8.dp).clip(RoundedCornerShape(HeikaRadii.surface)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 12.dp, vertical = 7.dp)) {
                                Row(
                                    Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(onClick = onExplore).padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                                ) {
                                    Text("LV${levelProgress.current.level}", Modifier.clip(RoundedCornerShape(7.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = .13f)).padding(horizontal = 7.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                                    Column(Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(levelProgress.current.reward, Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text(levelProgress.next?.let { "${state.stats.experience}/${it.threshold} EXP" } ?: "${state.stats.experience} EXP · 满级", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, maxLines = 1)
                                        }
                                        LinearProgressIndicator(
                                            progress = { levelProgress.percent / 100f },
                                            modifier = Modifier.fillMaxWidth().padding(top = 5.dp).height(3.dp).clip(CircleShape),
                                            color = MaterialTheme.colorScheme.primary,
                                            trackColor = MaterialTheme.colorScheme.surfaceVariant,
                                        )
                                    }
                                    Icon(HeikaIcons.Forward, "进入探索中心", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(17.dp))
                                }
                                HorizontalDivider(Modifier.padding(vertical = 3.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .55f))
                                Row(
                                    Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(onClick = onDailyTasks).padding(vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                                ) {
                                    Text("今日探索任务", color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                                    Text(state.stats.dailyTasks?.let { "${state.stats.completedDailyTasks}/$it 已完成" } ?: "进度同步中", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, maxLines = 1)
                                    Text(state.stats.dailyExperience?.let { "可得 $it EXP" } ?: "", color = MaterialTheme.colorScheme.primary, fontSize = 9.sp, maxLines = 1)
                                    Icon(HeikaIcons.Forward, "进入今日任务", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(17.dp))
                                }
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
                    }
                }
                item(span = StaggeredGridItemSpan.FullLine) { ProfileTabBar(selected, compact = true) { selected = it } }
                if (state.own && selected == "works") item(span = StaggeredGridItemSpan.FullLine) {
                    Row(Modifier.fillMaxWidth().padding(top = 1.dp, bottom = 1.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${state.posts.size} 篇作品", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        Text("作品管理", Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = onManageWorks).padding(horizontal = 10.dp, vertical = 7.dp), color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                    }
                }
                if (posts.isEmpty()) item(span = StaggeredGridItemSpan.FullLine) {
                    Text(when (selected) { "works" -> "还没有公开作品。"; "bookmarks" -> "还没有可见收藏。"; else -> "还没有点赞内容。" }, Modifier.fillMaxWidth().padding(vertical = 28.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
                items(posts, key = { it.cloudId.ifBlank { it.id.toString() } }) { post ->
                    val isDraft = post.rawJson.let { runCatching { org.json.JSONObject(it).optString("status") == "draft" }.getOrDefault(false) }
                    FeedCard(post, onClick = {
                        if (isDraft) {
                            onDraft(post)
                        } else {
                            onPost(post)
                        }
                    }, sharedTransitionScope = sharedTransitionScope, animatedVisibilityScope = animatedVisibilityScope, sharedElementsEnabled = sharedElementsEnabled && !isDraft)
                }
                if (state.loadingMore == when (selected) { "works" -> "own"; "bookmarks" -> "bookmarks"; else -> "liked" }) item(span = StaggeredGridItemSpan.FullLine) {
                    CircularProgressIndicator(Modifier.padding(14.dp).size(20.dp), strokeWidth = 2.dp)
                }
            }
            if (gridState.firstVisibleItemIndex >= 2) {
                ProfileTabBar(selected, modifier = Modifier.align(Alignment.TopCenter).fillMaxWidth().background(MaterialTheme.colorScheme.background), compact = true) { selected = it }
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
private fun ProfileTabBar(selected: String, modifier: Modifier = Modifier, compact: Boolean = false, onSelect: (String) -> Unit) {
    Column(modifier) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            ProfileTabs.forEach { (title, key) ->
                Box(Modifier.weight(1f).clickable { onSelect(key) }.padding(vertical = if (compact) 10.dp else 13.dp), contentAlignment = Alignment.Center) {
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
        Icon(HeikaIcons.Settings, "设置", Modifier.size(38.dp).clip(CircleShape).clickable(onClick = onSettings).padding(9.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
