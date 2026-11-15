package com.heika.nativeapp.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.db.DailyStateEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.IOException
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
    private val loadMutex = Mutex()

    init {
        viewModelScope.launch {
            val session = auth.restore()
            load(session?.userId ?: HomeUiState.GUEST_ID)
            auth.session.drop(1).collect { changed ->
                val nextUser = changed?.userId ?: HomeUiState.GUEST_ID
                if (nextUser != mutableState.value.userId) {
                    val old = mutableState.value.userId
                    if (old != HomeUiState.GUEST_ID) repository.clearUserCache(old)
                    mutableState.value = HomeUiState(userId = nextUser, loading = true)
                    load(nextUser)
                }
            }
        }
    }

    fun reload() = viewModelScope.launch { openMutex.withLock { load(mutableState.value.userId) } }

    private suspend fun load(userId: String) = loadMutex.withLock { loadLatest(userId) }

    private suspend fun loadLatest(userId: String) {
        var day = LocalDate.now().toString()
        var local = repository.dailyState(userId, day)
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
            val libraryResult = runCatching { repository.myLibraryState() }
            libraryResult.onSuccess { library ->
                val flipState = library.optJSONObject("dailyFlipState")
                val serverDay = flipState?.optString("localDate")?.takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) }
                if (serverDay != null && serverDay != day) {
                    day = serverDay
                    local = repository.dailyState(userId, day)
                    candidates = local?.candidateIds?.split(',')?.mapNotNull(String::toIntOrNull).orEmpty()
                    opened = local?.openedIds?.split(',')?.mapNotNull(String::toIntOrNull).orEmpty()
                    posts = decodePosts(local?.openedPosts.orEmpty())
                }
                val bonus = flipState?.optInt("bonus")
                val fromServer = flipState?.optJSONArray("openedIds")?.let { ids ->
                    buildList { for (index in 0 until ids.length()) ids.optInt(index).takeIf { it > 0 }?.let(::add) }
                } ?: buildList {
                    // Backwards compatibility while an older API response is still in use.
                    val interactions = library.optJSONArray("interactions")
                    for (index in 0 until (interactions?.length() ?: 0)) {
                        val row = interactions?.optJSONObject(index) ?: continue
                        if (!row.optString("opened_at").startsWith(day)) continue
                        row.optJSONObject("posts")?.optInt("client_id")?.takeIf { it > 0 }?.let(::add)
                    }
                }
                if (flipState != null) {
                    luckyBonus = bonus?.coerceIn(0, 10) ?: 0
                    allowance = flipState.optInt("allowance", DailyDeckLogic.allowanceFor(library.optJSONObject("profile")?.optString("membership_tier")) + luckyBonus)
                    opened = fromServer.distinct()
                } else {
                    allowance = DailyDeckLogic.allowanceFor(library.optJSONObject("profile")?.optString("membership_tier")) + luckyBonus
                    opened = (opened + fromServer).distinct().take(allowance + 10)
                }
                candidates = (fromServer + candidates).distinct()
            }
            libraryResult.onFailure { if (posts.isEmpty()) mutableState.value = mutableState.value.copy(error = it.message ?: "连接暂时中断") }
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
        val activeUserId = runCatching { auth.restore()?.userId ?: HomeUiState.GUEST_ID }.getOrDefault(userId)
        if (activeUserId != userId) return
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
            // Ignore taps from a second card while the selected card is waiting for the
            // server or its reveal animation. The mutex alone would queue a second flip.
            if (current.openingId != null) return@withLock
            if (id in current.openedIds) return@withLock
            if (current.userId == HomeUiState.GUEST_ID && current.openedIds.size >= current.allowance) {
                mutableState.value = current.copy(notice = "今天的翻卡次数已用完，已解锁内容仍可查看")
                return@withLock
            }
            mutableState.value = current.copy(openingId = id, error = null, notice = null)
            runCatching {
                confirmFlip(current, id)
            }
                .onSuccess { confirmed ->
                    val latest = mutableState.value
                    if (latest.userId != current.userId || latest.day != current.day || latest.openingId != id) return@onSuccess
                    val updatedDay = confirmed.localDate ?: current.day
                    val extra = confirmed.bonusAwarded
                    val opened = confirmed.openedIds ?: (latest.openedIds + id).distinct()
                    val bonus = confirmed.bonusTotal ?: (latest.luckyBonus + extra).coerceAtMost(10)
                    val allowance = confirmed.allowance ?: (latest.allowance + extra)
                    val updated = latest.copy(
                        day = updatedDay,
                        openingId = null,
                        openedIds = opened,
                        posts = latest.posts + (id to confirmed.post),
                        luckyBonus = bonus,
                        allowance = allowance,
                        notice = if (extra > 0) "幸运加成 +$extra 次" else null,
                    )
                    mutableState.value = updated
                    persist()
                }
                .onFailure {
                    val latest = mutableState.value
                    if (latest.userId == current.userId && latest.openingId == id) {
                        mutableState.value = latest.copy(openingId = null, error = it.message ?: "卡片暂时无法翻开，请重试")
                    }
                }
        }
    }

    private suspend fun confirmFlip(current: HomeUiState, id: Int): FlipConfirmation {
        if (current.userId == HomeUiState.GUEST_ID) {
            val post = repository.revealCard(id)
            if (post.id != id) throw IOException("返回的卡片与所选卡片不一致")
            val extra = if (current.luckyBonus >= 10) 0 else DailyDeckLogic.luckyBonusFor(kotlin.random.Random.nextDouble()).coerceAtMost(10 - current.luckyBonus)
            return FlipConfirmation(post = post, bonusAwarded = extra, bonusTotal = current.luckyBonus + extra, allowance = current.allowance + extra)
        }
        if (auth.current()?.userId != current.userId) throw IOException("账号已切换，请重新加载首页")
        val payload = repository.confirmDailyFlip(id, current.day)
        val postJson = payload.optJSONObject("post") ?: throw IOException("翻卡内容暂不可用，请重试")
        val post = HeikaPost.from(postJson)
        if (post.id != id) throw IOException("返回的卡片与所选卡片不一致")
        val state = payload.optJSONObject("flipState") ?: throw IOException("服务端未返回翻卡状态，请重试")
        val openedIds = state.optJSONArray("openedIds")?.let { ids ->
            buildList<Int> {
                for (index in 0 until ids.length()) {
                    val openedId = ids.optInt(index)
                    if (openedId > 0) add(openedId)
                }
            }
        } ?: throw IOException("服务端未返回已翻记录，请重试")
        val localDate = state.optString("localDate").takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) }
            ?: throw IOException("服务端翻卡日期无效，请重试")
        return FlipConfirmation(
            post = post,
            localDate = localDate,
            openedIds = openedIds,
            bonusAwarded = if (state.optBoolean("idempotent")) 0 else state.optInt("bonusAwarded").coerceIn(0, 10),
            bonusTotal = state.optInt("bonus").coerceIn(0, 10),
            allowance = state.optInt("allowance").takeIf { it >= 0 } ?: current.allowance,
        )
    }

    private data class FlipConfirmation(
        val post: HeikaPost,
        val localDate: String? = null,
        val openedIds: List<Int>? = null,
        val bonusAwarded: Int,
        val bonusTotal: Int? = null,
        val allowance: Int? = null,
    )

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
