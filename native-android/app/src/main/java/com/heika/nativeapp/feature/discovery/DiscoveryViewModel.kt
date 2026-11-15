package com.heika.nativeapp.feature.discovery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.PagingData
import androidx.paging.PagingSource
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingState
import androidx.paging.cachedIn
import com.heika.nativeapp.data.FeedFilter
import com.heika.nativeapp.data.FeedPageKey
import com.heika.nativeapp.data.AiResourceType
import com.heika.nativeapp.data.HeikaCategory
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.ui.NativePreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import java.net.URLDecoder
import java.net.URLEncoder
import javax.inject.Inject
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.launch

data class DiscoveryUiState(
    val filter: FeedFilter = FeedFilter(),
    val communityCategories: List<HeikaCategory> = emptyList(),
    val aiCategories: List<HeikaCategory> = emptyList(),
    val communityTags: List<HeikaCategory> = emptyList(),
    val aiTags: List<HeikaCategory> = emptyList(),
    val catalogLoading: Boolean = true,
    val catalogError: String? = null,
)

@HiltViewModel
class DiscoveryViewModel @Inject constructor(private val repository: HeikaRepository, preferences: NativePreferences) : ViewModel() {
    private val mutableState = MutableStateFlow(DiscoveryUiState())
    val state = mutableState.asStateFlow()
    val feedLayout = preferences.feedLayout.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "waterfall")
    private val filter = MutableStateFlow(FeedFilter())
    private var communityFilter = FeedFilter()
    // Start from published content; 推荐 remains an explicit featured-only filter.
    private var aiFilter = FeedFilter(channel = "ai", sort = "最新")

    @OptIn(ExperimentalCoroutinesApi::class)
    val posts = filter.flatMapLatest { current ->
        flow {
            // Restore the last useful page first; the live Paging source replaces it as
            // soon as the backend responds. This keeps the native screen useful offline.
            repository.cachedFeed(current).takeIf { it.isNotEmpty() }?.let { emit(PagingData.from(it)) }
            val recommendation = if (current.channel == "community" && current.sort == "推荐") {
                runCatching { repository.recommendationContext() }
                    .getOrDefault(com.heika.nativeapp.data.RecommendationContext())
            } else com.heika.nativeapp.data.RecommendationContext()
            emitAll(Pager(
                config = PagingConfig(pageSize = 24, initialLoadSize = 24, prefetchDistance = 6, enablePlaceholders = false),
                pagingSourceFactory = { NativeDiscoveryPagingSource(repository, current, recommendation) },
            ).flow)
        }
    }.cachedIn(viewModelScope)

    init {
        refreshCatalog()
    }

    fun selectChannel(channel: String) {
        if (channel !in setOf("community", "ai")) return
        val current = filter.value
        rememberChannelFilter(current)
        val next = if (channel == "ai") aiFilter else communityFilter
        filter.value = next
        mutableState.update { it.copy(filter = next) }
    }

    fun selectCategory(category: HeikaCategory?) = updateFilter { it.copy(category = category) }
    fun selectTopic(topic: String?) = updateFilter { it.copy(topic = topic) }
    fun selectContentType(type: String?) = updateFilter { it.copy(contentType = type) }
    fun selectSort(sort: String) = updateFilter { it.copy(sort = sort) }

    fun refreshCatalog() {
        viewModelScope.launch {
            mutableState.update { it.copy(catalogLoading = true, catalogError = null) }
            runCatching {
                val values = listOf(
                    repository.loadCategories("community", "category"),
                    repository.loadCategories("ai", "category"),
                    repository.loadCategories("community", "tag"),
                    repository.loadCategories("ai", "tag"),
                )
                mutableState.update {
                    it.copy(
                        communityCategories = values[0], aiCategories = values[1],
                        communityTags = values[2], aiTags = values[3], catalogLoading = false,
                    )
                }
            }.onFailure { error ->
                mutableState.update { it.copy(catalogLoading = false, catalogError = error.message ?: "筛选项目暂不可用") }
            }
        }
    }

    private fun updateFilter(transform: (FeedFilter) -> FeedFilter) {
        filter.update { updated -> transform(updated) }
        rememberChannelFilter(filter.value)
        mutableState.update { it.copy(filter = filter.value) }
    }

    private fun rememberChannelFilter(value: FeedFilter) {
        if (value.channel == "ai") aiFilter = value else communityFilter = value
    }

}

internal class NativeDiscoveryPagingSource(
    private val repository: HeikaRepository,
    private val filter: FeedFilter,
    private val recommendation: com.heika.nativeapp.data.RecommendationContext,
) : PagingSource<String, HeikaPost>() {
    override suspend fun load(params: LoadParams<String>): LoadResult<String, HeikaPost> = try {
        if (filter.channel == "community") {
            val cursor = params.key?.let(::decodeCursor)
            val result = repository.communityPage(filter, cursor ?: FeedPageKey(), recommendation)
            val next = if (result.hasMore && result.nextCursorCreatedAt != null && result.nextCursorPostId != null) {
                encodeCursor(result.nextCursorCreatedAt, result.nextCursorPostId)
            } else null
            LoadResult.Page(data = result.posts, prevKey = null, nextKey = next)
        } else {
            val page = params.key?.toIntOrNull() ?: 1
            val result = repository.aiPage(filter, page)
            LoadResult.Page(data = result.posts, prevKey = null, nextKey = result.nextPage?.toString().takeIf { result.hasMore })
        }
    } catch (error: Exception) {
        LoadResult.Error(error)
    }

    override fun getRefreshKey(state: PagingState<String, HeikaPost>): String? = null

    private fun encodeCursor(createdAt: String, postId: String) =
        URLEncoder.encode("$createdAt\n$postId", Charsets.UTF_8.name())

    private fun decodeCursor(value: String): FeedPageKey? = runCatching {
        val parts = URLDecoder.decode(value, Charsets.UTF_8.name()).split('\n', limit = 2)
        FeedPageKey(cursorCreatedAt = parts[0], cursorPostId = parts[1])
    }.getOrNull()
}

data class AiResourceCatalogState(
    val items: List<AiResourceType> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class AiResourceCatalogViewModel @Inject constructor(private val repository: HeikaRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(AiResourceCatalogState())
    val state = mutableState.asStateFlow()

    init { load() }

    fun load() = viewModelScope.launch {
        mutableState.update { it.copy(loading = true, error = null) }
        runCatching { repository.loadAiResourceTypes() }
            .onSuccess { items -> mutableState.value = AiResourceCatalogState(items = items, loading = false) }
            .onFailure { error -> mutableState.update { it.copy(loading = false, error = error.message ?: "AI 资源暂不可用") } }
    }
}

@HiltViewModel
class AiResourceFeedViewModel @Inject constructor(
    private val repository: HeikaRepository,
    preferences: NativePreferences,
) : ViewModel() {
    private val mutableFilter = MutableStateFlow<FeedFilter?>(null)
    val filter = mutableFilter.asStateFlow()
    val feedLayout = preferences.feedLayout.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "waterfall")
    @OptIn(ExperimentalCoroutinesApi::class)
    val posts = mutableFilter.flatMapLatest { current ->
        if (current == null) flow { emit(PagingData.empty<HeikaPost>()) }
        else flow {
            repository.cachedFeed(current).takeIf { it.isNotEmpty() }?.let { emit(PagingData.from(it)) }
            emitAll(Pager(
                config = PagingConfig(pageSize = 24, initialLoadSize = 24, prefetchDistance = 6, enablePlaceholders = false),
                pagingSourceFactory = { NativeDiscoveryPagingSource(repository, current, com.heika.nativeapp.data.RecommendationContext()) },
            ).flow)
        }
    }.cachedIn(viewModelScope)

    fun configure(type: String?) {
        if (type != null && type !in setOf("knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial")) return
        val old = mutableFilter.value
        if (old == null) mutableFilter.value = FeedFilter(channel = "ai", sort = "最新", contentType = type)
        else if (old.contentType != type) mutableFilter.value = old.copy(contentType = type)
    }

    fun setType(type: String?) { mutableFilter.update { it?.copy(contentType = type) } }
    fun setScenario(scenario: String?) {
        if (scenario != null && scenario !in setOf("learning", "programming", "writing", "office", "creation", "life")) return
        mutableFilter.update { it?.copy(usageScenario = scenario) }
    }
    fun setSort(sort: String) {
        if (sort !in setOf("最新", "热门", "推荐")) return
        mutableFilter.update { it?.copy(sort = sort) }
    }
    fun search(query: String) { mutableFilter.update { it?.copy(query = query.trim().take(60).takeIf(String::isNotBlank)) } }
    fun resetSearch() { mutableFilter.update { it?.copy(query = null) } }
}

