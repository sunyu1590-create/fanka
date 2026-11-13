package com.heika.nativeapp.feature.exploration

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.FeedFilter
import com.heika.nativeapp.data.FeedPageKey
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.jsonObjects
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.YearMonth
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

data class MissionItem(
    val key: String,
    val title: String,
    val description: String,
    val points: Int,
    val progress: Int,
    val target: Int,
    val claimed: Boolean,
)

data class ExperienceEvent(val type: String, val points: Int, val createdAt: String)

data class ExplorationAd(
    val title: String,
    val body: String,
    val imageUrl: String?,
    val post: HeikaPost,
)

data class ExplorationCenterState(
    val accountId: String? = null,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val serverDate: String? = null,
    val updatedAtMillis: Long? = null,
    val streak: Int = 0,
    val missions: List<MissionItem> = emptyList(),
    val experience: Int = 0,
    val claimedLevels: Set<Int> = emptySet(),
    val events: List<ExperienceEvent> = emptyList(),
    val ad: ExplorationAd? = null,
    val busyMission: String? = null,
    val busyLevel: Int? = null,
    val error: String? = null,
    val notice: String? = null,
)

@HiltViewModel
class ExplorationViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(ExplorationCenterState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var activeUserId: String? = null
    private var loadingUserId: String? = null
    private var lastLoadedAtByUser = mutableMapOf<String, Long>()

    init {
        viewModelScope.launch {
            auth.session.collect { session ->
                val userId = session?.userId
                if (userId != activeUserId) {
                    activeUserId = userId
                    generation++
                    loadingUserId = null
                    mutableState.value = ExplorationCenterState(accountId = userId, loading = userId != null)
                    if (userId != null) loadFor(userId, force = true)
                }
            }
        }
    }

    fun load(force: Boolean = false) = viewModelScope.launch {
        val userId = runCatching { auth.current()?.userId }.getOrNull()
        if (userId == null) {
            activeUserId = null
            generation++
            mutableState.value = ExplorationCenterState(loading = false, error = "登录后查看探索成长")
            return@launch
        }
        if (activeUserId != userId) {
            activeUserId = userId
            generation++
            mutableState.value = ExplorationCenterState(accountId = userId)
        }
        loadFor(userId, force)
    }

    private fun loadFor(userId: String, force: Boolean) = viewModelScope.launch {
        if (!force && loadingUserId == userId) return@launch
        if (!force && mutableState.value.accountId == userId && mutableState.value.error == null && System.currentTimeMillis() - (lastLoadedAtByUser[userId] ?: 0L) < 45_000L) return@launch
        loadingUserId = userId
        val requestGeneration = ++generation
        if (mutableState.value.accountId != userId) mutableState.value = ExplorationCenterState(accountId = userId)
        repository.explorationSnapshot(userId)?.let { cached ->
            if (activeUserId == userId && requestGeneration == generation) {
                mutableState.value = parseSnapshot(cached, userId).copy(loading = false, refreshing = true)
            }
        }
        if (mutableState.value.accountId == userId && mutableState.value.missions.isEmpty()) {
            mutableState.update { it.copy(loading = true, refreshing = false, error = null) }
        } else {
            mutableState.update { it.copy(loading = false, refreshing = true, error = null) }
        }
        try {
            val missionsRequest = async { repository.dailyMissions() }
            val progressionRequest = async { repository.progression() }
            val calendarRequest = async { runCatching { repository.explorationCalendar(userId) }.getOrNull() }
            val missionsJson = missionsRequest.await()
            val progressionJson = progressionRequest.await()
            val calendarJson = calendarRequest.await()
            if (activeUserId != userId || requestGeneration != generation) return@launch
            val missionsArray = missionsJson.optJSONArray("missions") ?: JSONArray()
            val missions = (0 until missionsArray.length()).mapNotNull { index ->
                val item = missionsArray.optJSONObject(index) ?: return@mapNotNull null
                MissionItem(
                    item.optString("key"), item.optString("title"), item.optString("description"),
                    item.optInt("points"), item.optInt("progress"), item.optInt("target"), item.optBoolean("claimed"),
                )
            }
            val claimed = progressionJson.optJSONArray("claimedLevels")
            val events = progressionJson.optJSONArray("events").jsonObjects().map { event ->
                ExperienceEvent(event.optString("type"), event.optInt("points"), event.optString("createdAt"))
            }
            val next = ExplorationCenterState(
                accountId = userId,
                loading = false,
                serverDate = missionsJson.optString("date").takeIf(String::isNotBlank),
                updatedAtMillis = System.currentTimeMillis(),
                streak = calendarJson?.optInt("streak") ?: mutableState.value.streak,
                missions = missions,
                experience = progressionJson.optInt("total"),
                claimedLevels = (0 until (claimed?.length() ?: 0)).mapNotNull { claimed?.optInt(it)?.takeIf { value -> value in 1..10 } }.toSet(),
                events = events,
            )
            mutableState.value = next
            repository.saveExplorationSnapshot(userId, encodeSnapshot(next, missionsJson, progressionJson, calendarJson))
            lastLoadedAtByUser[userId] = System.currentTimeMillis()
            viewModelScope.launch {
                val configured = runCatching { repository.explorationAd() }.getOrNull()
                val ad = configured?.takeIf { it.optBoolean("enabled") }?.let { value ->
                    val postId = value.optString("post_id")
                    val title = value.optString("title").takeIf(String::isNotBlank)
                    if (postId.isBlank() || title == null) null else runCatching { repository.postDetailByKey(postId) }.getOrNull()?.let { post ->
                        ExplorationAd(title, value.optString("body"), value.optString("image_url").takeIf(String::isNotBlank), post)
                    }
                }
                if (activeUserId == userId && generation == requestGeneration && mutableState.value.accountId == userId) {
                    mutableState.update { it.copy(ad = ad) }
                }
            }
        } catch (error: Exception) {
            if (activeUserId == userId && requestGeneration == generation) {
                mutableState.update { it.copy(loading = false, refreshing = false, error = error.message ?: "探索数据加载失败") }
            }
        } finally {
            if (loadingUserId == userId) loadingUserId = null
            if (activeUserId == userId && requestGeneration == generation) mutableState.update { it.copy(loading = false, refreshing = false) }
        }
    }

    fun claimMission(key: String) = viewModelScope.launch {
        val current = mutableState.value
        val mission = current.missions.firstOrNull { it.key == key } ?: return@launch
        if (!ExplorationLogic.canClaim(mission.progress, mission.target, mission.claimed, current.busyMission != null)) return@launch
        val userId = current.accountId ?: return@launch
        mutableState.update { it.copy(busyMission = key, error = null, notice = null) }
        runCatching { repository.claimDailyMission(key) }
            .onSuccess { result ->
                if (activeUserId != userId) return@onSuccess
                val notice = if (result.optBoolean("claimed")) "已领取 ${result.optInt("points")} EXP" else "这项任务奖励已领取"
                mutableState.update { it.copy(busyMission = null, notice = notice) }
                load(force = true)
            }
            .onFailure { error ->
                if (activeUserId == userId) mutableState.update { it.copy(busyMission = null, error = error.message ?: "领取失败，请重试") }
            }
    }

    fun claimLevel(level: Int) = viewModelScope.launch {
        val current = mutableState.value
        val reward = ExplorationLogic.levels.firstOrNull { it.level == level } ?: return@launch
        if (current.experience < reward.threshold || level in current.claimedLevels || current.busyLevel != null) return@launch
        val userId = current.accountId ?: return@launch
        mutableState.update { it.copy(busyLevel = level, error = null, notice = null) }
        runCatching { repository.claimExperienceReward(level) }
            .onSuccess { result ->
                if (activeUserId != userId) return@onSuccess
                val notice = if (result.optBoolean("claimed")) "已领取：${reward.reward}" else "该等级奖励已领取"
                mutableState.update { it.copy(busyLevel = null, notice = notice) }
                load(force = true)
            }
            .onFailure { error ->
                if (activeUserId == userId) mutableState.update { it.copy(busyLevel = null, error = error.message ?: "奖励领取失败，请重试") }
            }
    }

    private fun parseSnapshot(json: JSONObject, userId: String): ExplorationCenterState {
        val missions = json.optJSONArray("missions").jsonObjects().map { item ->
            MissionItem(item.optString("key"), item.optString("title"), item.optString("description"), item.optInt("points"), item.optInt("progress"), item.optInt("target"), item.optBoolean("claimed"))
        }
        val claimed = json.optJSONArray("claimedLevels")
        val events = json.optJSONArray("events").jsonObjects().map { ExperienceEvent(it.optString("type"), it.optInt("points"), it.optString("createdAt")) }
        return ExplorationCenterState(
            accountId = userId,
            loading = false,
            serverDate = json.optString("date").takeIf(String::isNotBlank),
            streak = json.optInt("streak"),
            missions = missions,
            experience = json.optInt("total"),
            claimedLevels = (0 until (claimed?.length() ?: 0)).mapNotNull { claimed?.optInt(it)?.takeIf { value -> value in 1..10 } }.toSet(),
            events = events,
        )
    }

    private fun encodeSnapshot(state: ExplorationCenterState, missions: JSONObject, progression: JSONObject, calendar: JSONObject?): JSONObject =
        JSONObject().put("date", state.serverDate).put("streak", calendar?.optInt("streak") ?: state.streak)
            .put("missions", missions.optJSONArray("missions") ?: JSONArray())
            .put("total", progression.optInt("total"))
            .put("claimedLevels", progression.optJSONArray("claimedLevels") ?: JSONArray())
            .put("events", progression.optJSONArray("events") ?: JSONArray())
}

data class CalendarRecord(
    val date: String,
    val openedAt: String,
    val postId: String,
    val clientId: Int,
    val title: String,
    val tag: String,
    val channel: String,
    val image: String?,
    val rarityTier: String,
    val post: HeikaPost? = null,
)

data class ExplorationCalendarState(
    val accountId: String? = null,
    val month: String? = null,
    val timeZone: String = "Asia/Shanghai",
    val today: String? = null,
    val streak: Int = 0,
    val totalRecords: Int = 0,
    val counts: Map<String, Int> = emptyMap(),
    val records: List<CalendarRecord> = emptyList(),
    val selectedDate: String? = null,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ExplorationCalendarViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(ExplorationCalendarState())
    val state = mutableState.asStateFlow()
    private var activeUserId: String? = null
    private var generation = 0L
    private var calendarLoadJob: Job? = null
    private var calendarRequestMonth: String? = null
    private var lastLoadedCalendarKey: String? = null
    private var lastLoadedCalendarAt = 0L

    init {
        viewModelScope.launch {
            auth.session.collect { session ->
                if (session?.userId != activeUserId) {
                    val retainedMonth = mutableState.value.month
                    calendarRequestMonth = null
                    activeUserId = session?.userId
                    generation++
                    mutableState.value = ExplorationCalendarState(accountId = session?.userId, loading = session != null)
                    if (session != null) {
                        load(retainedMonth)
                    }
                }
            }
        }
    }

    fun load(month: String? = mutableState.value.month, refresh: Boolean = false): Job {
        val requestedMonth = month ?: "current"
        if (!refresh && calendarLoadJob?.isActive == true && calendarRequestMonth == requestedMonth) return calendarLoadJob!!
        calendarRequestMonth = requestedMonth
        val requestGeneration = ++generation
        val job = viewModelScope.launch {
        val session = runCatching { auth.current() }.getOrNull()
        if (session == null) {
            activeUserId = null
            mutableState.value = ExplorationCalendarState(loading = false, error = "登录后查看探索日历")
            return@launch
        }
        if (activeUserId != session.userId) {
            activeUserId = session.userId
            mutableState.value = ExplorationCalendarState(accountId = session.userId, loading = true)
        }
        val loadedKey = "${session.userId}:$requestedMonth"
        if (!refresh && lastLoadedCalendarKey == loadedKey && System.currentTimeMillis() - lastLoadedCalendarAt < 45_000L && mutableState.value.error == null) return@launch
        val cached = repository.cachedExplorationCalendar(session.userId, month)
        if (!refresh && cached != null && activeUserId == session.userId && requestGeneration == generation) {
            mutableState.value = parseCalendar(cached, session.userId).copy(loading = false, refreshing = true)
        } else if (mutableState.value.records.isEmpty() || mutableState.value.month != month) {
            mutableState.update {
                it.copy(
                    month = month ?: it.month,
                    counts = if (it.month == month) it.counts else emptyMap(),
                    records = if (it.month == month) it.records else emptyList(),
                    selectedDate = if (it.month == month) it.selectedDate else null,
                    loading = it.records.isEmpty() || it.month != month,
                    refreshing = false,
                    error = null,
                )
            }
        } else {
            mutableState.update { it.copy(refreshing = true, error = null) }
        }
        runCatching { repository.explorationCalendar(session.userId, month) }
            .onSuccess { response ->
                if (activeUserId != session.userId || requestGeneration != generation) return@onSuccess
                mutableState.value = parseCalendar(response, session.userId).copy(
                    selectedDate = mutableState.value.selectedDate?.takeIf { date -> date.startsWith(response.optString("month")) }
                        ?: response.optString("today").takeIf(String::isNotBlank),
                )
                lastLoadedCalendarKey = loadedKey
                lastLoadedCalendarAt = System.currentTimeMillis()
            }
            .onFailure { error ->
                if (activeUserId == session.userId && requestGeneration == generation) mutableState.update { it.copy(loading = false, refreshing = false, error = error.message ?: "日历加载失败") }
            }
        if (activeUserId == session.userId && requestGeneration == generation) mutableState.update { it.copy(loading = false, refreshing = false) }
        }
        calendarLoadJob = job
        job.invokeOnCompletion { if (calendarLoadJob == job) calendarRequestMonth = null }
        return job
    }

    fun selectDate(date: String) = mutableState.update { it.copy(selectedDate = date) }

    fun shiftMonth(amount: Long) {
        val month = mutableState.value.month?.let { runCatching { YearMonth.parse(it).plusMonths(amount).toString() }.getOrNull() } ?: return
        load(month)
    }

    private fun parseCalendar(json: JSONObject, userId: String): ExplorationCalendarState {
        val days = json.optJSONArray("days").jsonObjects().associate { it.optString("date") to it.optInt("count") }
        val records = json.optJSONArray("records").jsonObjects().mapNotNull { row ->
            val post = row.optJSONObject("post") ?: return@mapNotNull null
            val mappedPost = runCatching { HeikaPost.from(post) }.getOrNull() ?: return@mapNotNull null
            CalendarRecord(
                date = row.optString("date"), openedAt = row.optString("openedAt"), postId = mappedPost.cloudId,
                clientId = mappedPost.id, title = mappedPost.title, tag = mappedPost.tag,
                channel = mappedPost.channel, image = mappedPost.thumbnail,
                rarityTier = mappedPost.rarityTier, post = mappedPost,
            )
        }
        return ExplorationCalendarState(
            accountId = userId, month = json.optString("month").takeIf(String::isNotBlank), timeZone = json.optString("timeZone", "Asia/Shanghai"),
            today = json.optString("today").takeIf(String::isNotBlank), streak = json.optInt("streak"), counts = days, records = records,
            totalRecords = json.optInt("total", records.size),
            selectedDate = json.optString("today").takeIf(String::isNotBlank), loading = false,
        )
    }
}

data class CoExplorePick(val userId: String, val nickname: String, val postId: String?, val title: String, val tag: String, val image: String?, val note: String, val post: HeikaPost? = null)

data class CoExploreRoomState(
    val accountId: String? = null,
    val inviteCode: String = "",
    val roomId: String = "",
    val hostId: String = "",
    val guestId: String? = null,
    val prompt: String = "今天最想和朋友分享哪一份灵感？",
    val expiresAt: String = "",
    val ownPick: Boolean = false,
    val revealed: Boolean = false,
    val expired: Boolean = false,
    val picks: List<CoExplorePick> = emptyList(),
    val candidates: List<HeikaPost> = emptyList(),
    val selectedPostId: String? = null,
    val note: String = "",
    val joiningCode: String = "",
    val busy: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
)

@HiltViewModel
class CoExploreViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(CoExploreRoomState())
    val state = mutableState.asStateFlow()
    private var activeUserId: String? = null
    private var generation = 0L
    private var requestedInviteCode: String? = null
    private var roomRequestGeneration = 0L
    private val candidatesMutex = Mutex()
    private var candidateCacheUserId: String? = null
    private var candidateCacheAt = 0L

    init {
        viewModelScope.launch {
            auth.session.collect { session ->
                if (session?.userId != activeUserId) {
                    activeUserId = session?.userId
                    generation++
                    roomRequestGeneration++
                    candidateCacheUserId = null
                    candidateCacheAt = 0L
                    mutableState.value = CoExploreRoomState(accountId = session?.userId, loading = session != null)
                    if (session != null) initialize(requestedInviteCode)
                }
            }
        }
    }

    fun initialize(inviteCode: String?) = viewModelScope.launch {
        requestedInviteCode = inviteCode?.takeIf(String::isNotBlank)
        val session = runCatching { auth.current() }.getOrNull()
        if (session == null) {
            activeUserId = null
            mutableState.value = CoExploreRoomState(loading = false, error = "登录后使用双人探索")
            return@launch
        }
        if (activeUserId != session.userId) {
            activeUserId = session.userId
            generation++
            mutableState.value = CoExploreRoomState(accountId = session.userId, loading = true)
        }
        val token = ++generation
        val candidates = candidatesMutex.withLock {
            if (candidateCacheUserId == session.userId && System.currentTimeMillis() - candidateCacheAt < 60_000L) mutableState.value.candidates
            else runCatching { repository.communityPage(FeedFilter(), FeedPageKey()).posts.filter { it.cloudId.isNotBlank() } }
                .getOrDefault(emptyList())
                .also { candidateCacheUserId = session.userId; candidateCacheAt = System.currentTimeMillis() }
        }
        if (activeUserId != session.userId || token != generation) return@launch
        mutableState.update { it.copy(candidates = candidates, loading = false) }
        if (!inviteCode.isNullOrBlank()) join(inviteCode)
    }

    fun setCode(value: String) = mutableState.update { it.copy(joiningCode = value.uppercase().filter { char -> char.isLetterOrDigit() }.take(20)) }
    fun selectPost(id: String) = mutableState.update { it.copy(selectedPostId = id) }
    fun setNote(value: String) = mutableState.update { it.copy(note = value.take(180)) }

    fun create() = viewModelScope.launch {
        val userId = mutableState.value.accountId ?: return@launch
        if (mutableState.value.busy) return@launch
        beginAction()
        runCatching { repository.createCoExploreRoom() }
            .onSuccess { result ->
                if (activeUserId != userId) return@onSuccess
                val code = result.optString("invite_code").uppercase()
                if (code.isBlank()) mutableState.update { it.copy(busy = false, error = "服务端没有返回邀请码") }
                else loadRoom(code, "双人探索已创建，邀请朋友加入吧")
            }
            .onFailure { if (activeUserId == userId) failAction(it.message ?: "创建房间失败") }
    }

    fun join(code: String = mutableState.value.joiningCode) = viewModelScope.launch {
        val userId = mutableState.value.accountId ?: return@launch
        if (mutableState.value.busy) return@launch
        val invite = code.trim().uppercase()
        if (invite.length < 6) { mutableState.update { it.copy(error = "请输入有效邀请码") }; return@launch }
        beginAction()
        runCatching { repository.joinCoExploreRoom(invite) }
            .onSuccess {
                if (activeUserId == userId) loadRoom(invite, "已加入双人探索")
            }
            .onFailure { if (activeUserId == userId) failAction(it.message ?: "加入失败") }
    }

    fun refresh() {
        val code = mutableState.value.inviteCode
        if (code.isNotBlank()) viewModelScope.launch { loadRoom(code, null) }
    }

    fun lockSelection() = viewModelScope.launch {
        val current = mutableState.value
        val userId = current.accountId ?: return@launch
        val code = current.inviteCode
        val postId = current.selectedPostId ?: return@launch
        if (current.busy || code.isBlank() || current.ownPick || current.guestId.isNullOrBlank()) return@launch
        beginAction()
        runCatching { repository.pickCoExplorePost(code, postId, current.note) }
            .onSuccess {
                if (activeUserId == userId) loadRoom(code, "已锁定选择，双方完成后即可揭晓")
            }
            .onFailure { if (activeUserId == userId) failAction(it.message ?: "保存选择失败") }
    }

    private suspend fun loadRoom(code: String, notice: String?) {
        val userId = mutableState.value.accountId ?: return
        val requestId = ++roomRequestGeneration
        val cached = repository.explorationRoom(userId, code)
        if (requestId == roomRequestGeneration && cached.has("room") && activeUserId == userId) applyRoom(cached, userId, code, notice = null)
        runCatching { repository.coExploreRoom(code) }
            .onSuccess { room ->
                if (activeUserId != userId || requestId != roomRequestGeneration) return@onSuccess
                applyRoom(room, userId, code, notice)
            }
            .onFailure { error ->
                if (activeUserId == userId && requestId == roomRequestGeneration) {
                    val message = error.message ?: "房间加载失败"
                    val expired = message.contains("已过期") || message.contains("不存在或已过期")
                    mutableState.update { it.copy(busy = false, loading = false, expired = expired, error = message) }
                }
            }
    }

    private suspend fun applyRoom(room: JSONObject, userId: String, code: String, notice: String?) {
        val roomJson = room.optJSONObject("room")
        if (roomJson == null) {
            mutableState.update { it.copy(busy = false, loading = false, error = "房间数据无效") }
            return
        }
        val picks = room.optJSONArray("picks").jsonObjects().map { pick ->
            val post = pick.optJSONObject("post")
            val mappedPost = post?.let { runCatching { HeikaPost.from(it) }.getOrNull() }
            val profile = pick.optJSONObject("profile")
            CoExplorePick(
                userId = pick.optString("user_id"), nickname = profile?.optString("nickname").orEmpty().ifBlank { "探索者" },
                postId = mappedPost?.cloudId?.takeIf(String::isNotBlank) ?: post?.optString("id")?.takeIf(String::isNotBlank),
                title = mappedPost?.title ?: post?.optString("title").orEmpty().ifBlank { "已删除的内容" }, tag = mappedPost?.tag ?: post?.optString("tag").orEmpty(),
                image = mappedPost?.thumbnail ?: post?.optJSONArray("images")?.optString(0)?.takeIf(String::isNotBlank), note = pick.optString("note"), post = mappedPost,
            )
        }
        mutableState.update { current ->
            if (current.accountId != userId) current else current.copy(
                inviteCode = roomJson.optString("invite_code", code), roomId = roomJson.optString("id"),
                hostId = roomJson.optString("host_id"), guestId = roomJson.optString("guest_id").takeIf(String::isNotBlank),
                prompt = roomJson.optString("prompt", "今天最想和朋友分享哪一份灵感？"), expiresAt = roomJson.optString("expires_at"),
                ownPick = room.optBoolean("ownPick"), revealed = room.optBoolean("revealed"), picks = picks,
                expired = false,
                selectedPostId = null, note = "", joiningCode = code, busy = false, loading = false, error = null, notice = notice,
            )
        }
        if (activeUserId == userId) repository.saveExplorationRoom(userId, code, room)
    }

    private fun beginAction() = mutableState.update { it.copy(busy = true, loading = true, error = null, notice = null) }
    private fun failAction(message: String) = mutableState.update { it.copy(busy = false, loading = false, error = message) }
}

data class ChainEntryState(val id: String, val userId: String, val nickname: String, val content: String, val createdAt: String)
data class ExplorationChain(
    val id: String,
    val ownerId: String,
    val seedPostId: String,
    val title: String,
    val prompt: String,
    val status: String,
    val seedTitle: String,
    val seedTag: String,
    val seedImage: String?,
    val ownerName: String,
    val entries: List<ChainEntryState>,
)

data class ExplorationChainsState(
    val accountId: String? = null,
    val items: List<ExplorationChain> = emptyList(),
    val candidates: List<HeikaPost> = emptyList(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val busy: Boolean = false,
    val selectedPostId: String? = null,
    val createdChainId: String? = null,
    val error: String? = null,
    val notice: String? = null,
)

@HiltViewModel
class ExplorationChainsViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(ExplorationChainsState())
    val state = mutableState.asStateFlow()
    private var activeUserId: String? = null
    private var generation = 0L
    private var chainsLoadJob: Job? = null
    private var chainsLoadUserId: String? = null
    private var lastChainsLoadUserId: String? = null
    private var lastChainsLoadAt = 0L

    init {
        viewModelScope.launch {
            auth.session.collect { session ->
                if (session?.userId != activeUserId) {
                    chainsLoadUserId = null
                    activeUserId = session?.userId
                    generation++
                    mutableState.value = ExplorationChainsState(accountId = session?.userId, loading = session != null)
                    if (session != null) load(force = true)
                }
            }
        }
    }

    fun load(force: Boolean = false): Job {
        if (!force && chainsLoadJob?.isActive == true && chainsLoadUserId == activeUserId) return chainsLoadJob!!
        chainsLoadUserId = activeUserId
        val token = ++generation
        val job = viewModelScope.launch {
        val session = runCatching { auth.current() }.getOrNull()
        if (session == null) {
            activeUserId = null
            mutableState.value = ExplorationChainsState(loading = false, error = "登录后查看故事接龙")
            return@launch
        }
        if (activeUserId != session.userId) {
            activeUserId = session.userId
            mutableState.value = ExplorationChainsState(accountId = session.userId)
        }
        if (!force && lastChainsLoadUserId == session.userId && System.currentTimeMillis() - lastChainsLoadAt < 45_000L && mutableState.value.error == null) return@launch
        val cached = repository.cachedExplorationChains(session.userId)
        if (!force && cached != null && activeUserId == session.userId && token == generation) {
            mutableState.value = parseChains(cached, session.userId).copy(loading = false, refreshing = true)
        } else if (mutableState.value.items.isEmpty()) mutableState.update { it.copy(loading = true, error = null) }
        else mutableState.update { it.copy(refreshing = true, error = null) }
        try {
            val chainsRequest = async { repository.explorationChains() }
            val postsRequest = async { runCatching { repository.communityPage(FeedFilter(), FeedPageKey()).posts.filter { it.cloudId.isNotBlank() } }.getOrDefault(emptyList()) }
            val chains = chainsRequest.await()
            val candidates = postsRequest.await()
            if (activeUserId != session.userId || token != generation) return@launch
            val parsed = parseChains(chains, session.userId).copy(candidates = candidates)
            mutableState.value = parsed
            repository.saveExplorationChains(session.userId, chains)
            lastChainsLoadUserId = session.userId
            lastChainsLoadAt = System.currentTimeMillis()
        } catch (error: Exception) {
            if (activeUserId == session.userId && token == generation) mutableState.update { it.copy(loading = false, refreshing = false, error = error.message ?: "接龙加载失败") }
        }
        }
        chainsLoadJob = job
        job.invokeOnCompletion { if (chainsLoadJob == job) chainsLoadUserId = null }
        return job
    }

    fun selectPost(id: String) = mutableState.update { it.copy(selectedPostId = id) }

    fun create(postId: String, title: String, prompt: String, content: String) = viewModelScope.launch {
        val userId = mutableState.value.accountId ?: return@launch
        if (mutableState.value.busy) return@launch
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        runCatching { repository.createExplorationChain(postId, title, prompt, content) }
            .onSuccess { response ->
                if (activeUserId != userId) return@onSuccess
                val id = response.optString("id")
                mutableState.update { it.copy(busy = false, selectedPostId = null, createdChainId = id.takeIf(String::isNotBlank), notice = "接龙已发起") }
                load(force = true)
            }
            .onFailure { error -> if (activeUserId == userId) mutableState.update { it.copy(busy = false, error = error.message ?: "创建失败，请检查输入后重试") } }
    }

    fun contribute(chainId: String, content: String) = viewModelScope.launch {
        val userId = mutableState.value.accountId ?: return@launch
        if (mutableState.value.busy) return@launch
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        runCatching { repository.contributeExplorationChain(chainId, content) }
            .onSuccess {
                if (activeUserId != userId) return@onSuccess
                mutableState.update { it.copy(busy = false, notice = "续写已加入接龙") }
                load(force = true)
            }
            .onFailure { error -> if (activeUserId == userId) mutableState.update { it.copy(busy = false, error = error.message ?: "续写失败，请重试") } }
    }

    fun close(chainId: String) = viewModelScope.launch {
        val userId = mutableState.value.accountId ?: return@launch
        if (mutableState.value.busy) return@launch
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        runCatching { repository.closeExplorationChain(chainId) }
            .onSuccess {
                if (activeUserId != userId) return@onSuccess
                mutableState.update { it.copy(busy = false, notice = "接龙已结束，记录仍会保留") }
                load(force = true)
            }
            .onFailure { error -> if (activeUserId == userId) mutableState.update { it.copy(busy = false, error = error.message ?: "结束接龙失败") } }
    }

    fun clearCreatedId() = mutableState.update { it.copy(createdChainId = null) }

    private fun parseChains(json: JSONObject, userId: String): ExplorationChainsState {
        val items = json.optJSONArray("items").jsonObjects().mapNotNull { item ->
            val seed = item.optJSONObject("seed")
            val entries = item.optJSONArray("entries").jsonObjects().map { entry ->
                ChainEntryState(entry.optString("id"), entry.optString("user_id"), entry.optJSONObject("author")?.optString("nickname").orEmpty().ifBlank { "探索者" }, entry.optString("content"), entry.optString("created_at"))
            }
            val id = item.optString("id")
            if (id.isBlank()) null else ExplorationChain(
                id = id, ownerId = item.optString("owner_id"), seedPostId = item.optString("seed_post_id"),
                title = item.optString("title"), prompt = item.optString("prompt"), status = item.optString("status"),
                seedTitle = seed?.optString("title").orEmpty(), seedTag = seed?.optString("tag").orEmpty(),
                seedImage = seed?.optString("cover_url")?.takeIf(String::isNotBlank) ?: seed?.optJSONArray("images")?.optString(0)?.takeIf(String::isNotBlank),
                ownerName = item.optJSONObject("owner")?.optString("nickname").orEmpty().ifBlank { "探索者" }, entries = entries,
            )
        }
        return ExplorationChainsState(accountId = userId, items = items, loading = false)
    }
}
