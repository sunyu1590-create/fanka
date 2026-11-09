package com.heika.nativeapp.feature.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject

data class SearchPerson(val id: String, val name: String, val bio: String, val avatar: String?)
data class SearchState(val query: String = "", val kind: String = "content", val posts: List<HeikaPost> = emptyList(), val people: List<SearchPerson> = emptyList(), val loading: Boolean = false, val error: String? = null)

@HiltViewModel
class SearchViewModel @Inject constructor(private val repository: HeikaRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(SearchState())
    val state = mutableState.asStateFlow()
    private var searchJob: Job? = null
    fun setQuery(value: String) {
        val query = value.take(60)
        val changed = query != mutableState.value.query
        if (changed) searchJob?.cancel()
        mutableState.update {
            it.copy(
                query = query,
                posts = if (query == it.query) it.posts else emptyList(),
                people = if (query == it.query) it.people else emptyList(),
                loading = if (changed) false else it.loading,
                error = null,
            )
        }
    }
    fun setKind(value: String) {
        if (value !in setOf("content", "people")) return
        mutableState.update { it.copy(kind = value, posts = emptyList(), people = emptyList(), error = null) }
        search()
    }
    fun search() {
        val current = mutableState.value
        if (current.query.isBlank()) return
        searchJob?.cancel()
        val request = current.query to current.kind
        mutableState.update { it.copy(loading = true, error = null) }
        searchJob = viewModelScope.launch {
            try {
                val data = repository.search(request.first, request.second)
                if (mutableState.value.query != request.first || mutableState.value.kind != request.second) return@launch
                if (request.second == "people") {
                    val people = data.optJSONArray("items").jsonObjects().map { row -> SearchPerson(row.optString("id"), row.optString("nickname").ifBlank { "探索者" }, row.optString("bio"), row.optString("avatar_url").takeIf(String::isNotBlank)) }
                    mutableState.update { it.copy(people = people, loading = false) }
                } else {
                    val posts = data.optJSONArray("items").jsonObjects().map(HeikaPost::from)
                    mutableState.update { it.copy(posts = posts, loading = false) }
                }
            } catch (error: kotlinx.coroutines.CancellationException) {
                throw error
            } catch (error: Exception) {
                if (mutableState.value.query == request.first && mutableState.value.kind == request.second) mutableState.update { it.copy(loading = false, error = error.message ?: "搜索失败") }
            }
        }
    }
}
