package com.heika.nativeapp.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.db.DailyStateEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class HomeUiState(
    val userId: String = GUEST_ID,
    val day: String = LocalDate.now().toString(),
    val candidateIds: List<Int> = emptyList(),
    val openedIds: List<Int> = emptyList(),
    val posts: Map<Int, HeikaPost> = emptyMap(),
    val allowance: Int = 5,
    val luckyBonus: Int = 0,
    val loading: Boolean = true,
    val openingId: Int? = null,
    val error: String? = null,
    val notice: String? = null,
) {
    val remaining: Int get() = (allowance - openedIds.size).coerceAtLeast(0)
    companion object { const val GUEST_ID = "guest" }
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(HomeUiState())
    val state = mutableState.asStateFlow()
    private val openMutex = Mutex()

    init {
        viewModelScope.launch {
            val session = auth.restore()
            load(session?.userId ?: HomeUiState.GUEST_ID)
            auth.session.drop(1).collect { changed ->
                val nextUser = changed?.userId ?: HomeUiState.GUEST_ID
                if (nextUser != mutableState.value.userId) {
                    val old = mutableState.value.userId
                    if (old != HomeUiState.GUEST_ID) repository.clearUserCache(old)
                    load(nextUser)
                }
            }
        }
    }

    fun reload() = viewModelScope.launch { load(mutableState.value.userId) }

    private suspend fun load(userId: String) {
        val day = LocalDate.now().toString()
        val local = repository.dailyState(userId, day)
        var candidates = local?.candidateIds?.split(',')?.mapNotNull(String::toIntOrNull).orEmpty()
        var opened = local?.openedIds?.split(',')?.mapNotNull(String::toIntOrNull).orEmpty()
        var posts = decodePosts(local?.openedPosts.orEmpty())
        var allowance = local?.allowance ?: 5
        var luckyBonus = local?.luckyBonus ?: 0
        mutableState.value = HomeUiState(
            userId = userId, day = day, candidateIds = candidates, openedIds = opened,
            posts = posts, allowance = allowance, luckyBonus = luckyBonus,
            loading = candidates.isEmpty(),
        )

        var interests = emptySet<String>()
        if (userId != HomeUiState.GUEST_ID) {
            runCatching { repository.myLibraryState() }.onSuccess { library ->
                // Membership allowance is the base quota; the locally persisted daily
                // lucky bonus must remain added after a cold start.
                allowance = DailyDeckLogic.allowanceFor(library.optJSONObject("profile")?.optString("membership_tier")) + luckyBonus
                val interestRows = library.optJSONArray("interests")
                interests = buildSet {
                    for (index in 0 until (interestRows?.length() ?: 0)) {
                        interestRows?.optJSONObject(index)?.optJSONObject("interest_tags")?.optString("name")
                            ?.takeIf(String::isNotBlank)?.let(::add)
                    }
                }
                val interactions = library.optJSONArray("interactions")
                val fromServer = buildList {
                    for (index in 0 until (interactions?.length() ?: 0)) {
                        val row = interactions?.optJSONObject(index) ?: continue
                        if (!row.optString("opened_at").startsWith(day)) continue
                        val id = row.optJSONObject("posts")?.optInt("client_id") ?: 0
                        if (id > 0) add(id)
                    }
                }
                opened = (opened + fromServer).distinct().take(allowance + 10)
                candidates = (fromServer + candidates).distinct()
            }
        }

        if (candidates.size < 50) {
            runCatching { repository.publicCardIds() }
                .onSuccess { ids ->
                    val ranked = DailyDeckLogic.rankCandidates(ids, day, interests, posts)
                    candidates = (candidates + ranked).distinct().take(50)
                }
                .onFailure { if (posts.isEmpty()) mutableState.value = mutableState.value.copy(error = it.message ?: "连接暂时中断") }
        }
        if (opened.isNotEmpty()) {
            runCatching { repository.revealedCards(opened) }.onSuccess { fresh ->
                posts = posts + fresh.associateBy(HeikaPost::id)
            }
        }
        mutableState.value = HomeUiState(
            userId = userId,
            day = day,
            candidateIds = candidates,
            openedIds = opened,
            posts = posts,
            allowance = allowance,
            luckyBonus = luckyBonus,
            loading = false,
            error = if (candidates.isEmpty() && posts.isEmpty()) mutableState.value.error else null,
        )
        persist()
    }

    fun flip(id: Int) = viewModelScope.launch {
        openMutex.withLock {
            val current = mutableState.value
            if (id in current.openedIds) return@withLock
            if (current.openedIds.size >= current.allowance) {
                mutableState.value = current.copy(notice = "今天的翻卡次数已用完，已解锁内容仍可查看")
                return@withLock
            }
            mutableState.value = current.copy(openingId = id, error = null, notice = null)
            runCatching { repository.revealCard(id) }
                .onSuccess { post ->
                    val extra = if (current.luckyBonus >= 10) 0 else DailyDeckLogic.luckyBonusFor(kotlin.random.Random.nextDouble()).coerceAtMost(10 - current.luckyBonus)
                    val updated = mutableState.value.copy(
                        openingId = null,
                        openedIds = (current.openedIds + id).distinct(),
                        posts = mutableState.value.posts + (id to post),
                        luckyBonus = current.luckyBonus + extra,
                        allowance = current.allowance + extra,
                        notice = if (extra > 0) "幸运加成 +$extra 次" else null,
                    )
                    mutableState.value = updated
                    persist()
                    if (current.userId != HomeUiState.GUEST_ID) {
                        runCatching { repository.recordOpen(id) }.onFailure {
                            mutableState.value = mutableState.value.copy(notice = "已保存在本机，阅读记录稍后同步")
                        }
                    }
                }
                .onFailure { mutableState.value = mutableState.value.copy(openingId = null, error = it.message ?: "卡片暂时无法翻开，请重试") }
        }
    }

    fun clearMessages() { mutableState.value = mutableState.value.copy(error = null, notice = null) }

    private suspend fun persist() = withContext(Dispatchers.IO) {
        val current = mutableState.value
        runCatching {
            repository.saveDailyState(
                DailyStateEntity(
                    userId = current.userId,
                    day = current.day,
                    candidateIds = current.candidateIds.joinToString(","),
                    openedIds = current.openedIds.joinToString(","),
                    openedPosts = JSONObject().apply {
                        current.posts.filterKeys { it in current.openedIds }.forEach { (id, post) -> put(id.toString(), JSONObject(post.rawJson)) }
                    }.toString(),
                    allowance = current.allowance,
                    luckyBonus = current.luckyBonus,
                    cachedAt = System.currentTimeMillis(),
                ),
            )
        }
    }

    private fun decodePosts(source: String): Map<Int, HeikaPost> = runCatching {
        val json = JSONObject(source)
        buildMap {
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val post = json.optJSONObject(key) ?: continue
                val value = HeikaPost.from(post)
                put(value.id, value)
            }
        }
    }.getOrDefault(emptyMap())

}
