@file:OptIn(androidx.compose.animation.ExperimentalSharedTransitionApi::class)

package com.heika.nativeapp.feature.search

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.feature.discovery.FeedCard
import com.heika.nativeapp.ui.LocalHeikaImageLoader

private val searchKinds = listOf("all" to "综合", "content" to "内容", "people" to "用户", "topics" to "话题", "ai" to "AI 资源")

@Composable
fun SearchScreen(
    onBack: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    onProfile: (String) -> Unit,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(
            Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            IconButton(onClick = onBack) { Icon(Icons.Outlined.ArrowBack, contentDescription = "返回", tint = MaterialTheme.colorScheme.onBackground) }
            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::setQuery,
                modifier = Modifier.weight(1f),
                placeholder = { Text("搜索内容、用户或话题", fontSize = 13.sp) },
                singleLine = true,
                shape = RoundedCornerShape(11.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    focusManager.clearFocus()
                    keyboard?.hide()
                    viewModel.search()
                }),
                trailingIcon = {
                    if (state.query.isNotEmpty()) IconButton(onClick = { viewModel.setQuery("") }) {
                        Icon(Icons.Outlined.Close, contentDescription = "清空", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
            )
            TextButton(onClick = {
                focusManager.clearFocus()
                keyboard?.hide()
                viewModel.search()
            }, enabled = state.query.isNotBlank() && !state.loading) {
                Text("搜索", color = MaterialTheme.colorScheme.primary, fontSize = 13.sp)
            }
        }

        if (state.submittedQuery.isNotBlank()) {
            LazyRow(
                Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 18.dp),
                horizontalArrangement = Arrangement.spacedBy(22.dp),
            ) {
                items(searchKinds, key = { it.first }) { (key, label) ->
                    SearchKindTab(label, selected = state.kind == key) { viewModel.setKind(key) }
                }
            }
        }

        state.error?.let { error ->
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(error, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                TextButton(onClick = viewModel::search) { Icon(Icons.Outlined.Refresh, null, Modifier.size(16.dp)); Text("重试") }
            }
        }

        if (state.submittedQuery.isBlank()) {
            SearchLanding(
                state = state,
                onTopic = viewModel::submitRecentSearch,
                onRecent = viewModel::submitRecentSearch,
                onClearRecent = viewModel::clearRecentSearches,
                onRetryTopics = viewModel::loadHotTopics,
            )
        } else if (state.loading && state.posts.isEmpty() && state.people.isEmpty() && state.topics.isEmpty() && state.aiPosts.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(24.dp), color = MaterialTheme.colorScheme.primary, strokeWidth = 2.dp)
            }
        } else {
            SearchResults(state, onPost, onProfile, viewModel::setKind, viewModel::submitTopicSearch, viewModel::loadMore)
        }
    }
}

@Composable
private fun SearchKindTab(label: String, selected: Boolean, onClick: () -> Unit) {
    val color by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant,
        tween(220), label = "search-kind-color",
    )
    val indicatorWidth by animateDpAsState(if (selected) 20.dp else 0.dp, tween(240), label = "search-kind-indicator")
    Column(
        Modifier.clickable(onClick = onClick).padding(top = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(label, color = color, fontSize = 13.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
        Box(Modifier.width(indicatorWidth).height(2.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
    }
}

@Composable
private fun SearchLanding(
    state: SearchState,
    onTopic: (String) -> Unit,
    onRecent: (String) -> Unit,
    onClearRecent: () -> Unit,
    onRetryTopics: () -> Unit,
) {
    val listState = rememberLazyListState()
    LazyColumn(
        Modifier.fillMaxSize(),
        state = listState,
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 17.dp, bottom = 132.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        item(key = "hot-heading") {
            Row(Modifier.fillMaxWidth().padding(bottom = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("实时热搜", color = MaterialTheme.colorScheme.onBackground, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                    Text("按内容量与参与人数排序", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
                }
                if (state.loadingHotTopics) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                else IconButton(onClick = onRetryTopics) { Icon(Icons.Outlined.Refresh, "刷新热搜", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp)) }
            }
        }
        if (state.hotTopicsError != null && state.hotTopics.isEmpty()) {
            item(key = "hot-error") {
                Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(state.hotTopicsError, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    TextButton(onClick = onRetryTopics) { Text("重试") }
                }
            }
        } else if (!state.loadingHotTopics && state.hotTopics.isEmpty()) {
            item(key = "hot-empty") {
                Text("暂时没有热门话题，搜索感兴趣的内容试试。", Modifier.padding(vertical = 18.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
        } else {
            itemsIndexed(state.hotTopics, key = { _, topic -> "hot-${topic.id}" }) { index, topic ->
                HotTopicRow(index + 1, topic) { onTopic(topic.name) }
            }
        }
        if (state.recentSearches.isNotEmpty()) {
            item(key = "recent-heading") {
                Row(Modifier.fillMaxWidth().padding(top = 25.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("最近搜索", Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    TextButton(onClick = onClearRecent) { Icon(Icons.Outlined.DeleteOutline, null, Modifier.size(16.dp)); Text("清除", fontSize = 11.sp) }
                }
            }
            items(state.recentSearches, key = { "recent-$it" }) { term ->
                Row(
                    Modifier.fillMaxWidth().clickable { onRecent(term) }.padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(11.dp),
                ) {
                    Icon(Icons.Outlined.Search, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(term, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp)
                }
            }
        }
    }
}

@Composable
private fun HotTopicRow(rank: Int, topic: SearchTopic, onClick: () -> Unit) {
    val rankColor = if (rank <= 3) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        Text(rank.toString().padStart(2, '0'), Modifier.width(22.dp), color = rankColor, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("#${topic.name}", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${topic.postCount} 篇内容 · ${topic.participantCount} 人参与", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
        }
        Text("热度 ${topic.activity}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
    }
}

@Composable
private fun SearchResults(
    state: SearchState,
    onPost: (HeikaPost) -> Unit,
    onProfile: (String) -> Unit,
    onKind: (String) -> Unit,
    onTopicSearch: (String) -> Unit,
    onLoadMore: () -> Unit,
) {
    when (state.kind) {
        "content", "ai" -> {
            val posts = if (state.kind == "ai") state.aiPosts else state.posts
            val gridState = rememberLazyStaggeredGridState()
            LaunchedEffect(gridState, posts.size, state.hasMore, state.loadingMore) {
                val lastVisible = gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                if (state.hasMore && !state.loadingMore && posts.isNotEmpty() && lastVisible >= posts.size - 4) onLoadMore()
            }
            LazyVerticalStaggeredGrid(
                columns = StaggeredGridCells.Fixed(2),
                state = gridState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 17.dp, end = 17.dp, top = 13.dp, bottom = 132.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalItemSpacing = 15.dp,
            ) {
                items(posts, key = { "search-${state.kind}-${it.cloudId}" }) { post -> FeedCard(post, onClick = { onPost(post) }) }
                item(span = StaggeredGridItemSpan.FullLine) {
                    SearchGridFooter(state, posts.isEmpty(), onLoadMore)
                }
            }
        }
        "people" -> {
            val listState = rememberLazyListState()
            LaunchedEffect(listState, state.people.size, state.hasMore, state.loadingMore) {
                val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                if (state.hasMore && !state.loadingMore && state.people.isNotEmpty() && lastVisible >= state.people.size - 4) onLoadMore()
            }
            LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(horizontal = 19.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                items(state.people, key = { it.id }) { person -> PersonResultRow(person, onClick = { onProfile(person.id) }) }
                item { SearchListFooter(state, state.people.isEmpty(), onLoadMore) }
            }
        }
        "topics" -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            itemsIndexed(state.topics, key = { _, topic -> topic.id }) { index, topic -> HotTopicRow(index + 1, topic) { onTopicSearch(topic.name) } }
            item {
                if (state.topics.isEmpty()) EmptySearchResult("没有找到相关话题")
            }
        }
        else -> {
            val communityRows = state.posts.take(8).chunked(2)
            val aiRows = state.aiPosts.take(8).chunked(2)
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 17.dp, end = 17.dp, top = 12.dp, bottom = 132.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                if (state.topics.isNotEmpty()) {
                    item(key = "topics-heading") { ResultSectionHeader("话题", state.topics.size) { onKind("topics") } }
                    itemsIndexed(state.topics.take(4), key = { _, topic -> "all-topic-${topic.id}" }) { index, topic -> HotTopicRow(index + 1, topic) { onTopicSearch(topic.name) } }
                }
                if (communityRows.isNotEmpty()) {
                    item(key = "content-heading") { ResultSectionHeader("内容", state.posts.size) { onKind("content") } }
                    itemsIndexed(communityRows, key = { _, row -> "all-post-${row.first().cloudId}" }) { _, row ->
                        FeedCardPair(row, onPost)
                    }
                }
                if (aiRows.isNotEmpty()) {
                    item(key = "ai-heading") { ResultSectionHeader("AI 资源", state.aiPosts.size) { onKind("ai") } }
                    itemsIndexed(aiRows, key = { _, row -> "all-ai-${row.first().cloudId}" }) { _, row -> FeedCardPair(row, onPost) }
                }
                if (state.people.isNotEmpty()) {
                    item(key = "people-heading") { ResultSectionHeader("用户", state.people.size) { onKind("people") } }
                    items(state.people.take(4), key = { "all-user-${it.id}" }) { person -> PersonResultRow(person) { onProfile(person.id) } }
                }
                if (state.posts.isEmpty() && state.aiPosts.isEmpty() && state.people.isEmpty() && state.topics.isEmpty()) {
                    item { EmptySearchResult("没有找到相关内容") }
                }
            }
        }
    }
}

@Composable
private fun FeedCardPair(posts: List<HeikaPost>, onPost: (HeikaPost) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        FeedCard(posts[0], onClick = { onPost(posts[0]) }, modifier = Modifier.weight(1f))
        if (posts.size > 1) FeedCard(posts[1], onClick = { onPost(posts[1]) }, modifier = Modifier.weight(1f))
        else Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun ResultSectionHeader(title: String, count: Int, onViewAll: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        TextButton(onClick = onViewAll) { Text("$count 条 · 查看全部", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun PersonResultRow(person: SearchPerson, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        if (person.avatar != null) AsyncImage(person.avatar, "${person.name}头像", imageLoader = LocalHeikaImageLoader.current, modifier = Modifier.size(43.dp).clip(CircleShape), contentScale = ContentScale.Crop)
        else Box(Modifier.size(43.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            Text(person.name.take(1), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(person.name, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(person.bio.ifBlank { "黑卡用户" }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun SearchGridFooter(state: SearchState, isEmpty: Boolean, onLoadMore: () -> Unit) {
    when {
        isEmpty && !state.loading -> EmptySearchResult("没有找到相关内容")
        state.loadingMore -> Box(Modifier.fillMaxWidth().padding(vertical = 17.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(19.dp), strokeWidth = 2.dp) }
        state.hasMore -> TextButton(onClick = onLoadMore, modifier = Modifier.fillMaxWidth()) { Text("加载更多") }
    }
}

@Composable
private fun SearchListFooter(state: SearchState, isEmpty: Boolean, onLoadMore: () -> Unit) {
    when {
        isEmpty && !state.loading -> EmptySearchResult(if (state.kind == "people") "没有找到匹配用户" else "没有找到相关内容")
        state.loadingMore -> Box(Modifier.fillMaxWidth().padding(vertical = 17.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(19.dp), strokeWidth = 2.dp) }
        state.hasMore -> TextButton(onClick = onLoadMore, modifier = Modifier.fillMaxWidth()) { Text("加载更多") }
    }
}

@Composable
private fun EmptySearchResult(message: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = 35.dp), contentAlignment = Alignment.Center) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
    }
}
