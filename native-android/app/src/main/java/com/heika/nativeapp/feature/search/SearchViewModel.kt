package com.heika.nativeapp.feature.search

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
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
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

data class SearchState(
    val query: String = "",
    val submittedQuery: String = "",
    val kind: String = "all",
    val posts: List<HeikaPost> = emptyList(),
    val aiPosts: List<HeikaPost> = emptyList(),
    val people: List<SearchPerson> = emptyList(),
    val topics: List<SearchTopic> = emptyList(),
    val hotTopics: List<SearchTopic> = emptyList(),
    val recentSearches: List<String> = emptyList(),
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val loadingHotTopics: Boolean = false,
    val hasMore: Boolean = false,
    val page: Int = 1,
    val contentCursor: String? = null,
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
    private var generation = 0

    init {
        viewModelScope.launch {
            preferences.searchHistory.collect { history -> mutableState.update { it.copy(recentSearches = history) } }
        }
        loadHotTopics()
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
                posts = emptyList(), aiPosts = emptyList(), people = emptyList(), topics = emptyList(),
                loading = false, loadingMore = false, hasMore = false, error = null,
            )
        }
    }

    fun setKind(value: String) {
        if (value !in SEARCH_KINDS || value == mutableState.value.kind) return
        mutableState.update { it.copy(kind = value) }
        if (mutableState.value.submittedQuery.isNotBlank()) search()
    }

    fun submitRecentSearch(term: String) {
        setQuery(term)
        search()
    }

    fun submitTopicSearch(term: String) {
        mutableState.update { it.copy(kind = "content") }
        setQuery(term)
        search()
    }

    fun clearRecentSearches() {
        viewModelScope.launch { preferences.clearRecentSearches() }
    }

    fun loadHotTopics() {
        if (mutableState.value.loadingHotTopics) return
        hotTopicsJob?.cancel()
        mutableState.update { it.copy(loadingHotTopics = true, hotTopicsError = null) }
        hotTopicsJob = viewModelScope.launch {
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
        val requestGeneration = ++generation
        val kind = current.kind
        mutableState.update {
            it.copy(
                submittedQuery = query, posts = emptyList(), aiPosts = emptyList(), people = emptyList(), topics = emptyList(),
                loading = true, loadingMore = false, hasMore = false, page = 1, contentCursor = null, error = null,
            )
        }
        searchJob = viewModelScope.launch {
            try {
                preferences.addRecentSearch(query)
                val result = when (kind) {
                    "all" -> coroutineScope {
                        val content = async { repository.search(query, "content", limit = 8) }
                        val people = async { repository.search(query, "people", limit = 8) }
                        val ai = async { repository.searchAi(query, limit = 8) }
                        val topics = async { repository.searchTopics(query) }
                        SearchPayload(content.await(), people.await(), ai.await(), topics.await().toTopicList())
                    }
                    "content" -> SearchPayload(content = repository.search(query, "content"))
                    "people" -> SearchPayload(people = repository.search(query, "people"))
                    "topics" -> SearchPayload(topics = repository.searchTopics(query).toTopicList())
                    "ai" -> SearchPayload(ai = repository.searchAi(query))
                    else -> return@launch
                }
                if (requestGeneration != generation) return@launch
                val contentItems = result.content?.posts().orEmpty()
                val aiItems = result.ai?.posts().orEmpty()
                val peopleItems = result.people?.people().orEmpty()
                val contentHasMore = result.content?.optBoolean("has_more") == true
                val aiPage = result.ai?.optInt("page", 1) ?: 1
                val aiHasMore = result.ai?.let { it.optInt("page", aiPage) * it.optInt("limit", 24) < it.optInt("total") } == true
                val peoplePage = result.people?.optInt("page", 1) ?: 1
                val peopleHasMore = result.people?.let { peoplePage * it.optInt("limit", 24) < it.optInt("total") } == true
                mutableState.update {
                    it.copy(
                        posts = contentItems,
                        aiPosts = aiItems,
                        people = peopleItems,
                        topics = result.topics,
                        loading = false,
                        hasMore = when (kind) { "content" -> contentHasMore; "people" -> peopleHasMore; "ai" -> aiHasMore; else -> false },
                        page = when (kind) { "people" -> peoplePage; "ai" -> aiPage; else -> 1 },
                        contentCursor = result.content?.optString("next_cursor")?.takeIf(String::isNotBlank),
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (requestGeneration == generation) mutableState.update { it.copy(loading = false, loadingMore = false, error = error.message ?: "搜索失败，请重试") }
            }
        }
    }

    fun loadMore() {
        val current = mutableState.value
        if (current.loading || current.loadingMore || !current.hasMore || current.submittedQuery.isBlank()) return
        if (current.kind !in setOf("content", "people", "ai")) return
        val query = current.submittedQuery
        val kind = current.kind
        val requestGeneration = generation
        val nextPage = current.page + 1
        mutableState.update { it.copy(loadingMore = true, error = null) }
        searchJob = viewModelScope.launch {
            try {
                val payload = when (kind) {
                    "content" -> repository.search(query, "content", nextPage, current.contentCursor)
                    "people" -> repository.search(query, "people", nextPage)
                    else -> repository.searchAi(query, nextPage)
                }
                if (requestGeneration != generation || mutableState.value.kind != kind || mutableState.value.submittedQuery != query) return@launch
                if (kind == "content") {
                    val items = payload.posts()
                    mutableState.update {
                        it.copy(
                            posts = it.posts + items,
                            contentCursor = payload.optString("next_cursor").takeIf(String::isNotBlank),
                            hasMore = payload.optBoolean("has_more"),
                            page = nextPage,
                            loadingMore = false,
                        )
                    }
                } else if (kind == "people") {
                    val items = payload.people()
                    val page = payload.optInt("page", nextPage)
                    val hasMore = page * payload.optInt("limit", 24) < payload.optInt("total")
                    mutableState.update { it.copy(people = it.people + items, hasMore = hasMore, page = page, loadingMore = false) }
                } else {
                    val items = payload.posts()
                    val page = payload.optInt("page", nextPage)
                    val hasMore = page * payload.optInt("limit", 24) < payload.optInt("total")
                    mutableState.update { it.copy(aiPosts = it.aiPosts + items, hasMore = hasMore, page = page, loadingMore = false) }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (requestGeneration == generation) mutableState.update { it.copy(loadingMore = false, error = error.message ?: "加载更多失败") }
            }
        }
    }

    private data class SearchPayload(
        val content: JSONObject? = null,
        val people: JSONObject? = null,
        val ai: JSONObject? = null,
        val topics: List<SearchTopic> = emptyList(),
    )

    private fun JSONObject.posts(): List<HeikaPost> = optJSONArray("items").jsonObjects().map(HeikaPost::from)

    private fun JSONObject.people(): List<SearchPerson> = optJSONArray("items").jsonObjects().map { row ->
        SearchPerson(
            id = row.optString("id"),
            name = row.optString("nickname").ifBlank { "探索者" },
            bio = row.optString("bio"),
            avatar = row.optString("avatar_url").takeIf(String::isNotBlank),
        )
    }

    private fun JSONArray.toTopicList(): List<SearchTopic> = jsonObjects().map { row ->
        SearchTopic(
            id = row.optString("id"),
            name = row.optString("name"),
            postCount = row.optInt("postCount"),
            participantCount = row.optInt("participantCount"),
        )
    }.filter { it.id.isNotBlank() && it.name.isNotBlank() }

    private companion object {
        val SEARCH_KINDS = setOf("all", "content", "people", "topics", "ai")
    }
}
