package com.heika.android.discovery

import android.app.Application
import android.os.Parcelable
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.security.MessageDigest

internal class DiscoveryViewModel(application: Application, private val savedState: SavedStateHandle) : AndroidViewModel(application) {
    private val repository = DiscoveryRepository(application)
    private val preferences = application.getSharedPreferences("heika-native-discovery-preferences", 0)
    private val mutableFeeds = MutableStateFlow(
        mapOf(
            DiscoveryChannel.COMMUNITY to restorePreferences(DiscoveryChannel.COMMUNITY),
            DiscoveryChannel.AI to restorePreferences(DiscoveryChannel.AI),
        ),
    )
    val feeds: StateFlow<Map<DiscoveryChannel, DiscoveryFeedState>> = mutableFeeds.asStateFlow()
    private val mutableInteractionUpdates = MutableSharedFlow<DiscoveryInteractionUpdate>(extraBufferCapacity = 16)
    val interactionUpdates: SharedFlow<DiscoveryInteractionUpdate> = mutableInteractionUpdates

    private var currentUserId: String? = null
    private var accessToken: String? = null
    private var personalization = restorePersonalization("guest")
    private val generation = mutableMapOf(
        DiscoveryChannel.COMMUNITY to 0,
        DiscoveryChannel.AI to 0,
    )
    private val feedJobs = mutableMapOf<DiscoveryChannel, Job>()
    private val categoryJobs = mutableMapOf<DiscoveryChannel, Job>()
    private val busyInteractions = mutableSetOf<String>()

    override fun onCleared() {
        feedJobs.values.forEach(Job::cancel)
        categoryJobs.values.forEach(Job::cancel)
        repository.close()
        super.onCleared()
    }

    init {
        loadCategories(DiscoveryChannel.COMMUNITY)
        loadCategories(DiscoveryChannel.AI)
    }

    fun setSession(userId: String?, token: String?) {
        val normalizedId = userId?.takeIf(String::isNotBlank)
        val normalizedToken = token?.takeIf(String::isNotBlank)
        if (normalizedId == currentUserId && normalizedToken == accessToken) return
        val previousUser = currentUserId
        val tokenBecameAvailable = accessToken.isNullOrBlank() && !normalizedToken.isNullOrBlank()
        val changedAccount = normalizedId != previousUser
        currentUserId = normalizedId
        accessToken = normalizedToken
        if (changedAccount) {
            feedJobs.values.forEach(Job::cancel)
            feedJobs.clear()
            generation.keys.forEach { generation[it] = generation.getValue(it) + 1 }
            if (previousUser != null) viewModelScope.launch { repository.clearUserCache(previousUser) }
            personalization = restorePersonalization(normalizedId ?: "guest")
            val oldFeeds = mutableFeeds.value
            mutableFeeds.value = DiscoveryChannel.entries.associateWith { channel ->
                restorePreferences(channel).copy(
                    categories = oldFeeds[channel]?.categories.orEmpty(),
                    tags = oldFeeds[channel]?.tags.orEmpty(),
                )
            }
            DiscoveryChannel.entries.forEach { channel ->
                if (state(channel).categories.isEmpty()) loadCategories(channel)
                else refresh(channel, useCache = true)
            }
        } else if (tokenBecameAvailable) {
            DiscoveryChannel.entries.forEach { channel -> refresh(channel, useCache = false) }
        }
    }

    fun setCategory(channel: DiscoveryChannel, name: String) {
        updatePreferences(channel) { it.copy(selectedCategory = name, selectedTopic = null, selectedContentType = if (channel == DiscoveryChannel.AI) null else it.selectedContentType) }
        refresh(channel, useCache = true, clearItems = true)
    }

    fun setTopic(channel: DiscoveryChannel, topic: DiscoveryCategory?) {
        updatePreferences(channel) { it.copy(selectedTopic = topic?.name) }
        refresh(channel, useCache = true, clearItems = true)
    }

    fun setContentType(channel: DiscoveryChannel, contentType: String?) {
        if (channel != DiscoveryChannel.AI) return
        updatePreferences(channel) { it.copy(selectedContentType = contentType?.takeIf(String::isNotBlank)) }
        refresh(channel, useCache = true, clearItems = true)
    }

    fun setSort(channel: DiscoveryChannel, sort: DiscoverySort) {
        updatePreferences(channel) { it.copy(sort = sort) }
        refresh(channel, useCache = true, clearItems = true)
    }

    fun refresh(channel: DiscoveryChannel, useCache: Boolean = false, clearItems: Boolean = false) {
        val requestedUser = currentUserId
        val requestToken = accessToken
        val requestPersonalization = personalization
        val myGeneration = generation.getValue(channel) + 1
        generation[channel] = myGeneration
        feedJobs[channel]?.cancel()
        feedJobs[channel] = viewModelScope.launch {
            val initialState = state(channel)
            val snapshotKey = cacheKey(initialState, requestedUser)
            update(channel) { it.copy(items = if (clearItems) emptyList() else it.items, loading = it.items.isEmpty() || clearItems, refreshing = true, error = null, cursor = null, page = 0, hasMore = true) }
            if (useCache && (initialState.items.isEmpty() || clearItems)) {
                runCatching { repository.cached(snapshotKey, channel) }.getOrNull()?.let { cached ->
                    if (generation[channel] == myGeneration && currentUserId == requestedUser) {
                        update(channel) { current -> current.copy(items = cached.items, cursor = cached.cursor, page = cached.page, hasMore = cached.hasMore, loading = false) }
                    }
                }
            }
            try {
                val queryState = state(channel)
                val result = repository.page(queryFor(queryState, requestedUser, requestToken, requestPersonalization))
                if (generation[channel] != myGeneration || currentUserId != requestedUser) return@launch
                update(channel) {
                    it.copy(
                        items = result.items,
                        cursor = result.cursor,
                        page = result.page,
                        hasMore = result.hasMore,
                        loading = false,
                        refreshing = false,
                        error = null,
                    )
                }
                runCatching { repository.saveSnapshot(cacheKey(queryState, requestedUser), requestedUser, result, result.items) }
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                if (generation[channel] != myGeneration) return@launch
                update(channel) {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = error.message ?: "加载失败，请重试",
                    )
                }
            }
        }
    }

    fun loadMore(channel: DiscoveryChannel) {
        val initial = state(channel)
        if (initial.loading || initial.refreshing || !initial.hasMore || feedJobs[channel]?.isActive == true) return
        val myGeneration = generation.getValue(channel)
        val requestedUser = currentUserId
        val token = accessToken
        val currentPersonalization = personalization
        feedJobs[channel] = viewModelScope.launch {
            update(channel) { it.copy(loading = true, error = null) }
            try {
                val queryState = state(channel)
                val result = repository.page(queryFor(queryState, requestedUser, token, currentPersonalization))
                if (generation[channel] != myGeneration || currentUserId != requestedUser) return@launch
                val combined = (queryState.items + result.items).distinctBy(DiscoveryPost::stableKey)
                update(channel) {
                    it.copy(items = combined, cursor = result.cursor, page = result.page, hasMore = result.hasMore, loading = false, error = null)
                }
                runCatching { repository.saveSnapshot(cacheKey(queryState, requestedUser), requestedUser, result, combined) }
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                if (generation[channel] == myGeneration) update(channel) { it.copy(loading = false, error = error.message ?: "加载更多失败") }
            }
        }
    }

    fun toggleLike(channel: DiscoveryChannel, post: DiscoveryPost) = toggle(channel, post, "like", !post.liked)

    fun toggleSaved(channel: DiscoveryChannel, post: DiscoveryPost) = toggle(channel, post, "bookmark", !post.saved)

    private fun toggle(channel: DiscoveryChannel, post: DiscoveryPost, action: String, value: Boolean) {
        val token = accessToken
        if (token.isNullOrBlank() || currentUserId.isNullOrBlank()) {
            update(channel) { state -> state.copy(error = if (action == "bookmark") "登录后即可收藏内容" else "登录后即可为内容点赞") }
            return
        }
        val account = currentUserId
        val operationKey = "$account:${post.stableKey}:$action"
        if (!busyInteractions.add(operationKey)) return
        val old = state(channel).items.firstOrNull { it.stableKey == post.stableKey } ?: post
        update(channel) { state ->
            state.copy(items = state.items.map { item ->
                if (item.stableKey != post.stableKey) item
                else when (action) {
                    "like" -> item.copy(liked = value, likeCount = (item.likeCount + if (value) 1 else -1).coerceAtLeast(0))
                    else -> item.copy(saved = value)
                }
            })
        }
        val optimistic = old.copy(
            liked = if (action == "like") value else old.liked,
            saved = if (action == "bookmark") value else old.saved,
            likeCount = if (action == "like") (old.likeCount + if (value) 1 else -1).coerceAtLeast(0) else old.likeCount,
        )
        publishInteraction(channel, optimistic)
        if (token.isNullOrBlank()) {
            busyInteractions.remove(operationKey)
            return
        }
        viewModelScope.launch {
            try {
                repository.changeInteraction(post, action, value, token)
                if (currentUserId == account) persistCurrent(channel)
            } catch (error: Exception) {
                if (currentUserId == account) {
                    update(channel) { state ->
                        state.copy(
                            items = state.items.map { item ->
                                if (item.stableKey != old.stableKey) item
                                else if (action == "like") item.copy(liked = old.liked, likeCount = old.likeCount)
                                else item.copy(saved = old.saved)
                            },
                            error = error.message,
                        )
                    }
                    state(channel).items.firstOrNull { it.stableKey == old.stableKey }?.let { publishInteraction(channel, it) }
                }
            } finally {
                busyInteractions.remove(operationKey)
            }
        }
    }

    private fun publishInteraction(channel: DiscoveryChannel, post: DiscoveryPost) {
        mutableInteractionUpdates.tryEmit(
            DiscoveryInteractionUpdate(
                channel = channel,
                id = post.id,
                cloudId = post.cloudId,
                liked = post.liked,
                saved = post.saved,
                likeCount = post.likeCount,
            ),
        )
    }

    private fun loadCategories(channel: DiscoveryChannel) {
        if (categoryJobs[channel]?.isActive == true) return
        categoryJobs[channel] = viewModelScope.launch {
            try {
                val categories = runCatching { repository.categories(channel, "category") }.getOrElse { emptyList() }
                val tags = runCatching { repository.categories(channel, "tag") }.getOrElse { emptyList() }
                update(channel) { old ->
                    val names = categories.map(DiscoveryCategory::name).toSet()
                    val selected = old.selectedCategory.takeIf { it == ALL_CATEGORY || it in names } ?: ALL_CATEGORY
                    old.copy(categories = listOf(DiscoveryCategory("", ALL_CATEGORY, "category")) + categories, tags = tags, selectedCategory = selected)
                }
                if (state(channel).items.isEmpty()) refresh(channel, useCache = true)
            } finally {
                categoryJobs.remove(channel)
            }
        }
    }

    private fun queryFor(state: DiscoveryFeedState, userId: String?, token: String?, userPersonalization: DiscoveryPersonalization) = DiscoveryQuery(
        channel = state.channel,
        category = state.categories.firstOrNull { it.name == state.selectedCategory }?.takeIf { it.name != ALL_CATEGORY },
        topic = state.tags.firstOrNull { it.name == state.selectedTopic },
        sort = state.sort,
        contentType = state.selectedContentType,
        cursor = state.cursor,
        page = state.page,
        userId = userId,
        token = token,
        personalization = userPersonalization,
    )

    private fun updatePreferences(channel: DiscoveryChannel, transform: (DiscoveryFeedState) -> DiscoveryFeedState) {
        update(channel, transform)
        val updated = state(channel)
        val scope = currentUserId ?: "guest"
        preferences.edit()
            .putString(prefKey(scope, channel, "category"), updated.selectedCategory)
            .putString(prefKey(scope, channel, "topic"), updated.selectedTopic)
            .putString(prefKey(scope, channel, "type"), updated.selectedContentType)
            .putString(prefKey(scope, channel, "sort"), updated.sort.label)
            .apply()
    }

    private fun restorePreferences(channel: DiscoveryChannel): DiscoveryFeedState {
        val scope = currentUserId ?: "guest"
        val base = DiscoveryFeedState(channel)
        return base.copy(
            selectedCategory = preferences.getString(prefKey(scope, channel, "category"), ALL_CATEGORY) ?: ALL_CATEGORY,
            selectedTopic = preferences.getString(prefKey(scope, channel, "topic"), null),
            selectedContentType = preferences.getString(prefKey(scope, channel, "type"), null),
            sort = if (channel == DiscoveryChannel.COMMUNITY)
                DiscoverySort.community(preferences.getString(prefKey(scope, channel, "sort"), null).orEmpty())
            else DiscoverySort.ai(preferences.getString(prefKey(scope, channel, "sort"), null).orEmpty()),
        )
    }

    private fun persistCurrent(channel: DiscoveryChannel) {
        val current = state(channel)
        val userId = currentUserId
        val page = DiscoveryPage(current.items, current.cursor, current.page, current.hasMore)
        viewModelScope.launch { runCatching { repository.saveSnapshot(cacheKey(current, userId), userId, page, current.items) } }
    }

    private fun cacheKey(state: DiscoveryFeedState, userId: String?): String {
        val raw = listOf(userId ?: "guest", state.channel.name, state.selectedCategory, state.selectedTopic.orEmpty(), state.selectedContentType.orEmpty(), state.sort.name).joinToString("|")
        return MessageDigest.getInstance("SHA-256").digest(raw.toByteArray()).joinToString("") { "%02x".format(it) }
    }

    fun setPersonalization(userId: String?, interests: List<String>, viewedIds: List<Long>, personalRatings: Map<Long, Int>) {
        val normalizedUser = userId?.takeIf(String::isNotBlank)
        if (normalizedUser != currentUserId) return
        val next = DiscoveryPersonalization(
            interests = interests.map(String::trim).filter(String::isNotEmpty).distinct().take(24),
            viewedIds = viewedIds.filter { it > 0 }.takeLast(200).toSet(),
            personalRatings = personalRatings.filter { (id, rating) -> id > 0 && rating in 1..5 }.toList().takeLast(200).toMap(),
        )
        if (next == personalization) return
        personalization = next
        val scope = currentUserId ?: "guest"
        val ratingJson = org.json.JSONObject().apply {
            next.personalRatings.forEach { (id, value) -> put(id.toString(), value) }
        }
        preferences.edit()
            .putStringSet("$scope:personalization:interests", next.interests.toSet())
            .putStringSet("$scope:personalization:viewed", next.viewedIds.map(Long::toString).toSet())
            .putString("$scope:personalization:ratings", ratingJson.toString())
            .apply()
    }

    private fun restorePersonalization(scope: String): DiscoveryPersonalization {
        val ratings = runCatching { org.json.JSONObject(preferences.getString("$scope:personalization:ratings", "{}") ?: "{}") }.getOrNull()
        val decodedRatings = ratings?.keys()?.asSequence()?.mapNotNull { key ->
            val id = key.toLongOrNull() ?: return@mapNotNull null
            val value = ratings.optInt(key, 0)
            if (id > 0 && value in 1..5) id to value else null
        }?.take(200)?.toMap().orEmpty()
        return DiscoveryPersonalization(
            interests = preferences.getStringSet("$scope:personalization:interests", emptySet()).orEmpty().toList().take(24),
            viewedIds = preferences.getStringSet("$scope:personalization:viewed", emptySet()).orEmpty().mapNotNull(String::toLongOrNull).filter { it > 0 }.takeLast(200).toSet(),
            personalRatings = decodedRatings,
        )
    }

    private fun prefKey(user: String, channel: DiscoveryChannel, field: String) = "$user:${channel.name}:$field"

    private fun state(channel: DiscoveryChannel) = mutableFeeds.value.getValue(channel)

    fun hasSession() = !accessToken.isNullOrBlank()

    fun saveScrollState(channel: DiscoveryChannel, state: Parcelable?) {
        val key = "discovery_scroll_${channel.name}"
        if (state == null) savedState.remove<Parcelable>(key) else savedState[key] = state
    }

    fun restoreScrollState(channel: DiscoveryChannel): Parcelable? =
        savedState["discovery_scroll_${channel.name}"]

    private inline fun update(channel: DiscoveryChannel, transform: (DiscoveryFeedState) -> DiscoveryFeedState) {
        val next = mutableFeeds.value.toMutableMap()
        next[channel] = transform(next.getValue(channel))
        mutableFeeds.value = next
    }

    companion object { const val ALL_CATEGORY = "全部" }
}
