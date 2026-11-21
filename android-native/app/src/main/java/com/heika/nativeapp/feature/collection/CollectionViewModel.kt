package com.heika.nativeapp.feature.collection

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaChapter
import com.heika.nativeapp.data.HeikaCollection
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import com.heika.nativeapp.ui.HeikaCoroutineGuard
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.IOException
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CollectionState(
    val collection: HeikaCollection? = null,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val ownWorks: List<HeikaPost> = emptyList(),
    val pickerLoading: Boolean = false,
)

@HiltViewModel
class CollectionViewModel @Inject constructor(private val repository: HeikaRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(CollectionState())
    val state = mutableState.asStateFlow()
    private var loadedId: String? = null

    fun load(id: String, force: Boolean = false) {
        if (id.isBlank()) {
            mutableState.value = CollectionState(loading = false, error = "合集不存在")
            return
        }
        if (!force && loadedId == id && mutableState.value.collection != null && mutableState.value.error == null) return
        loadedId = id
        val current = mutableState.value.collection?.takeIf { it.id == id }
        mutableState.value = CollectionState(collection = current, loading = current == null)
        viewModelScope.launch(HeikaCoroutineGuard) {
            runCatching { repository.collectionDetail(id) }
                .onSuccess { collection -> mutableState.value = CollectionState(collection = collection, loading = false) }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(loading = false, error = error.message ?: "合集加载失败")
                    }
                }
        }
    }

    fun clearNotice() = mutableState.update { it.copy(notice = null) }

    fun setNotice(message: String) = mutableState.update { it.copy(notice = message) }

    private fun mutate(block: suspend () -> String) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(busy = true) }
        viewModelScope.launch(HeikaCoroutineGuard) {
            val result = runCatching { block() }
            mutableState.update {
                it.copy(
                    busy = false,
                    notice = result.getOrNull() ?: result.exceptionOrNull()?.message ?: "操作失败",
                )
            }
            loadedId?.let { id -> load(id, force = true) }
        }
    }

    fun toggleFollow() {
        val collection = mutableState.value.collection ?: return
        val next = !collection.following
        mutate {
            repository.followCollection(collection.id, next, notify = collection.notify)
            if (next) "已收藏合集，新章节过审后会提醒你" else "已取消收藏"
        }
    }

    fun setNotify(notify: Boolean) {
        val collection = mutableState.value.collection ?: return
        mutate {
            repository.setCollectionNotify(collection.id, notify)
            if (notify) "已开启更新提醒" else "已关闭更新提醒"
        }
    }

    fun recordProgress(postId: String) {
        val collection = mutableState.value.collection ?: return
        viewModelScope.launch(HeikaCoroutineGuard) {
            repository.recordCollectionProgress(collection.id, postId)
            mutableState.update { state ->
                state.collection?.let { state.copy(collection = it.copy(progressPostId = postId)) } ?: state
            }
        }
    }

    fun loadOwnWorks() {
        if (mutableState.value.pickerLoading) return
        mutableState.update { it.copy(pickerLoading = true) }
        viewModelScope.launch(HeikaCoroutineGuard) {
            val works = runCatching {
                repository.myLibrary("own").optJSONArray("items").jsonObjects().map(HeikaPost::from)
            }.getOrDefault(emptyList())
            mutableState.update { it.copy(ownWorks = works, pickerLoading = false) }
        }
    }

    fun addWorks(postIds: List<String>) {
        val collection = mutableState.value.collection ?: return
        if (postIds.isEmpty()) {
            mutableState.update { it.copy(notice = "请选择要加入合集的作品") }
            return
        }
        mutate {
            repository.addCollectionItems(collection.id, postIds)
            "已加入 ${postIds.size} 篇作品"
        }
    }

    fun removeChapter(chapter: HeikaChapter) {
        val collection = mutableState.value.collection ?: return
        mutate {
            repository.removeCollectionItem(collection.id, chapter.id)
            "已从合集移除「${chapter.title}」，作品本身已保留"
        }
    }

    /** 拖动排序的最小实现：上移/下移一位，链路与网页端 reorder 一致。 */
    fun move(chapter: HeikaChapter, delta: Int) {
        val collection = mutableState.value.collection ?: return
        val ordered = collection.chapters.toMutableList()
        val from = ordered.indexOfFirst { it.id == chapter.id }
        val to = from + delta
        if (from < 0 || to !in ordered.indices) return
        val moved = ordered.removeAt(from)
        ordered.add(to, moved)
        mutate {
            repository.addCollectionItems(collection.id, ordered.map { it.id }, reorder = true)
            "章节顺序已更新"
        }
    }

    fun saveMeta(
        title: String,
        description: String,
        kind: String,
        status: String,
        coverUrl: String?,
        onSaved: () -> Unit,
    ) {
        val collection = mutableState.value.collection
        if (title.trim().length < 2) {
            mutableState.update { it.copy(notice = "合集名称至少 2 个字") }
            return
        }
        mutate {
            repository.saveCollection(
                id = collection?.id,
                title = title.trim(),
                description = description.trim(),
                coverUrl = coverUrl,
                kind = kind,
                channel = collection?.channel ?: "community",
                status = status,
            )
            onSaved()
            if (collection == null) "合集已创建，标题与简介需要审核后公开展示" else "合集资料已提交，审核通过后替换线上版本"
        }
    }

    fun deleteSeries(onDeleted: () -> Unit) {
        val collection = mutableState.value.collection ?: return
        viewModelScope.launch(HeikaCoroutineGuard) {
            runCatching { repository.deleteCollection(collection.id) }
                .onSuccess {
                    mutableState.update { it.copy(notice = "合集已删除，其中作品已保留") }
                    onDeleted()
                }
                .onFailure { error ->
                    mutableState.update { it.copy(notice = error.message ?: "删除失败") }
                }
        }
    }

    fun throwIfBlank(value: String, message: String) {
        if (value.isBlank()) throw IOException(message)
    }
}
