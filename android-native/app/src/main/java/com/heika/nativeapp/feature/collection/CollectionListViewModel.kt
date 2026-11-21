package com.heika.nativeapp.feature.collection

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaCollection
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.ui.HeikaCoroutineGuard
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CollectionListState(
    val items: List<HeikaCollection> = emptyList(),
    val loading: Boolean = false,
    val saving: Boolean = false,
    val notice: String? = null,
)

/** 作者主页与个人页的合集列表：只读取合集摘要，章节明细留给合集详情页。 */
@HiltViewModel
class CollectionListViewModel @Inject constructor(private val repository: HeikaRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(CollectionListState())
    val state = mutableState.asStateFlow()
    private var loadedFor: String? = null

    fun load(creatorId: String?, force: Boolean = false) {
        if (!force && loadedFor == (creatorId ?: "__self__")) return
        loadedFor = creatorId ?: "__self__"
        mutableState.update { it.copy(loading = true) }
        viewModelScope.launch(HeikaCoroutineGuard) {
            val items = runCatching { repository.creatorCollections(creatorId, scope = if (creatorId == null) "all" else null) }
                .getOrDefault(emptyList())
            mutableState.update { it.copy(items = items, loading = false) }
        }
    }

    fun clearNotice() = mutableState.update { it.copy(notice = null) }

    fun create(title: String, description: String, kind: String, status: String, coverUrl: String?, onCreated: (HeikaCollection) -> Unit) {
        if (title.trim().length < 2 || mutableState.value.saving) return
        mutableState.update { it.copy(saving = true) }
        viewModelScope.launch(HeikaCoroutineGuard) {
            runCatching {
                repository.saveCollection(null, title.trim(), description.trim(), coverUrl, kind, "community", status)
            }.onSuccess { created ->
                mutableState.update { it.copy(saving = false, items = listOf(created) + it.items, notice = "合集已创建，审核通过后公开展示") }
                onCreated(created)
            }.onFailure { error ->
                mutableState.update { it.copy(saving = false, notice = error.message ?: "合集创建失败") }
            }
        }
    }
}
