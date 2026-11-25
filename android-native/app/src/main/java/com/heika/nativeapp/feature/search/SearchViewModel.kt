package com.heika.nativeapp.feature.search

import com.heika.nativeapp.ui.HeikaCoroutineGuard
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import com.heika.nativeapp.ui.NativePreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

data class SearchPerson(val id: String, val name: String, val bio: String, val avatar: String?)
data class SearchTopic(
    val id: String,
    val name: String,
    val postCount: Int,
    val participantCount: Int,
) {
    // Both values come from get_topic_stats; no client-generated or placeholder trends are shown.
    val activity: Int get() = postCount + participantCount
}

/** 合集搜索结果：点进去走合集详情，不复制章节内容。 */
data class SearchSeriesHit(
    val id: String,
    val title: String,
    val excerpt: String,
    val cover: String?,
    val kindLabel: String,
    val author: String,
    val authorAvatar: String?,
    val chapters: Int,
    val bookmarks: Int,
    val updatedAt: String,
)

data class SearchState(
    val query: String = "",
    val submittedQuery: String = "",
    val kind: String = "all",
    val sort: String = "relevance",
    val posts: List<HeikaPost> = emptyList(),
    val aiPosts: List<HeikaPost> = emptyList(),
    val series: List<SearchSeriesHit> = emptyList(),
    val people: List<SearchPerson> = emptyList(),
    val topics: List<SearchTopic> = emptyList(),
    val hotTopics: List<SearchTopic> = emptyList(),
    val recentSearches: List<String> = emptyList(),
    val suggestions: List<String> = emptyList(),
    val counts: Map<String, Int> = emptyMap(),
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val loadingHotTopics: Boolean = false,
    val hasMore: Boolean = false,
    val page: Int = 1,
    val error: String? = null,
    val hotTopicsError: String? = null,
)

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val preferences: NativePreferences,
) : ViewModel() {
    private val mutableState = MutableStateFlow(SearchState())
    val state = mutableState.asStateFlow()
    private var searchJob: Job? = null
    private var hotTopicsJob: Job? = null
    private var suggestJob: Job? = null
    private var generation = 0
    private var suggestGeneration = 0

    init {
        viewModelScope.launch(HeikaCoroutineGuard) {
            preferences.searchHistory.collect { history -> mutableState.update { it.copy(recentSearches = history) } }
        }
        loadHotTopics()
        // 从详情页话题/关联内容带词进来时，直接搜索一次。
        SearchIntent.consume()?.let { term ->
            mutableState.update { it.copy(query = term) }
            search()
        }
    }

    fun setQuery(value: String) {
        val query = value.take(60)
        if (query == mutableState.value.query) return
        generation++
        searchJob?.cancel()
        mutableState.update {
            it.copy(
                query = query,
                submittedQuery = "",
                posts = emptyList(), aiPosts = emptyList(), series = emptyList(), people = emptyList(), topics = emptyList(),
                counts = emptyMap(), suggestions = emptyList(),
                loading = false, loadingMore = false, hasMore = false, error = null,
            )
        }
        requestSuggestions(query)
    }

    /** 联想：防抖 220ms；本地校验 query 与序号，旧请求不会覆盖新结果。 */
    private fun requestSuggestions(raw: String) {
        val query = raw.trim()
        suggestJob?.cancel()
        if (query.isEmpty()) {
            mutableState.update { it.copy(suggestions = emptyList()) }
            return
        }
        val ticket = ++suggestGeneration
        suggestJob = viewModelScope.launch(HeikaCoroutineGuard) {
            delay(220)
            runCatching { repository.searchSuggest(query) }.onSuccess { result ->
                if (ticket != suggestGeneration || mutableState.value.query.trim() != query) return@onSuccess
                mutableState.update { it.copy(suggestions = result.items.take(8)) }
            }
        }
    }

    fun setKind(value: String) {
        if (value !in SEARCH_KINDS || value == mutableState.value.kind) return
        mutableState.update { it.copy(kind = value) }
        if (mutableState.value.submittedQuery.isNotBlank()) search()
    }

    fun setSort(value: String) {
        if (value !in SORTS || value == mutableState.value.sort) return
        mutableState.update { it.copy(sort = value) }
        if (mutableState.value.submittedQuery.isNotBlank()) search()
    }

    fun submitRecentSearch(term: String) {
        setQuery(term)
        search()
    }

    fun submitTopicSearch(term: String) {
        mutableState.update { it.copy(kind = "topics") }
        setQuery(term)
        search()
    }

    fun deleteRecentSearch(term: String) {
        viewModelScope.launch(HeikaCoroutineGuard) { preferences.removeRecentSearch(term) }
    }

    fun clearRecentSearches() {
        viewModelScope.launch(HeikaCoroutineGuard) { preferences.clearRecentSearches() }
    }

    fun loadHotTopics() {
        if (mutableState.value.loadingHotTopics) return
        hotTopicsJob?.cancel()
        mutableState.update { it.copy(loadingHotTopics = true, hotTopicsError = null) }
        hotTopicsJob = viewModelScope.launch(HeikaCoroutineGuard) {
            try {
                val topics = repository.searchTopics(featured = true).toTopicList()
                mutableState.update { it.copy(hotTopics = topics, loadingHotTopics = false) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                mutableState.update { it.copy(loadingHotTopics = false, hotTopicsError = error.message ?: "话题暂时无法加载") }
            }
        }
    }

    fun search() {
        val current = mutableState.value
        val query = current.query.trim().take(60)
        if (query.isBlank()) return
        searchJob?.cancel()
        val ticket = ++generation
        val tab = tabOf(current.kind)
        val sort = current.sort
        mutableState.update {
            it.copy(
                submittedQuery = query, posts = emptyList(), aiPosts = emptyList(), series = emptyList(),
                people = emptyList(), topics = emptyList(), suggestions = emptyList(),
                loading = true, loadingMore = false, hasMore = false, page = 1, error = null,
            )
        }
        searchJob = viewModelScope.launch(HeikaCoroutineGuard) {
            try {
                preferences.addRecentSearch(query)
                val payload = repository.searchUnified(query, tab, sort, 1, 12)
                if (ticket != generation) return@launch
                apply(payload, append = false)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (ticket == generation) mutableState.update { it.copy(loading = false, loadingMore = false, error = error.message ?: "搜索失败，请重试") }
            }
        }
    }

    fun loadMore() {
        val current = mutableState.value
        if (current.loading || current.loadingMore || !current.hasMore || current.submittedQuery.isBlank()) return
        val ticket = generation
        val tab = tabOf(current.kind)
        val sort = current.sort
        val nextPage = current.page + 1
        mutableState.update { it.copy(loadingMore = true, error = null) }
        searchJob = viewModelScope.launch(HeikaCoroutineGuard) {
            try {
                val payload = repository.searchUnified(current.submittedQuery, tab, sort, nextPage, 12)
                if (ticket != generation) return@launch
                apply(payload, append = true)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (ticket == generation) mutableState.update { it.copy(loadingMore = false, error = error.message ?: "加载更多失败") }
            }
        }
    }

    /** 服务端已按分类与排序返回结果，这里只做结构与去重合并。 */
    private fun apply(payload: JSONObject, append: Boolean) {
        val items = payload.optJSONArray("items").jsonObjects()
        val hitPosts = items.filter { it.optString("type") == "post" }.map(::postOf)
        val hitSeries = items.filter { it.optString("type") == "series" }.map(::seriesOf)
        val people = payload.optJSONArray("people").jsonObjects().map(::personOf)
        val topics = payload.optJSONArray("topics").toTopicList()
        val counts = payload.optJSONObject("counts")
        val page = payload.optInt("page", 1)
        mutableState.update { state ->
            val community = hitPosts.filter { it.channel != "ai" }
            val ai = hitPosts.filter { it.channel == "ai" }
            state.copy(
                posts = if (append) state.posts + community else community,
                aiPosts = if (append) state.aiPosts + ai else ai,
                series = if (append) state.series + hitSeries else hitSeries,
                people = people,
                topics = topics,
                counts = buildMap {
                    listOf("featured", "ai", "series", "people", "topics", "all").forEach { key ->
                        counts?.optInt(key)?.let { put(key, it) }
                    }
                },
                loading = false,
                loadingMore = false,
                hasMore = payload.optBoolean("hasMore"),
                page = page,
            )
        }
    }

    private fun postOf(row: JSONObject): HeikaPost = HeikaPost.from(JSONObject().apply {
        put("id", row.optString("id"))
        put("clientId", row.optInt("clientId"))
        put("title", row.optString("title"))
        put("body", row.optString("excerpt"))
        put("channel", row.optString("channel", "community"))
        put("tag", row.optString("tag"))
        put("contentType", row.optString("contentType"))
        put("author", row.optJSONObject("author")?.optString("name").orEmpty().ifBlank { "黑卡作者" })
        put("image", row.optString("cover"))
        put("createdAt", row.optString("createdAt"))
        put("likeCount", row.optInt("likes"))
    })

    private fun seriesOf(row: JSONObject): SearchSeriesHit = SearchSeriesHit(
        id = row.optString("id"),
        title = row.optString("title"),
        excerpt = row.optString("excerpt"),
        cover = row.optString("cover").takeIf(String::isNotBlank),
        kindLabel = when (row.optString("kind")) {
            "tutorial" -> "教程"
            "resource" -> "资源"
            else -> "连载"
        },
        author = row.optJSONObject("author")?.optString("name").orEmpty().ifBlank { "黑卡作者" },
        authorAvatar = row.optJSONObject("author")?.optString("avatar")?.takeIf { it.isNotBlank() },
        chapters = row.optInt("chapters"),
        bookmarks = row.optInt("bookmarks"),
        updatedAt = row.optString("updatedAt"),
    )

    private fun personOf(row: JSONObject) = SearchPerson(
        id = row.optString("id"),
        name = row.optString("nickname").ifBlank { "探索者" },
        bio = row.optString("bio"),
        avatar = row.optString("avatar").takeIf(String::isNotBlank),
    )

    private fun JSONArray.toTopicList(): List<SearchTopic> = jsonObjects().map { row ->
        SearchTopic(
            id = row.optString("id"),
            name = row.optString("name"),
            postCount = row.optInt("count"),
            participantCount = 0,
        )
    }.filter { it.name.isNotBlank() }

    private fun tabOf(kind: String) = when (kind) {
        "content" -> "featured"
        "series", "people", "topics", "ai" -> kind
        else -> "all"
    }

    private companion object {
        val SEARCH_KINDS = setOf("all", "content", "ai", "series", "people", "topics")
        val SORTS = setOf("relevance", "hot", "latest", "bookmarks", "likes")
    }
}
