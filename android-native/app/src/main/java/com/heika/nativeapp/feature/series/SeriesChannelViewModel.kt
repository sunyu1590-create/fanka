package com.heika.nativeapp.feature.series

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.HeikaSeriesDiscover
import com.heika.nativeapp.ui.HeikaCoroutineGuard
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SeriesChannelState(
    val data: HeikaSeriesDiscover? = null,
    val loading: Boolean = true,
    val appending: Boolean = false,
    val error: String? = null,
    val sort: String = "recommended",
    val category: Int? = null,
)

/** 合集频道：分区由服务端按真实数量裁剪，切排序/分类都走同一次请求，旧结果不会盖新结果。 */
@HiltViewModel
class SeriesChannelViewModel @Inject constructor(private val repository: HeikaRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(SeriesChannelState())
    val state = mutableState.asStateFlow()
    private var requestId = 0

    init { refresh() }

    fun refresh() = load(page = 1, append = false)

    fun selectSort(sort: String) {
        if (sort == mutableState.value.sort) return
        mutableState.update { it.copy(sort = sort) }
        load(page = 1, append = false)
    }

    fun selectCategory(category: Int?) {
        if (category == mutableState.value.category) return
        mutableState.update { it.copy(category = category) }
        load(page = 1, append = false)
    }

    fun loadMore() {
        val current = mutableState.value
        if (current.appending || current.loading || current.data?.hasMore != true) return
        load(page = (current.data?.page ?: 1) + 1, append = true)
    }

    private fun load(page: Int, append: Boolean) {
        val snapshot = mutableState.value
        val id = ++requestId
        mutableState.update { it.copy(loading = !append, appending = append, error = null) }
        viewModelScope.launch(HeikaCoroutineGuard) {
            runCatching {
                repository.seriesDiscover(
                    sort = snapshot.sort,
                    category = snapshot.category,
                    page = page,
                    limit = 18,
                )
            }.onSuccess { result ->
                if (id != requestId) return@onSuccess
                mutableState.update { state ->
                    if (!append || state.data == null) {
                        state.copy(data = result, loading = false, appending = false, error = null)
                    } else {
                        val merged = state.data.all + result.all.filter { next -> state.data.all.none { it.id == next.id } }
                        state.copy(data = result.copy(all = merged), loading = false, appending = false, error = null)
                    }
                }
            }.onFailure { error ->
                if (id != requestId) return@onFailure
                mutableState.update {
                    it.copy(loading = false, appending = false, error = error.message ?: "合集加载失败")
                }
            }
        }
    }
}
