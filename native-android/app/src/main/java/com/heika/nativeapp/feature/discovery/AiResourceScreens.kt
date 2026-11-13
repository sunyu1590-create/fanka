package com.heika.nativeapp.feature.discovery

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.paging.LoadState
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.paging.compose.itemKey
import com.heika.nativeapp.data.AiResourceType
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaRadii
import com.heika.nativeapp.ui.NativePreferences
import dev.chrisbanes.haze.rememberHazeState
import kotlinx.coroutines.launch

@Composable
fun AiResourceCenterScreen(
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onSelectType: (String) -> Unit,
    viewModel: AiResourceCatalogViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        AiResourceHeader("AI 资源中心", onBack, onSearch)
        Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 18.dp, vertical = 9.dp)) {
            Text("按资源类型探索，找到真正有用的 AI 内容。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            when {
                state.loading && state.items.isEmpty() -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                }
                state.error != null && state.items.isEmpty() -> Column(Modifier.weight(1f).fillMaxWidth().padding(vertical = 44.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text("资源分类暂时无法加载", color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                    Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
                    TextButton(onClick = { viewModel.load() }) { Text("重试") }
                }
                state.items.isEmpty() -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text("当前没有已启用的 AI 资源类型", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                }
                else -> androidx.compose.foundation.lazy.grid.LazyVerticalGrid(
                    columns = androidx.compose.foundation.lazy.grid.GridCells.Fixed(2),
                    modifier = Modifier.weight(1f).fillMaxWidth().padding(top = 17.dp),
                    contentPadding = PaddingValues(bottom = 28.dp),
                    horizontalArrangement = Arrangement.spacedBy(11.dp),
                    verticalArrangement = Arrangement.spacedBy(11.dp),
                ) {
                    items(state.items, key = AiResourceType::id) { item ->
                        AiResourceTypeTile(item, onClick = { onSelectType(item.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun AiResourceTypeTile(item: AiResourceType, onClick: () -> Unit) {
    val (icon, fallbackTitle, fallbackDescription) = resourceTypePresentation(item.id)
    Column(
        Modifier.fillMaxWidth().heightIn(min = 142.dp).clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(.7.dp, MaterialTheme.colorScheme.outline.copy(alpha = .46f), RoundedCornerShape(14.dp))
            .clickable(onClick = onClick).padding(13.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(21.dp))
            Spacer(Modifier.weight(1f))
            Icon(HeikaIcons.Forward, contentDescription = "查看${item.label}资源", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
        }
        Text(item.label.ifBlank { fallbackTitle }, color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(item.description.ifBlank { fallbackDescription }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text("${item.publishedCount} 项资源", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
    }
}

@Composable
fun AiResourceResultsScreen(
    initialType: String?,
    isSearch: Boolean,
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    sharedTransitionScope: androidx.compose.animation.SharedTransitionScope,
    animatedVisibilityScope: androidx.compose.animation.AnimatedVisibilityScope,
    sharedElementsEnabled: Boolean,
    viewModel: AiResourceFeedViewModel = hiltViewModel(),
) {
    val catalogViewModel: AiResourceCatalogViewModel = hiltViewModel()
    val typeState by catalogViewModel.state.collectAsStateWithLifecycle()
    val feedLayout by viewModel.feedLayout.collectAsStateWithLifecycle()
    val posts = viewModel.posts.collectAsLazyPagingItems()
    val feedState = rememberLazyStaggeredGridState()
    val filterState by viewModel.filter.collectAsStateWithLifecycle()
    val filter = filterState ?: remember { com.heika.nativeapp.data.FeedFilter(channel = "ai", sort = "最新") }
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    var searchText by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(initialType) { viewModel.configure(initialType) }
    val currentType = typeState.items.firstOrNull { it.id == initialType }
    val title = if (isSearch) "搜索 AI 资源" else currentType?.label ?: resourceTypePresentation(initialType.orEmpty()).second

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        AiResourceHeader(title, onBack, if (isSearch) null else onSearch)
        if (isSearch) {
            OutlinedTextField(
                value = searchText,
                onValueChange = { searchText = it.take(60) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 7.dp),
                placeholder = { Text("搜索 AI 资源标题或正文") },
                leadingIcon = { Icon(HeikaIcons.Search, contentDescription = null) },
                trailingIcon = {
                    IconButton(onClick = { scope.launch { viewModel.search(searchText); feedState.scrollToItem(0) }; focusManager.clearFocus() }) {
                        Icon(HeikaIcons.Search, contentDescription = "搜索")
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(HeikaRadii.control),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { scope.launch { viewModel.search(searchText); feedState.scrollToItem(0) }; focusManager.clearFocus() }),
            )
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                item { AiScenarioChip("全部类型", filter.contentType == null) { scope.launch { viewModel.setType(null); feedState.scrollToItem(0) } } }
                items(typeState.items, key = AiResourceType::id) { type -> AiScenarioChip(type.label, filter.contentType == type.id) { scope.launch { viewModel.setType(type.id); feedState.scrollToItem(0) } } }
            }
        }
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 9.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            item { AiScenarioChip("全部场景", filter.usageScenario == null) { scope.launch { viewModel.setScenario(null); feedState.scrollToItem(0) } } }
            items(AI_SCENARIOS, key = { it.first }) { (key, label) ->
                AiScenarioChip(label, filter.usageScenario == key) { scope.launch { viewModel.setScenario(if (filter.usageScenario == key) null else key); feedState.scrollToItem(0) } }
            }
        }
        PullToRefreshBox(
            isRefreshing = posts.itemCount > 0 && posts.loadState.refresh is LoadState.Loading,
            onRefresh = posts::refresh,
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
            FeedGrid(
                posts = posts,
                state = feedState,
                onPost = onPost,
                columns = if (feedLayout == "single") 1 else 2,
                modifier = Modifier.fillMaxSize(),
                filter = filter,
                onSortChange = viewModel::setSort,
                hazeState = rememberHazeState(),
                sharedTransitionScope = sharedTransitionScope,
                animatedVisibilityScope = animatedVisibilityScope,
                sharedElementsEnabled = sharedElementsEnabled,
            )
        }
    }
}

@Composable
private fun AiScenarioChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        Modifier.clip(RoundedCornerShape(HeikaRadii.control))
            .background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .13f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .42f))
            .clickable(onClick = onClick).padding(horizontal = 11.dp, vertical = 7.dp),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 11.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
    )
}

@Composable
private fun AiResourceHeader(title: String, onBack: () -> Unit, onSearch: (() -> Unit)?) {
    Row(
        Modifier.fillMaxWidth().height(54.dp).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) { Icon(HeikaIcons.Back, contentDescription = "返回", tint = MaterialTheme.colorScheme.onSurface) }
        Text(title, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (onSearch != null) IconButton(onClick = onSearch) { Icon(HeikaIcons.Search, contentDescription = "搜索 AI 资源", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
        else Spacer(Modifier.width(48.dp))
    }
}

private val AI_SCENARIOS = listOf(
    "learning" to "学习", "programming" to "编程", "writing" to "写作",
    "office" to "办公", "creation" to "创作", "life" to "生活",
)

@Composable
private fun resourceTypePresentation(id: String): Triple<ImageVector, String, String> = when (id) {
    "agent" -> Triple(HeikaIcons.Robot, "Agent", "智能体与自动化任务。")
    "skill" -> Triple(HeikaIcons.Blocks, "Skills", "技能插件与能力扩展。")
    "prompt" -> Triple(HeikaIcons.Terminal, "Prompt", "提示词与实用模板。")
    "ai_tool" -> Triple(HeikaIcons.Wrench, "AI 工具", "应用与效率工具。")
    "knowledge_article" -> Triple(HeikaIcons.BrainCircuit, "AI 知识", "模型知识与使用技巧。")
    else -> Triple(HeikaIcons.Text, "案例实践", "真实场景与操作教程。")
}
