package com.heika.nativeapp.data

import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.db.DailyStateEntity
import com.heika.nativeapp.db.FeedCache
import com.heika.nativeapp.db.HeikaCacheDao
import com.heika.nativeapp.feature.home.DailyDeckLogic
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import retrofit2.Response
import okhttp3.ResponseBody
import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSink
import okio.buffer

@Singleton
class HeikaRepository @Inject constructor(
    private val api: HeikaApi,
    private val auth: AuthRepository,
    private val cache: FeedCache,
    private val cacheDao: HeikaCacheDao,
) {
    private val recommendationCache = ConcurrentHashMap<String, Pair<Long, RecommendationContext>>()

    suspend fun loadCategories(channel: String, kind: String): List<HeikaCategory> = withContext(Dispatchers.IO) {
        val data = request("/api/v1/categories?channel=$channel&kind=$kind") as? JSONObject ?: JSONObject()
        data.optJSONArray("items").jsonObjects().mapNotNull { item ->
            val id = item.optInt("id")
            val name = item.optString("name")
            if (id > 0 && name.isNotBlank()) HeikaCategory(id, name, item.optInt("parent_id").takeIf { it > 0 }) else null
        }
    }

    suspend fun loadAiResourceTypes(): List<AiResourceType> = withContext(Dispatchers.IO) {
        val data = request("/api/v1/ai-resource-types") as? JSONObject ?: JSONObject()
        data.optJSONArray("items").jsonObjects().mapNotNull { item ->
            val id = item.optString("resource_type")
            val label = item.optString("label")
            if (id.isBlank() || label.isBlank()) null else AiResourceType(
                id = id, label = label, description = item.optString("description"), publishedCount = item.optInt("published_count"),
            )
        }
    }

    suspend fun cachedFeed(filter: FeedFilter): List<HeikaPost> = withContext(Dispatchers.IO) {
        cache.get(feedCacheKey(filter))?.let(::parsePosts).orEmpty()
    }

    suspend fun recommendationContext(): RecommendationContext = withContext(Dispatchers.IO) {
        val session = auth.current() ?: return@withContext RecommendationContext()
        val cached = recommendationCache[session.userId]
        if (cached != null && System.currentTimeMillis() - cached.first < RANKING_CACHE_MS) return@withContext cached.second
        val payload = request("/api/v1/library-state", authenticated = true) as? JSONObject ?: JSONObject()
        val interests = buildSet {
            payload.optJSONArray("interests").jsonObjects().forEach { row ->
                row.optJSONObject("interest_tags")?.optString("name")?.takeIf(String::isNotBlank)?.let(::add)
            }
        }
        val viewed = mutableSetOf<Int>()
        val ratings = mutableMapOf<Int, Int>()
        payload.optJSONArray("interactions").jsonObjects().forEach { row ->
            val id = row.optJSONObject("posts")?.optInt("client_id") ?: 0
            if (id <= 0) return@forEach
            if (!row.isNull("viewed_at") && row.optString("viewed_at").isNotBlank()) viewed += id
            if (!row.isNull("rating")) row.optInt("rating").takeIf { it in 1..5 }?.let { ratings[id] = it }
        }
        RecommendationContext(interests, viewed, ratings).also {
            recommendationCache[session.userId] = System.currentTimeMillis() to it
        }
    }

    suspend fun communityPage(
        filter: FeedFilter,
        key: FeedPageKey,
        recommendation: RecommendationContext = RecommendationContext(),
    ): FeedPage = withContext(Dispatchers.IO) {
        val cacheKey = feedCacheKey(filter)
        val query = buildString {
            append("/api/demo/cards?mode=discover&limit=24")
            filter.category?.let { append("&tag=${encode(it.name)}") }
            if (filter.sort == "关注") append("&following=1")
            if (filter.sort != "关注" && filter.sort != "最新" && filter.sort != "高评分") {
                // The endpoint applies the website's existing recommendation RPC.
            }
            if (key.cursorCreatedAt != null && key.cursorPostId != null) {
                append("&cursorCreatedAt=${encode(key.cursorCreatedAt)}&cursorPostId=${encode(key.cursorPostId)}")
            }
        }
        try {
            val payload = request(query, authenticated = filter.sort == "关注", includeSession = true) as? JSONObject ?: JSONObject()
            var posts = payload.optJSONArray("items").jsonObjects().map(HeikaPost::from)
            if (filter.topic != null) posts = posts.filter { filter.topic in it.tags }
            posts = when (filter.sort) {
                "最新", "关注" -> posts
                "高评分" -> posts.sortedWith(
                    compareByDescending<HeikaPost> { if (it.hasRating) it.ratingAverage else Double.NEGATIVE_INFINITY }
                        .thenByDescending { it.ratingCount }
                        .thenByDescending { it.date }
                        .thenByDescending { it.id },
                )
                else -> RecommendationRanker.rank(posts, recommendation)
            }
            val cursor = payload.optJSONObject("cursor")
            val page = FeedPage(
                posts = posts,
                hasMore = payload.optBoolean("hasMore"),
                nextCursorCreatedAt = cursor?.optString("createdAt")?.takeIf(String::isNotBlank),
                nextCursorPostId = cursor?.optString("postId")?.takeIf(String::isNotBlank),
            )
            if (key.cursorCreatedAt == null) cache.put(cacheKey, JSONArray(posts.map { JSONObject(it.rawJson) }).toString())
            page
        } catch (error: Exception) {
            if (key.cursorCreatedAt != null) throw error
            val cachedPayload = cache.get(cacheKey) ?: throw error
            FeedPage(parsePosts(cachedPayload), hasMore = false)
        }
    }

    suspend fun aiPage(filter: FeedFilter, page: Int): FeedPage = withContext(Dispatchers.IO) {
        val cacheKey = feedCacheKey(filter)
        val query = buildString {
            append("/api/v1/ai-space?limit=24&page=$page&sort=")
            append(when (filter.sort) { "最新" -> "latest"; "热门" -> "popular"; else -> "featured" })
            filter.category?.let { append("&category=${it.id}") }
            filter.topic?.let { append("&topic=${encode(it)}") }
            filter.contentType?.let { append("&type=${encode(it)}") }
            filter.usageScenario?.let { append("&scenario=${encode(it)}") }
            filter.query?.trim()?.takeIf(String::isNotBlank)?.let { append("&q=${encode(it.take(60))}") }
        }
        try {
            val payload = try {
                request(query, includeSession = true) as? JSONObject ?: JSONObject()
            } catch (primary: Exception) {
                // Older production deployments may not yet understand the native topic filter.
                // Retry the same AI feed without that optional filter before showing an error.
                if (filter.topic.isNullOrBlank()) throw primary
                val compatible = query.replace("&topic=${encode(filter.topic)}", "")
                request(compatible, includeSession = true) as? JSONObject ?: throw primary
            }
            val posts = payload.optJSONArray("items").jsonObjects().map(HeikaPost::from)
            val total = payload.optInt("total")
            if (page == 1) cache.put(cacheKey, JSONArray(posts.map { JSONObject(it.rawJson) }).toString())
            FeedPage(posts, page * 24 < total, nextPage = page + 1)
        } catch (error: Exception) {
            if (page != 1) throw error
            val cachedPayload = cache.get(cacheKey) ?: throw error
            FeedPage(parsePosts(cachedPayload), hasMore = false)
        }
    }

    suspend fun publicCardIds(): List<Int> = withContext(Dispatchers.IO) {
        val mixed = runCatching {
            (request("/api/v1/deck/candidates") as? JSONArray).jsonObjects()
                .mapNotNull { it.optInt("id").takeIf { id -> id > 0 } }
        }.getOrDefault(emptyList())
        if (mixed.isNotEmpty()) return@withContext mixed
        // Keep the established community deck available during server rollout,
        // and when the new mixed candidate pool is temporarily empty.
        runCatching {
            (request("/api/demo/cards") as? JSONArray).jsonObjects()
                .mapNotNull { it.optInt("id").takeIf { id -> id > 0 } }
        }.getOrDefault(emptyList())
    }

    suspend fun revealedCards(ids: List<Int>): List<HeikaPost> = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext emptyList()
        val result = request(
            "/api/demo/cards",
            method = "POST",
            body = JSONObject().put("ids", JSONArray(ids)).toString(),
        ) as? JSONObject ?: JSONObject()
        result.optJSONArray("items").jsonObjects().map(HeikaPost::from)
    }

    suspend fun revealCard(id: Int): HeikaPost = withContext(Dispatchers.IO) {
        val result = request("/api/demo/cards", method = "POST", body = JSONObject().put("id", id).toString()) as? JSONObject
            ?: throw IOException("卡片内容暂不可用")
        HeikaPost.from(result)
    }

    suspend fun confirmDailyFlip(clientId: Int, day: String): JSONObject = withContext(Dispatchers.IO) {
        require(clientId > 0) { "卡片编号无效" }
        require(day.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) { "翻卡日期无效" }
        request(
            "/api/v1/library-state",
            method = "POST",
            body = JSONObject()
                .put("action", "flip")
                .put("id", clientId)
                .put("idempotencyKey", DailyDeckLogic.flipIdempotencyKey(day, clientId))
                .toString(),
            authenticated = true,
        ) as? JSONObject ?: throw IOException("翻卡结果暂不可用，请重试")
    }

    suspend fun myLibraryState(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/library-state", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun recordOpen(clientId: Int) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("action", "open").put("id", clientId)
        request("/api/v1/library-state", method = "POST", body = body.toString(), authenticated = true)
    }

    suspend fun loadNotifications(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/notifications?limit=30", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun cachedNotifications(userId: String): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(NativeCacheKeys.notifications(userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveNotificationsCache(userId: String, value: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(NativeCacheKeys.notifications(userId), value.toString())
    }

    suspend fun notificationSettings(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/settings/notifications", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setCommentNotifications(enabled: Boolean): JSONObject = withContext(Dispatchers.IO) {
        request(
            "/api/v1/settings/notifications",
            method = "PATCH",
            body = JSONObject().put("commentsEnabled", enabled).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun markNotification(id: String? = null, all: Boolean = false) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("action", if (all) "read_all" else "read")
        id?.let { body.put("id", it) }
        request("/api/v1/notifications", method = "POST", body = body.toString(), authenticated = true)
    }

    suspend fun post(cloudId: String): HeikaPost = withContext(Dispatchers.IO) {
        val value = request("/api/v1/posts/${encode(cloudId)}", authenticated = true)
        HeikaPost.from(value as? JSONObject ?: JSONObject())
    }

    suspend fun postDetail(post: HeikaPost): HeikaPost = withContext(Dispatchers.IO) {
        val value = fetchPostDetail(post.cloudId, post.id)
        val json = value as? JSONObject ?: throw IOException("内容暂不可用")
        HeikaPost.from(json).also { savePostDetail(post.cloudId.ifBlank { post.id.toString() }, it) }
    }

    suspend fun postDetailByKey(key: String): HeikaPost = withContext(Dispatchers.IO) {
        val id = key.removePrefix("client-").toIntOrNull() ?: 0
        val value = fetchPostDetail(key, id) as? JSONObject ?: throw IOException("内容暂不可用")
        HeikaPost.from(value).also { savePostDetail(key, it) }
    }

    suspend fun cachedPostDetail(key: String): HeikaPost? = withContext(Dispatchers.IO) {
        val owner = auth.current()?.userId ?: "public"
        cache.get(postDetailCacheKey(owner, key))?.let { raw -> runCatching { HeikaPost.from(JSONObject(raw)) }.getOrNull() }
    }

    private suspend fun savePostDetail(key: String, post: HeikaPost) {
        val owner = auth.current()?.userId ?: "public"
        cache.put(postDetailCacheKey(owner, key), post.rawJson)
    }

    private fun postDetailCacheKey(owner: String, key: String) = NativeCacheKeys.postDetail(owner, key)

    private suspend fun fetchPostDetail(cloudId: String, clientId: Int): Any? = if (isUuid(cloudId)) {
        request("/api/v1/posts/${encode(cloudId)}", includeSession = true)
    } else {
        require(clientId > 0) { "内容编号无效" }
        request("/api/demo/cards", method = "POST", body = JSONObject().put("id", clientId).toString())
    }

    suspend fun comments(postId: String, page: Int = 1, sort: String = "new"): JSONObject = withContext(Dispatchers.IO) {
        val safeSort = if (sort == "hot") "hot" else "new"
        request("/api/v1/posts/${encode(postId)}/comments?page=${page.coerceAtLeast(1)}&limit=30&sort=$safeSort", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun addComment(postId: String, body: String, parentId: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("body", body)
        parentId?.let { payload.put("parent_id", it) }
        request("/api/v1/posts/${encode(postId)}/comments", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setCommentLiked(commentId: String, liked: Boolean): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(commentId)) { "评论编号无效" }
        if (liked) request("/api/v1/comments/${encode(commentId)}/reactions", method = "POST", body = JSONObject().put("kind", "like").toString(), authenticated = true)
        else request("/api/v1/comments/${encode(commentId)}/reactions?kind=like", method = "DELETE", authenticated = true)
        JSONObject().put("liked", liked)
    }

    /** 分享行为落库；匿名也允许统计，失败不影响分享本身。 */
    suspend fun recordShare(clientId: Int, platform: String, surface: String = "android") = withContext(Dispatchers.IO) {
        if (clientId <= 0) return@withContext
        runCatching {
            request(
                "/api/v1/posts/$clientId/share",
                method = "POST",
                body = JSONObject().put("platform", platform).put("surface", surface).toString(),
                includeSession = true,
            )
        }
        Unit
    }

    suspend fun reportPost(postId: String, reason: String, note: String, commentId: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(postId) || (commentId != null && isUuid(commentId))) { "举报对象无效" }
        require(commentId == null || isUuid(commentId)) { "评论编号无效" }
        require(commentId != null || isUuid(postId)) { "内容编号无效" }
        val payload = JSONObject().put("reason", reason).put("note", note.take(300))
        if (commentId == null) payload.put("post_id", postId) else payload.put("comment_id", commentId)
        request(
            "/api/v1/reports",
            method = "POST",
            body = payload.toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun muteRecommendationAuthor(authorId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(authorId)) { "作者编号无效" }
        request("/api/v1/recommendation-feedback", method = "POST", body = JSONObject().put("action", "mute_author").put("authorId", authorId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun muteRecommendationTopic(topic: String): JSONObject = withContext(Dispatchers.IO) {
        require(topic.trim().length in 1..32)
        request("/api/v1/recommendation-feedback", method = "POST", body = JSONObject().put("action", "mute_topic").put("topic", topic.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deleteComment(commentId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(commentId)) { "评论编号无效" }
        request("/api/v1/comments/${encode(commentId)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deletePost(postId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(postId)) { "内容编号无效" }
        request("/api/v1/posts/${encode(postId)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminOverview(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/overview", authenticated = true) as? JSONObject ?: JSONObject()
    }

    /** 管理权限只判定一次，避免每个页面都打一次后台接口。 */
    @Volatile private var staffCache: Boolean? = null
    suspend fun isStaff(force: Boolean = false): Boolean {
        if (!force) staffCache?.let { return it }
        val allowed = runCatching { adminOverview(); true }.getOrDefault(false)
        staffCache = allowed
        return allowed
    }
    fun clearStaffCache() { staffCache = null }

    /** 当前生效的公告；未开启时返回 null。 */
    suspend fun announcement(): JSONObject? = withContext(Dispatchers.IO) {
        request("/api/v1/announcement") as? JSONObject
    }

    suspend fun adminMembershipData(): JSONObject = withContext(Dispatchers.IO) {
        val raw = request("/api/v1/admin/membership", authenticated = true) as? JSONObject ?: JSONObject()
        val stats = raw.optJSONObject("stats") ?: JSONObject()
        val rawBatches = raw.optJSONArray("batches") ?: JSONArray()
        val batches = JSONArray()
        var generated = 0
        var redeemed = 0
        var disabled = 0
        for (index in 0 until rawBatches.length()) {
            val batch = rawBatches.optJSONObject(index) ?: continue
            val quantity = batch.optInt("quantity")
            val used = batch.optInt("redeemed")
            val stopped = batch.optInt("disabled")
            generated += quantity
            redeemed += used
            disabled += stopped
            batches.put(JSONObject(batch.toString())
                .put("name", batch.optString("label"))
                .put("duration_days", batch.optInt("duration_days"))
                .put("code_count", quantity)
                .put("available_count", batch.optInt("unused"))
                .put("redeemed_count", used)
                .put("disabled_count", stopped))
        }
        val mappedStats = JSONObject()
            .put("freeUsers", stats.optLong("free"))
            .put("plusUsers", stats.optLong("plus"))
            .put("proUsers", stats.optLong("pro"))
            .put("generatedCodes", generated)
            .put("availableCodes", stats.optLong("unusedCodes"))
            .put("redeemedCodes", redeemed)
            .put("disabledCodes", disabled)
            .put("unverifiedOrders", (raw.optJSONArray("orders") ?: JSONArray()).let { orders -> (0 until orders.length()).count { orders.optJSONObject(it)?.optString("status") == "pending" } })
            .put("verifiedSupportCents", stats.optLong("verifiedAmountCents"))
        val rawPlans = raw.optJSONArray("plans") ?: JSONArray()
        val plans = JSONArray()
        for (index in 0 until rawPlans.length()) {
            val plan = rawPlans.optJSONObject(index) ?: continue
            plans.put(JSONObject(plan.toString()).put("display_name", plan.optString("name"))
                .put("daily_flips", plan.optInt("daily_flip_allowance"))
                .put("support_price_cents", plan.optInt("price_cents"))
                .put("enabled", plan.optBoolean("active")))
        }
        val rawOrders = raw.optJSONArray("orders") ?: JSONArray()
        val orders = JSONArray()
        for (index in 0 until rawOrders.length()) {
            val order = rawOrders.optJSONObject(index) ?: continue
            val status = order.optString("status")
            orders.put(JSONObject(order.toString())
                .put("plan_id", "${order.optString("tier").uppercase()} · ${order.optInt("duration_days")} 天")
                .put("payment_status", when (status) { "verified" -> "已核验"; "refunded" -> "已退款"; "invalid" -> "无效"; else -> "待核验" })
                .put("processing_status", when (status) { "verified" -> "已发放会员"; "invalid" -> "已拒绝"; else -> "待处理" })
                .put("issue_note", order.optString("failure_reason")))
        }
        JSONObject().put("stats", mappedStats).put("batches", batches).put("plans", plans).put("orders", orders)
    }

    suspend fun createAdminMembershipBatch(name: String, tier: String, durationDays: Int, count: Int, distributionLabel: String): JSONObject = withContext(Dispatchers.IO) {
        require(name.trim().length in 1..100 && tier in setOf("plus", "pro") && durationDays in 1..3650 && count in 1..500 && distributionLabel.trim().length in 2..120)
        val label = "${name.trim()} · ${distributionLabel.trim()}".take(100)
        val response = request("/api/v1/admin/membership/batches", method = "POST", body = JSONObject()
            .put("label", label).put("tier", tier).put("days", durationDays).put("quantity", count).toString(), authenticated = true) as? JSONObject ?: JSONObject()
        response.put("batch", JSONObject().put("id", response.optString("batchId")).put("label", label).put("tier", tier).put("duration_days", durationDays).put("quantity", response.optInt("quantity", count)))
        response
    }

    suspend fun adminMembershipBatchCodes(batchId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(batchId))
        request("/api/v1/admin/membership/batches/${encode(batchId)}/codes", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun disableAdminMembershipCode(codeId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(codeId))
        request("/api/v1/admin/membership/codes/${encode(codeId)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminMembershipPlans(): JSONObject = withContext(Dispatchers.IO) {
        val response = request("/api/v1/admin/membership/plans", authenticated = true) as? JSONObject ?: JSONObject()
        val source = response.optJSONArray("items") ?: JSONArray()
        val items = JSONArray()
        for (index in 0 until source.length()) {
            val plan = source.optJSONObject(index) ?: continue
            items.put(JSONObject(plan.toString())
                .put("display_name", plan.optString("name"))
                .put("daily_flips", plan.optInt("daily_flip_allowance"))
                .put("support_price_cents", plan.optInt("price_cents"))
                .put("enabled", plan.optBoolean("active")))
        }
        JSONObject().put("items", items)
    }

    suspend fun updateAdminMembershipPlan(tier: String, dailyFlips: Int, priceCents: Int, durationDays: Int?, enabled: Boolean): JSONObject = withContext(Dispatchers.IO) {
        require(tier in setOf("free", "plus", "pro") && dailyFlips in 1..100 && priceCents in 0..1_000_000 && (tier == "free" || (durationDays != null && durationDays in 1..7300)) && (tier != "free" || (priceCents == 0 && enabled)))
        val payload = JSONObject().put("dailyFlips", dailyFlips).put("priceCents", priceCents).put("enabled", enabled)
        if (durationDays != null) payload.put("durationDays", durationDays)
        request("/api/v1/admin/membership/plans/${encode(tier)}", method = "PATCH", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminMembershipUsers(queryText: String): JSONObject = withContext(Dispatchers.IO) {
        require(queryText.trim().length in 2..80)
        val response = request("/api/v1/admin/membership/users?q=${encode(queryText.trim())}", authenticated = true) as? JSONObject ?: JSONObject()
        JSONObject().put("items", response.optJSONArray("users") ?: JSONArray())
    }

    suspend fun adjustAdminMembership(userId: String, tier: String, durationDays: Int?, reason: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(userId) && tier in setOf("free", "plus", "pro") && (tier == "free" || (durationDays != null && durationDays in 1..3650)) && reason.trim().length in 3..500)
        val payload = JSONObject().put("tier", tier).put("reason", reason.trim())
        if (durationDays != null) payload.put("days", durationDays)
        request("/api/v1/admin/membership/users/${encode(userId)}", method = "PATCH", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminMembershipOrders(): JSONObject = withContext(Dispatchers.IO) {
        val response = request("/api/v1/admin/membership", authenticated = true) as? JSONObject ?: JSONObject()
        val source = response.optJSONArray("orders") ?: JSONArray()
        val items = JSONArray()
        for (index in 0 until source.length()) {
            val order = source.optJSONObject(index) ?: continue
            val status = order.optString("status")
            items.put(JSONObject(order.toString())
                .put("plan_id", "${order.optString("tier").uppercase()} · ${order.optInt("duration_days")} 天")
                .put("payment_status", when (status) { "verified" -> "已核验"; "refunded" -> "已退款"; "invalid" -> "无效"; else -> "待核验" })
                .put("processing_status", when (status) { "verified" -> "已发放会员"; "invalid" -> "已拒绝"; else -> "待处理" })
                .put("issue_note", order.optString("failure_reason")))
        }
        JSONObject().put("items", items)
    }

    suspend fun recordAdminMembershipOrder(providerOrderId: String, userId: String, tier: String, days: Int, amountCents: Long, providerUserRef: String?): JSONObject = withContext(Dispatchers.IO) {
        require(providerOrderId.trim().length in 4..120 && isUuid(userId) && tier in setOf("plus", "pro") && days in 1..3650 && amountCents in 0L..10_000_000L && (providerUserRef == null || providerUserRef.length in 1..120))
        val payload = JSONObject().put("providerOrderId", providerOrderId.trim()).put("userId", userId).put("tier", tier).put("days", days).put("amountCents", amountCents)
        providerUserRef?.let { payload.put("providerUserRef", it) }
        request("/api/v1/admin/membership/orders", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun reviewAdminMembershipOrder(id: String, paymentStatus: String, processingStatus: String, issueNote: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && paymentStatus in setOf("paid", "failed") && processingStatus in setOf("verified", "ignored") && issueNote.trim().length in 3..500)
        val action = if (paymentStatus == "paid" && processingStatus == "verified") "verify" else "reject"
        request("/api/v1/admin/membership/orders/${encode(id)}", method = "PATCH", body = JSONObject().put("action", action).put("reason", issueNote.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminReports(status: String = "open", page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        require(status in setOf("open", "resolved", "dismissed", "all"))
        request("/api/v1/admin/reports?status=$status&page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun reviewAdminReport(id: String, resolved: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/reports/${encode(id)}", method = "PATCH", body = JSONObject().put("status", if (resolved) "resolved" else "dismissed").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminPosts(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/posts?page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAiQueue(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-space?status=queue&page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun reviewAdminAi(id: String, publish: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/ai-space/${encode(id)}", method = "PATCH", body = JSONObject().put("status", if (publish) "published" else "hidden").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAppeals(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/appeals?status=open&page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun reviewAdminAppeal(id: String, accepted: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/appeals", method = "PATCH", body = JSONObject().put("id", id).put("status", if (accepted) "accepted" else "rejected").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminUsers(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/users?limit=30", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun searchAdminUsers(query: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/users?limit=20&query=${encode(query.trim())}", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminCommunityAccess(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/access-codes/batches", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun createAdminAccessCodeBatch(payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/access-codes/batches", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminAccessCodeBatch(id: String, active: Boolean): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/access-codes/batches/${encode(id)}", method = "PATCH", body = JSONObject().put("active", active).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun disableAdminAccessCode(id: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/access-codes/${encode(id)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun createAdminProfileBadge(payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/profile-badges", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun updateAdminProfileBadge(id: String, payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/profile-badges/${encode(id)}", method = "PATCH", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminBadgeAwards(userId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/profile-badges/awards?userId=${encode(userId)}", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun grantAdminBadge(userId: String, badgeId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/profile-badges/awards", method = "POST", body = JSONObject().put("userId", userId).put("badgeId", badgeId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun revokeAdminBadge(awardId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/profile-badges/awards", method = "DELETE", body = JSONObject().put("awardId", awardId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminOfficialNotices(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/official-notices", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun saveAdminOfficialNotice(payload: JSONObject, id: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val path = if (id.isNullOrBlank()) "/api/v1/admin/official-notices" else "/api/v1/admin/official-notices/${encode(id)}"
        request(path, method = if (id.isNullOrBlank()) "POST" else "PATCH", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminUserRole(id: String, role: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && role in setOf("member", "admin", "content_manager", "reviewer"))
        request("/api/v1/admin/users/${encode(id)}", method = "PATCH", body = JSONObject().put("role", role).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminUserMembership(id: String, tier: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && tier in setOf("free", "plus", "pro"))
        request("/api/v1/admin/users/${encode(id)}", method = "PATCH", body = JSONObject().put("membership_tier", tier).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deleteAdminUser(id: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id))
        request("/api/v1/admin/users/${encode(id)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminUserRestriction(id: String, active: Boolean, reason: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && reason.trim().length in 3..500)
        val restriction = if (active) JSONObject().put("active", true).put("reason", reason.trim()).put("permanent", true) else JSONObject().put("active", false)
        request("/api/v1/admin/users/${encode(id)}", method = "PATCH", body = JSONObject().put("community_restriction", restriction).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminComments(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/comments?status=all&page=${page.coerceAtLeast(1)}&limit=30", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminCommentVisible(id: String, visible: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id))
        val payload = JSONObject().put("status", if (visible) "visible" else "hidden")
        if (note.trim().length >= 3) payload.put("review_note", note.trim().take(500))
        request("/api/v1/admin/comments/${encode(id)}", method = "PATCH", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAiFeedback(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-space?status=feedback&feedbackStatus=open&page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun handleAdminAiFeedback(id: String, resolved: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/ai-space/feedback/${encode(id)}", method = "PATCH", body = JSONObject().put("status", if (resolved) "resolved" else "dismissed").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminMessageReports(): JSONObject = withContext(Dispatchers.IO) {
        val rows = request("/api/v1/admin/message-reports", authenticated = true) as? JSONArray ?: JSONArray()
        JSONObject().put("items", rows)
    }

    suspend fun adminUserFeedback(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/user-feedback?status=open&page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun handleAdminUserFeedback(id: String, resolved: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.length <= 1000)
        request("/api/v1/admin/user-feedback/${encode(id)}", method = "PATCH", body = JSONObject().put("status", if (resolved) "resolved" else "dismissed").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAudit(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/audit?page=${page.coerceAtLeast(1)}&limit=50", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminKeywordRules(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/moderation-rules", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun createAdminKeywordRule(keyword: String): JSONObject = withContext(Dispatchers.IO) {
        require(keyword.trim().length in 1..80)
        request("/api/v1/admin/moderation-rules", method = "POST", body = JSONObject().put("keyword", keyword.trim()).put("scopes", org.json.JSONArray(listOf("post", "comment", "message", "profile"))).put("enabled", true).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminKeywordEnabled(id: String, enabled: Boolean): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id))
        request("/api/v1/admin/moderation-rules/${encode(id)}", method = "PATCH", body = JSONObject().put("enabled", enabled).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deleteAdminKeywordRule(id: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id))
        request("/api/v1/admin/moderation-rules/${encode(id)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    /** AI 资源中心：批次、待复审记录与用量摘要。 */
    suspend fun adminAiTasks(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-tasks", authenticated = true) as? JSONObject ?: JSONObject()
    }

    /** 系统监控：真实采集行 + 当前请求量 + 未恢复告警。 */
    suspend fun adminMetrics(range: String = "1h"): JSONObject = withContext(Dispatchers.IO) {
        require(range in setOf("1h", "24h", "7d")) { "监控范围无效" }
        request("/api/v1/admin/metrics?range=$range", authenticated = true) as? JSONObject ?: JSONObject()
    }

    /** 媒体服务：概览 / 任务列表 / 单任务链路。 */
    suspend fun adminMediaService(view: String, taskKey: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(view in setOf("overview", "tasks", "trace")) { "媒体视图无效" }
        val suffix = if (view == "trace" && !taskKey.isNullOrBlank()) "&task_key=${encode(taskKey)}" else ""
        request("/api/v1/admin/media-service?view=$view$suffix", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun verifyAdminMedia(storagePath: String): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("action", "verify").put("storage_path", storagePath)
        request("/api/v1/admin/media-service", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    /** 存储占用与孤立资源扫描（只读）。 */
    suspend fun adminStorage(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/storage?view=overview", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun scanAdminStorage(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/storage", method = "POST", body = JSONObject().put("action", "scan").toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    /** 系统告警：当前未恢复 / 全部历史。 */
    suspend fun adminAlerts(status: String = "open"): JSONObject = withContext(Dispatchers.IO) {
        require(status in setOf("open", "all")) { "告警范围无效" }
        request("/api/v1/admin/alerts?status=$status", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAlertAction(id: String, action: String, note: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(action in setOf("acknowledge", "resolve")) { "告警操作无效" }
        val payload = JSONObject().put("id", id).put("action", action)
        if (!note.isNullOrBlank()) payload.put("note", note)
        request("/api/v1/admin/alerts", method = "PATCH", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    /** 人工复审：通过 / 驳回 / 退回修改 / 重新分析 / 关闭已无关联作品的审核项。 */
    suspend fun adminAiTaskReview(batchId: String, itemId: String, decision: String, reason: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(batchId)) { "审核批次编号无效" }
        require(decision in setOf("published", "hidden", "revision", "reanalyze", "close")) { "审核结论无效" }
        val action = when (decision) {
            "reanalyze" -> "reanalyze"
            "close" -> "close"
            else -> "review"
        }
        val payload = JSONObject().put("action", action).put("itemId", itemId)
        if (action == "review") payload.put("decision", decision).put("reason", reason.orEmpty().trim())
        if (action == "close") payload.put("reason", reason?.trim().orEmpty())
        request("/api/v1/admin/ai-tasks/${encode(batchId)}", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun createAdminAiTask(taskType: String, includeExisting: Boolean = false): JSONObject = withContext(Dispatchers.IO) {
        require(taskType in setOf("summary_all", "summary_incremental", "review_pending")) { "AI 任务类型无效" }
        val payload = JSONObject().put("taskType", taskType).put("includeExisting", includeExisting)
        request("/api/v1/admin/ai-tasks", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAiTaskAction(batchId: String, action: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(batchId)) { "AI 任务编号无效" }
        require(action in setOf("start", "pause", "resume", "cancel", "retry")) { "AI 任务操作无效" }
        request("/api/v1/admin/ai-tasks/${encode(batchId)}", method = "POST", body = JSONObject().put("action", action).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAppDownload(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/app-download", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun saveAdminAppDownload(enabled: Boolean, downloadUrl: String): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("enabled", enabled).put("download_url", downloadUrl.trim())
        request("/api/v1/admin/app-download", method = "PATCH", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminCategories(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/categories", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAiResourceTypes(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-resource-types", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun updateAdminAiResourceType(resourceType: String, label: String, description: String, enabled: Boolean, sortOrder: Int): JSONObject = withContext(Dispatchers.IO) {
        require(resourceType in aiResourceTypes) { "AI 资源类型编号无效" }
        require(label.trim().length in 1..24 && description.length <= 120 && sortOrder in 0..100)
        request(
            "/api/v1/admin/ai-resource-types",
            method = "PATCH",
            body = JSONObject().put("resource_type", resourceType).put("label", label.trim()).put("description", description.trim()).put("enabled", enabled).put("sort_order", sortOrder).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun createAdminCategory(name: String): JSONObject = withContext(Dispatchers.IO) {
        require(name.trim().length in 2..32)
        request("/api/v1/admin/categories", method = "POST", body = JSONObject().put("name", name.trim()).put("channel", "community").put("kind", "category").toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminCategoryActive(id: Int, active: Boolean): JSONObject = withContext(Dispatchers.IO) {
        require(id > 0)
        request("/api/v1/admin/categories/$id", method = "PATCH", body = JSONObject().put("active", active).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminTopicEvents(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/topic-events", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun saveAdminTopicEvent(payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        require(payload.optString("topic").isNotBlank() && payload.optString("title").length in 4..80 && payload.optString("description").length in 8..500)
        request("/api/v1/admin/topic-events", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminRecommendationSettings(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/settings", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun saveAdminRecommendationSettings(values: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/settings", method = "PATCH", body = values.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminExplorationAd(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/exploration-ad", authenticated = true) as? JSONObject ?: JSONObject()
    }

    /** 管理员读取公告配置，包含未启用状态。 */
    suspend fun adminAnnouncement(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/announcement", authenticated = true) as? JSONObject ?: JSONObject()
    }

    /** 保存公告。服务端每次保存都会把版本号加一，客户端据此重新弹出。 */
    suspend fun saveAdminAnnouncement(title: String, body: String, active: Boolean): JSONObject = withContext(Dispatchers.IO) {
        request(
            "/api/v1/admin/announcement",
            method = "POST",
            body = JSONObject().put("title", title).put("body", body).put("active", active).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun adminExplorationAdPosts(query: String): JSONObject = withContext(Dispatchers.IO) {
        require(query.trim().length in 2..60)
        request("/api/v1/admin/exploration-ad/posts?q=${encode(query.trim())}", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun saveAdminExplorationAd(values: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/exploration-ad", method = "PATCH", body = values.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun uploadAdminExplorationAdImage(fileName: String, mimeType: String, bytes: ByteArray): JSONObject = withContext(Dispatchers.IO) {
        require(bytes.size in 1..(4 * 1024 * 1024)) { "广告图片不能超过 4 MB" }
        require(mimeType in setOf("image/jpeg", "image/png", "image/webp")) { "广告图片仅支持 JPG、PNG 或 WebP" }
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
            .build()
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val response = api.post("${BuildConfig.API_BASE_URL}/api/v1/admin/exploration-ad/image", "Bearer $token", body)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || root.has("error")) {
            throw IOException(root.optString("error").ifBlank { "广告图片上传失败（${response.code()}）" })
        }
        (root.opt("data") as? JSONObject) ?: root
    }

    suspend fun adminAiSettings(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-settings", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun saveAdminAiKey(key: String): JSONObject = withContext(Dispatchers.IO) {
        require(key.trim().length in 16..500)
        request("/api/v1/admin/ai-settings", method = "POST", body = JSONObject().put("key", key.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deleteAdminAiKey(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-settings", method = "POST", body = JSONObject().put("action", "delete").toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun handleAdminMessageReport(id: String, resolved: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/message-reports", method = "PATCH", body = JSONObject().put("id", id).put("status", if (resolved) "resolved" else "dismissed").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun reviewAdminPost(id: String, publish: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/posts/${encode(id)}", method = "PATCH", body = JSONObject().put("status", if (publish) "published" else "hidden").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setPostInteraction(id: Int, action: String, value: Boolean): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/library-state", method = "POST", body = PostInteractionProtocol.libraryStateBody(id, action, value), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun ratePost(id: Int, rating: Int): JSONObject = withContext(Dispatchers.IO) {
        require(rating in 1..5)
        request(PostInteractionProtocol.ratingPath(id), method = "POST", body = JSONObject().put("rating", rating).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun interactionState(id: Int): JSONObject = withContext(Dispatchers.IO) {
        val value = request("/api/v1/me/interactions?ids=$id", includeSession = true) as? JSONObject ?: JSONObject()
        value.optJSONObject(id.toString()) ?: JSONObject()
    }

    suspend fun ratingState(id: Int): JSONObject = withContext(Dispatchers.IO) {
        request(PostInteractionProtocol.ratingStatePath(id), includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun toggleCreatorFollow(creatorId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/creator-follows", method = "POST", body = JSONObject().put("creatorId", creatorId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun myProfile(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun myAccessCodes(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me/access-codes", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun redeemCertificationCode(code: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me/access-codes/redeem", method = "POST", body = JSONObject().put("code", code.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun officialNotices(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/official-notices", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun markOfficialNoticesRead(id: String? = null): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/official-notices", method = "POST", body = JSONObject().apply { id?.let { put("id", it) } }.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun generateRecoveryCodes(): List<String> = withContext(Dispatchers.IO) {
        val result = request("/api/v1/auth/recovery-codes", method = "POST", authenticated = true) as? JSONObject ?: JSONObject()
        result.optJSONArray("codes")?.let { array -> (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) } }
            ?.takeIf { it.isNotEmpty() } ?: throw IOException("恢复码生成失败，请重试")
    }

    suspend fun cachedMyProfile(userId: String): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(NativeCacheKeys.profile(userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveMyProfileCache(userId: String, payload: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(NativeCacheKeys.profile(userId), payload.toString())
    }

    suspend fun updateMyProfile(nickname: String, bio: String, details: JSONArray): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me", method = "PATCH", body = JSONObject().put("nickname", nickname).put("bio", bio).put("details", details).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun updateBookmarksVisibility(visible: Boolean): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me", method = "PATCH", body = JSONObject().put("show_bookmarks", visible).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun accountPrivacy(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me/privacy", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun updateAccountPrivacy(values: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me/privacy", method = "PATCH", body = values.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun blockAccount(userId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(userId))
        request("/api/v1/me/privacy", method = "POST", body = JSONObject().put("blocked_id", userId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun unblockAccount(userId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(userId))
        request("/api/v1/me/privacy?blocked_id=${encode(userId)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deleteMyPost(clientId: Int): JSONObject = withContext(Dispatchers.IO) {
        require(clientId > 0) { "作品编号无效" }
        request(
            "/api/v1/library-state",
            method = "POST",
            body = JSONObject().put("action", "delete").put("id", clientId).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun uploadMyAvatar(fileName: String, mimeType: String, bytes: ByteArray): JSONObject = withContext(Dispatchers.IO) {
        require(bytes.size in 1..(2 * 1024 * 1024)) { "头像图片不能超过 2 MB" }
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
            .build()
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val response = api.post("${BuildConfig.API_BASE_URL}/api/v1/me/avatar", "Bearer $token", body)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || root.has("error")) throw IOException(root.optString("error").ifBlank { "头像上传失败（${response.code()}）" })
        (root.opt("data") as? JSONObject) ?: root
    }

    suspend fun profile(userId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/profiles/${encode(userId)}", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun creatorFollowState(userId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/creator-follows?creator=${encode(userId)}", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun myLibrary(kind: String, page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        require(kind in setOf("own", "bookmarks", "liked", "recent"))
        request("/api/v1/me/library?kind=$kind&page=${page.coerceAtLeast(1)}&limit=24", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun search(query: String, kind: String = "content", page: Int = 1, cursor: String? = null, limit: Int = 24): JSONObject = withContext(Dispatchers.IO) {
        require(kind == "content" || kind == "people")
        val cursorQuery = cursor?.takeIf { kind == "content" }?.let { "&cursor=${encode(it)}" }.orEmpty()
        request("/api/v1/search?q=${encode(query.take(60))}&kind=$kind&page=${page.coerceAtLeast(1)}&limit=${limit.coerceIn(1, 24)}$cursorQuery", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun searchAi(query: String, page: Int = 1, limit: Int = 24): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/ai-space?q=${encode(query.take(60))}&page=${page.coerceAtLeast(1)}&limit=${limit.coerceIn(1, 24)}&sort=popular", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun aiResourceVersions(postId: String): List<JSONObject> = withContext(Dispatchers.IO) {
        require(isUuid(postId)) { "AI 资源编号无效" }
        val payload = request("/api/v1/ai-space/${encode(postId)}/versions", includeSession = true) as? JSONObject ?: JSONObject()
        payload.optJSONArray("items").jsonObjects()
    }

    suspend fun cachedAiResourceVersions(postId: String): List<JSONObject>? = withContext(Dispatchers.IO) {
        val owner = auth.current()?.userId ?: "public"
        cache.get(NativeCacheKeys.aiVersions(owner, postId))?.let { raw ->
            runCatching { JSONTokener(raw).nextValue() as? JSONArray }.getOrNull()?.jsonObjects()
        }
    }

    suspend fun saveAiResourceVersions(postId: String, versions: List<JSONObject>) = withContext(Dispatchers.IO) {
        val owner = auth.current()?.userId ?: "public"
        cache.put(NativeCacheKeys.aiVersions(owner, postId), JSONArray(versions).toString())
    }

    suspend fun submitAiResourceFeedback(postId: String, kind: String, details: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(postId)) { "AI 资源编号无效" }
        require(kind in setOf("broken_link", "unsafe", "outdated", "other")) { "反馈类型无效" }
        require(details.trim().length in 3..1000) { "反馈说明需为 3 到 1000 字" }
        request(
            "/api/v1/ai-space/${encode(postId)}/feedback",
            method = "POST",
            body = JSONObject().put("kind", kind).put("details", details.trim()).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun mutateAiResource(
        action: String,
        id: String?,
        title: String,
        body: String,
        category: String,
        contentType: String,
        resourceData: JSONObject,
        topics: List<String>,
        mediaPaths: List<String>,
        usageScenarios: List<String>,
        attachments: List<JSONObject> = emptyList(),
        routeConfirmed: Boolean = false,
    ): JSONObject = withContext(Dispatchers.IO) {
        require(action == "draft" || action == "submit") { "AI 内容操作无效" }
        require(contentType in aiResourceTypes) { "AI 内容类型无效" }
        val payload = JSONObject()
            .put("action", action).put("title", title).put("body", body).put("category", category)
            .put("contentType", contentType).put("resourceData", resourceData)
            .put("usageScenarios", JSONArray(usageScenarios)).put("topics", JSONArray(topics)).put("mediaPaths", JSONArray(mediaPaths))
            .put("attachments", JSONArray(attachments)).put("routeConfirmed", routeConfirmed)
        id?.takeIf(String::isNotBlank)?.let {
            require(isUuid(it)) { "AI 内容编号无效" }
            payload.put("id", it)
        }
        request("/api/v1/ai-space", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject
            ?: throw IOException("AI 内容暂不可用")
    }

    suspend fun aiWorkbench(
        mode: String,
        title: String,
        content: String,
        category: String,
        prompt: String,
        messages: List<Pair<String, String>>,
    ): String = withContext(Dispatchers.IO) {
        require(mode in setOf("title", "outline", "polish", "continue", "markdown", "topics")) { "创作模式无效" }
        val history = JSONArray().apply {
            messages.takeLast(8).forEach { (role, text) ->
                if (role == "user" || role == "assistant") put(JSONObject().put("role", role).put("content", text.take(2400)))
            }
        }
        val payload = JSONObject().put("mode", mode).put("title", title.take(160)).put("content", content.take(6000))
            .put("category", category.take(40)).put("prompt", prompt.take(2000)).put("messages", history)
        val result = request("/api/v1/ai/workbench", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject
            ?: throw IOException("AI 工作台暂不可用")
        result.optString("output").takeIf(String::isNotBlank) ?: throw IOException("AI 没有返回内容，请重试")
    }

    /** 发布去向判断：服务端先给规则结果，再让模型复核，客户端只负责展示。 */
    suspend fun composerRoute(title: String, body: String, communityCategories: List<String>, aiCategories: List<String>): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("title", title.take(200))
            .put("body", body.take(8000))
            .put("communityCategories", JSONArray(communityCategories.take(30)))
            .put("aiCategories", JSONArray(aiCategories.take(30)))
        val result = request("/api/v1/composer", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject
        result?.optJSONObject("route") ?: JSONObject()
    }

    suspend fun searchTopics(query: String? = null, featured: Boolean = false): JSONArray = withContext(Dispatchers.IO) {
        val params = buildList {
            query?.trim()?.takeIf(String::isNotBlank)?.let { add("q=${encode(it.take(60))}") }
            if (featured) add("featured=1")
        }.joinToString("&").takeIf(String::isNotBlank)?.let { "?$it" }.orEmpty()
        request("/api/v1/topics$params") as? JSONArray ?: JSONArray()
    }

    suspend fun inbox(): JSONObject = withContext(Dispatchers.IO) {
        request(NativeMessagesApi.PATH, authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun cachedInbox(userId: String): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(NativeCacheKeys.messages(userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveInboxCache(userId: String, value: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(NativeCacheKeys.messages(userId), value.toString())
    }

    suspend fun conversation(id: String, before: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id)) { "会话编号无效" }
        request(NativeMessagesApi.conversationPath(id, before), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun markConversationRead(id: String): JSONObject = withContext(Dispatchers.IO) {
        request(NativeMessagesApi.PATH, method = "POST", body = NativeMessagesApi.action("read", id).toString(), authenticated = true) as? JSONObject ?: JSONObject().put("read", true)
    }

    suspend fun searchPeople(query: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/search?kind=people&q=${encode(query.take(60))}&limit=20", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun openConversation(peerId: String): JSONObject = withContext(Dispatchers.IO) {
        request(NativeMessagesApi.PATH, method = "POST", body = JSONObject().put("action", "open").put("peer", peerId).toString(), authenticated = true) as? JSONObject ?: throw IOException("暂时无法发起私聊")
    }

    suspend fun sendMessage(conversationId: String, content: String, nonce: String): JSONObject = withContext(Dispatchers.IO) {
        request(NativeMessagesApi.PATH, method = "POST", body = JSONObject().put("action", "send").put("conversation", conversationId).put("content", content).put("nonce", nonce).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    /**
     * 撤回自己发出的消息：双方同时消失，服务端只允许 3 分钟内撤回。
     * 时间窗以服务端记录的发送时间为准，客户端时间不可信。
     */
    suspend fun recallMessage(conversationId: String, messageId: String): JSONObject = withContext(Dispatchers.IO) {
        request(NativeMessagesApi.PATH, method = "POST", body = JSONObject().put("action", "recall").put("conversation", conversationId).put("message", messageId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun createOrUpdateDraft(id: Int? = null, title: String, body: String, tag: String, topics: List<String> = emptyList(), mediaPaths: List<String> = emptyList()): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("action", "draft").put("title", title).put("body", body).put("tag", tag).put("topics", JSONArray(topics)).put("mediaPaths", JSONArray(mediaPaths))
        id?.let { payload.put("id", it) }
        request("/api/v1/library-state", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun publishDraft(id: Int? = null, title: String, body: String, tag: String, topics: List<String>, mediaPaths: List<String>, attachments: List<JSONObject> = emptyList(), seriesId: String? = null, routeConfirmed: Boolean = false): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("action", "publish").put("title", title).put("body", body).put("tag", tag).put("topics", JSONArray(topics)).put("mediaPaths", JSONArray(mediaPaths)).put("attachments", JSONArray(attachments)).put("routeConfirmed", routeConfirmed)
        id?.let { payload.put("id", it) }
        seriesId?.takeIf(String::isNotBlank)?.let { payload.put("seriesId", it) }
        request("/api/v1/library-state", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun submitFeedback(category: String, message: String): JSONObject = withContext(Dispatchers.IO) {
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("category", category)
            .addFormDataPart("message", message)
            .addFormDataPart("website", "")
            .build()
        val response = api.post("${BuildConfig.API_BASE_URL}/api/v1/feedback", "Bearer $token", body)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || root.has("error")) throw IOException(root.optString("error").ifBlank { "反馈提交失败（${response.code()}）" })
        root.optJSONObject("data") ?: root
    }

    suspend fun progression(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/progression", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun membershipState(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/membership", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun redeemMembership(action: String, code: String, requestId: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(action in setOf("preview", "redeem"))
        val body = if (action == "preview") JSONObject().put("code", code)
        else JSONObject().put("previewToken", code)
        val path = if (action == "preview") "/api/v1/membership/redeem/preview" else "/api/v1/membership/redeem/confirm"
        request(path, method = "POST", body = body.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun claimExperienceReward(level: Int): JSONObject = withContext(Dispatchers.IO) {
        require(level in 1..10)
        request("/api/v1/progression", method = "POST", body = JSONObject().put("level", level).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun appVersion(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/app-version", includeSession = false) as? JSONObject ?: JSONObject()
    }

    suspend fun dailyMissions(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/daily-missions", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun claimDailyMission(missionKey: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/daily-missions", method = "POST", body = JSONObject().put("missionKey", missionKey).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun explorationSnapshot(userId: String): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(explorationCacheKey("center", userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveExplorationSnapshot(userId: String, value: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(explorationCacheKey("center", userId), value.toString())
    }

    suspend fun explorationAd(): JSONObject? = withContext(Dispatchers.IO) {
        request("/api/v1/exploration-ad", includeSession = true) as? JSONObject
    }

    suspend fun explorationCalendar(userId: String, month: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val key = explorationCacheKey("calendar-${month ?: "current"}", userId)
        val session = auth.current() ?: throw IOException("登录后查看探索日历")
        if (session.userId != userId) throw IOException("账号已切换，请重新加载探索日历")
        val monthQuery = month?.let { "?month=${encode(it)}" }.orEmpty()
        val result = request("/api/v1/exploration-calendar$monthQuery", authenticated = true) as? JSONObject
            ?: throw IOException("探索日历暂不可用")
        cache.put(key, result.toString())
        result
    }

    suspend fun cachedExplorationCalendar(userId: String, month: String? = null): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(explorationCacheKey("calendar-${month ?: "current"}", userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun explorationRoom(userId: String, code: String): JSONObject = withContext(Dispatchers.IO) {
        val key = explorationCacheKey("co-explore-${code.uppercase()}", userId)
        cache.get(key)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()
    }

    suspend fun saveExplorationRoom(userId: String, code: String, value: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(explorationCacheKey("co-explore-${code.uppercase()}", userId), value.toString())
    }

    suspend fun createCoExploreRoom(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/co-explore", method = "POST", body = JSONObject().put("action", "create").toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun joinCoExploreRoom(code: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/co-explore", method = "POST", body = JSONObject().put("action", "join").put("code", code.uppercase()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun coExploreRoom(code: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/co-explore?code=${encode(code.uppercase())}", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun pickCoExplorePost(code: String, postId: String, note: String): JSONObject = withContext(Dispatchers.IO) {
        request(
            "/api/v1/co-explore",
            method = "POST",
            body = JSONObject().put("action", "pick").put("code", code.uppercase()).put("postId", postId).put("note", note.take(180)).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun explorationChains(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/exploration-chains", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun cachedExplorationChains(userId: String): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(explorationCacheKey("chains", userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveExplorationChains(userId: String, value: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(explorationCacheKey("chains", userId), value.toString())
    }

    suspend fun createExplorationChain(postId: String, title: String, prompt: String, content: String): JSONObject = withContext(Dispatchers.IO) {
        request(
            "/api/v1/exploration-chains",
            method = "POST",
            body = JSONObject().put("action", "create").put("postId", postId).put("title", title).put("prompt", prompt).put("content", content).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun contributeExplorationChain(chainId: String, content: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/exploration-chains", method = "POST", body = JSONObject().put("action", "contribute").put("chainId", chainId).put("content", content).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun closeExplorationChain(chainId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/exploration-chains", method = "POST", body = JSONObject().put("action", "close").put("chainId", chainId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun explorationCandidates(): List<HeikaPost> = withContext(Dispatchers.IO) {
        val payload = request("/api/demo/cards?mode=discover&limit=24", includeSession = true) as? JSONObject ?: JSONObject()
        payload.optJSONArray("items").jsonObjects().map(HeikaPost::from).filter { it.cloudId.isNotBlank() && it.id > 0 }
    }

    suspend fun uploadImage(postId: String?, uploadId: String, fileName: String, mimeType: String, bytes: ByteArray, sortOrder: Int, revisionMode: Boolean = false, onProgress: (Int) -> Unit = {}): JSONObject = withContext(Dispatchers.IO) {
        require(bytes.size in 1..(4 * 1024 * 1024)) { "单张图片须小于 4 MB" }
        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
            .addFormDataPart("upload_id", uploadId)
            .addFormDataPart("sort_order", sortOrder.toString())
            .addFormDataPart("task_key", "android:${uploadId}")
            .addFormDataPart("client_type", "android")
            .addFormDataPart("client_version", BuildConfig.VERSION_NAME)
        if (revisionMode) {
            builder.addFormDataPart("revision_post_id", postId?.takeIf(String::isNotBlank) ?: throw IOException("内容编号无效"))
        } else if (postId.isNullOrBlank()) {
            builder.addFormDataPart("staging", "1")
        } else builder.addFormDataPart("post_id", postId)
        val requestBody = builder.build()
        // 逐字节上报进度：真机弱网下也能看到真实的已发送比例，不靠计时器假装。
        val progressBody = object : RequestBody() {
            override fun contentType() = requestBody.contentType()
            override fun contentLength() = requestBody.contentLength()
            override fun writeTo(sink: BufferedSink) {
                val total = contentLength()
                var written = 0L
                val counting = object : ForwardingSink(sink) {
                    override fun write(source: Buffer, byteCount: Long) {
                        super.write(source, byteCount)
                        written += byteCount
                        if (total > 0) onProgress(((written * 100L) / total).toInt().coerceIn(0, 100))
                    }
                }.buffer()
                requestBody.writeTo(counting)
                counting.flush()
            }
        }
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val response = api.post("${BuildConfig.API_BASE_URL}/api/v1/media", "Bearer $token", progressBody)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || root.has("error")) throw IOException(root.optString("error").ifBlank { "图片上传失败（${response.code()}）" })
        (root.opt("data") as? JSONObject) ?: root
    }

    /** AI 内容附件：单个 ≤30 MB，最多 3 个，全服每天 20 个名额。 */
    suspend fun uploadAttachment(fileName: String, mimeType: String, bytes: ByteArray, uploadId: String, onProgress: (Int) -> Unit = {}): JSONObject = withContext(Dispatchers.IO) {
        require(bytes.size in 1..(30 * 1024 * 1024)) { "单个附件不能超过 30 MB" }
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val requestBody = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("uploadId", uploadId)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
            .build()
        val progressBody = object : RequestBody() {
            override fun contentType() = requestBody.contentType()
            override fun contentLength() = requestBody.contentLength()
            override fun writeTo(sink: BufferedSink) {
                val total = contentLength()
                var written = 0L
                val counting = object : ForwardingSink(sink) {
                    override fun write(source: Buffer, byteCount: Long) {
                        super.write(source, byteCount)
                        written += byteCount
                        if (total > 0) onProgress(((written * 100L) / total).toInt().coerceIn(0, 100))
                    }
                }.buffer()
                requestBody.writeTo(counting)
                counting.flush()
            }
        }
        val response = api.post("${BuildConfig.API_BASE_URL}/api/v1/attachments", "Bearer $token", progressBody)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || root.has("error")) throw IOException(root.optString("error").ifBlank { "附件上传失败（${response.code()}）" })
        (root.opt("data") as? JSONObject) ?: throw IOException("附件上传失败")
    }

    /** 今日剩余的附件名额。 */
    suspend fun attachmentQuota(): Int = withContext(Dispatchers.IO) {
        val data = request("/api/v1/attachments", authenticated = true) as? JSONObject ?: return@withContext -1
        data.optInt("remaining", -1)
    }

    suspend fun deleteAttachment(path: String) = withContext(Dispatchers.IO) {
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val response = api.delete("${BuildConfig.API_BASE_URL}/api/v1/attachments?path=${encode(path)}", "Bearer $token", JSONObject().toString().toRequestBody(JSON))
        if (!response.isSuccessful) throw IOException("移除失败，请稍后重试")
    }

    /** 附件下载地址：私有桶需要签名链接。 */
    suspend fun attachmentUrl(path: String, name: String): String = withContext(Dispatchers.IO) {
        val data = request("/api/v1/attachments?path=${encode(path)}&name=${encode(name)}", authenticated = true) as? JSONObject
            ?: throw IOException("附件下载链接获取失败")
        data.optString("url").takeIf(String::isNotBlank) ?: throw IOException("附件已失效")
    }

    suspend fun deleteUploadedImage(postId: String?, path: String) = withContext(Dispatchers.IO) {
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val fileName = path.substringAfterLast('/')
        val uploadId = fileName.substringBeforeLast('.')
        val extension = fileName.substringAfterLast('.', "")
        val mime = when (extension.lowercase()) { "jpg", "jpeg" -> "image/jpeg"; "png" -> "image/png"; "webp" -> "image/webp"; else -> throw IOException("图片路径无效") }
        val payload = JSONObject().put("upload_id", uploadId).put("file_type", mime)
        postId?.takeIf(String::isNotBlank)?.let { payload.put("post_id", it) }
        val body = payload.toString().toRequestBody(JSON)
        val response = api.delete("${BuildConfig.API_BASE_URL}/api/v1/media", "Bearer $token", body)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val json = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || json.has("error")) throw IOException(json.optString("error").ifBlank { "图片清理失败" })
    }

    suspend fun dailyState(userId: String, day: String): DailyStateEntity? = cacheDao.daily(userId, day)

    suspend fun saveDailyState(value: DailyStateEntity) = cacheDao.putDaily(value)

    suspend fun clearUserCache(userId: String) {
        cacheDao.clearDailyForUser(userId)
        cacheDao.clearFeedForUser(userId)
        recommendationCache.remove(userId)
        staffCache = null
    }

    suspend fun localPublishSnapshot(userId: String, channel: String = "community"): JSONObject? = withContext(Dispatchers.IO) {
        if (!userId.matches(Regex("[0-9a-fA-F-]{36}"))) return@withContext null
        cacheDao.publishSnapshot(publishSnapshotKey(userId, channel))?.payload?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveLocalPublishSnapshot(userId: String, payload: JSONObject, channel: String = "community") = withContext(Dispatchers.IO) {
        if (!userId.matches(Regex("[0-9a-fA-F-]{36}"))) return@withContext
        cacheDao.putPublishSnapshot(com.heika.nativeapp.db.FeedCacheEntity(publishSnapshotKey(userId, channel), payload.toString(), System.currentTimeMillis()))
    }

    suspend fun clearLocalPublishSnapshot(userId: String, channel: String = "community") = withContext(Dispatchers.IO) {
        if (!userId.matches(Regex("[0-9a-fA-F-]{36}"))) return@withContext
        cacheDao.clearPublishSnapshot(publishSnapshotKey(userId, channel))
    }

    /** 合集详情：带章节明细、作者、关注状态与上次阅读章节。 */
    suspend fun collectionDetail(id: String): HeikaCollection = withContext(Dispatchers.IO) {
        val payload = request("/api/v1/series?id=${encode(id)}", includeSession = true) as? JSONObject
            ?: throw IOException("合集暂不可用")
        HeikaCollection.from(payload)
    }

    /** 合集频道：分区、分类、排序与分页都由服务端按真实数据裁剪，前端不补假数据。 */
    suspend fun seriesDiscover(
        sort: String = "recommended",
        category: Int? = null,
        channel: String? = null,
        page: Int = 1,
        limit: Int = 18,
    ): HeikaSeriesDiscover = withContext(Dispatchers.IO) {
        val params = buildList {
            add("sort=$sort")
            add("page=$page")
            add("limit=$limit")
            category?.let { add("category=$it") }
            channel?.takeIf(String::isNotBlank)?.let { add("channel=$it") }
        }
        val payload = request("/api/v1/series/discover?" + params.joinToString("&"), includeSession = true) as? JSONObject
            ?: throw IOException("合集频道暂不可用")
        HeikaSeriesDiscover.from(payload)
    }

    /** 正文后的关联内容：真实关联，不做随机填充。 */
    suspend fun postRelated(postId: String): HeikaRelated = withContext(Dispatchers.IO) {
        val payload = request("/api/v1/posts/${encode(postId)}/related", includeSession = true) as? JSONObject
            ?: JSONObject()
        relatedFrom(payload)
    }

    /** 榜单快照读取：服务端已做缓存与降级，这里只取当前快照。 */
    suspend fun rankings(keys: String = "global,ai,series,rising,long"): Map<String, List<HeikaRankItem>> =
        withContext(Dispatchers.IO) {
            val payload = request("/api/v1/rankings?keys=$keys", includeSession = true) as? JSONObject
                ?: return@withContext emptyMap()
            rankingsFrom(payload)
        }

    /** 推荐：surface=series 返回合集，surface=ai|discover 返回作品。 */
    suspend fun recommendationSeries(limit: Int = 8): List<HeikaSeriesCard> = withContext(Dispatchers.IO) {
        val payload = request("/api/v1/recommendations?surface=series&limit=$limit", includeSession = true) as? JSONObject
            ?: return@withContext emptyList()
        recommendationSeriesFrom(payload)
    }

    suspend fun recommendationPosts(surface: String = "ai", limit: Int = 6): List<HeikaRelatedPost> =
        withContext(Dispatchers.IO) {
            val payload = request("/api/v1/recommendations?surface=$surface&limit=$limit", includeSession = true) as? JSONObject
                ?: return@withContext emptyList()
            recommendationPostsFrom(payload)
        }

    /** 统一搜索：综合 / 精选 / AI / 合集 / 用户 / 话题共用一次召回与相关性排序。 */
    suspend fun searchUnified(
        query: String,
        tab: String = "all",
        sort: String = "relevance",
        page: Int = 1,
        limit: Int = 12,
    ): JSONObject = withContext(Dispatchers.IO) {
        val params = buildList {
            add("mode=unified")
            add("q=${encode(query)}")
            add("tab=$tab")
            add("sort=$sort")
            add("page=$page")
            add("limit=$limit")
        }
        request("/api/v1/search?" + params.joinToString("&"), includeSession = true) as? JSONObject
            ?: JSONObject()
    }

    /** 搜索联想：服务端已去重、纠正前缀错字，并做过异常词过滤。 */
    suspend fun searchSuggest(query: String): HeikaSuggestions = withContext(Dispatchers.IO) {
        val payload = request("/api/v1/search/suggest?q=${encode(query)}", includeSession = true) as? JSONObject
            ?: return@withContext HeikaSuggestions(query)
        val items = payload.optJSONArray("items")
        HeikaSuggestions(
            query = payload.optString("query", query),
            items = (0 until (items?.length() ?: 0)).mapNotNull { index -> items?.optString(index)?.takeIf(String::isNotBlank) },
            corrected = payload.optString("corrected").takeIf(String::isNotBlank),
        )
    }

    /** 搜索点击回执：用于搜索分析与热搜可信度，失败不打扰用户。 */
    suspend fun recordSearchClick(term: String, entityType: String, entityId: String) = withContext(Dispatchers.IO) {
        runCatching {
            request(
                "/api/v1/events",
                method = "POST",
                body = JSONObject().put("type", "search_click").put("query", term)
                    .put("entityType", entityType).put("entityId", entityId).toString(),
                includeSession = true,
            )
        }
        Unit
    }

    /** 作者合集列表；scope=all 时作者本人可见未过审合集。 */
    suspend fun creatorCollections(creatorId: String? = null, scope: String? = null): List<HeikaCollection> = withContext(Dispatchers.IO) {
        val params = buildList {
            creatorId?.takeIf(String::isNotBlank)?.let { add("creator=${encode(it)}") }
            scope?.takeIf(String::isNotBlank)?.let { add("scope=${encode(it)}") }
        }
        val query = "/api/v1/series" + if (params.isEmpty()) "" else "?" + params.joinToString("&")
        val payload = request(query, includeSession = true) as? JSONObject ?: JSONObject()
        payload.optJSONArray("items").jsonObjects().map(HeikaCollection::from)
    }

    suspend fun saveCollection(
        id: String?,
        title: String,
        description: String,
        coverUrl: String?,
        kind: String,
        channel: String,
        status: String,
        categoryId: Int? = null,
    ): HeikaCollection = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("title", title)
            .put("description", description)
            .put("kind", kind)
            .put("channel", channel)
            .put("status", status)
        id?.takeIf(String::isNotBlank)?.let { body.put("id", it) }
        coverUrl?.takeIf(String::isNotBlank)?.let { body.put("coverUrl", it) }
        categoryId?.takeIf { it > 0 }?.let { body.put("categoryId", it) }
        val payload = request("/api/v1/series", method = "POST", body = body.toString(), authenticated = true) as? JSONObject
            ?: throw IOException("合集保存失败")
        HeikaCollection.from(payload)
    }

    suspend fun deleteCollection(id: String) = withContext(Dispatchers.IO) {
        request("/api/v1/series", method = "POST", body = JSONObject().put("action", "delete").put("id", id).toString(), authenticated = true)
        Unit
    }

    suspend fun addCollectionItems(id: String, postIds: List<String>, reorder: Boolean = false) = withContext(Dispatchers.IO) {
        require(postIds.isNotEmpty()) { "请选择要加入合集的作品" }
        request(
            "/api/v1/series",
            method = "POST",
            body = JSONObject()
                .put("action", if (reorder) "reorder" else "add_items")
                .put("id", id)
                .put("postIds", JSONArray(postIds))
                .toString(),
            authenticated = true,
        )
        Unit
    }

    suspend fun removeCollectionItem(id: String, postId: String) = withContext(Dispatchers.IO) {
        request(
            "/api/v1/series",
            method = "POST",
            body = JSONObject().put("action", "remove_item").put("id", id).put("postId", postId).toString(),
            authenticated = true,
        )
        Unit
    }

    suspend fun followCollection(id: String, following: Boolean, notify: Boolean = true) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("action", "follow").put("id", id).put("value", following)
        if (following) body.put("notify", notify)
        request("/api/v1/series", method = "POST", body = body.toString(), authenticated = true)
        Unit
    }

    suspend fun setCollectionNotify(id: String, notify: Boolean) = withContext(Dispatchers.IO) {
        request(
            "/api/v1/series",
            method = "POST",
            body = JSONObject().put("action", "notify").put("id", id).put("notify", notify).toString(),
            authenticated = true,
        )
        Unit
    }

    /** 章节级阅读进度；未登录时静默跳过，不阻塞阅读。 */
    suspend fun recordCollectionProgress(seriesId: String, postId: String) = withContext(Dispatchers.IO) {
        if (auth.current() == null) return@withContext Unit
        runCatching {
            request(
                "/api/v1/series",
                method = "POST",
                body = JSONObject().put("action", "progress").put("id", seriesId).put("postId", postId).toString(),
                authenticated = true,
            )
        }
        Unit
    }

    private fun publishSnapshotKey(userId: String, channel: String) = if (channel == "ai") "native-publish:ai:$userId" else "native-publish:$userId"

    private suspend fun feedCacheKey(filter: FeedFilter): String = listOf(
        filter.channel,
        filter.category?.id?.toString().orEmpty(),
        filter.topic.orEmpty(),
        filter.sort,
        filter.contentType.orEmpty(),
        filter.usageScenario.orEmpty(),
        filter.query.orEmpty(),
        // Signed-in recommendations, following feeds, and saved-state fields differ per user.
        auth.current()?.userId ?: "public",
    ).joinToString(":")

    private fun explorationCacheKey(section: String, userId: String): String = NativeCacheKeys.exploration(section, userId)

    private suspend fun request(
        path: String,
        method: String = "GET",
        body: String? = null,
        authenticated: Boolean = false,
        includeSession: Boolean = authenticated,
    ): Any? {
        require(path.startsWith('/') && !path.startsWith("//")) { "请求地址无效" }
        val url = BuildConfig.API_BASE_URL + path
        var token = if (includeSession) auth.currentToken() else null
        if (authenticated && token == null) throw IOException("请先登录后继续")
        var response = send(url, method, body, token)
        if (response.code() == 401 && token != null) {
            response.body()?.close()
            response.errorBody()?.close()
            val refreshed = auth.retryAfterUnauthorized()
            if (refreshed != null) {
                token = refreshed
                response = send(url, method, body, token)
            } else if (authenticated) {
                throw IOException("登录状态已失效，请重新登录")
            } else {
                response = send(url, method, body, null)
            }
        }
        val result = response
        val content = (if (result.isSuccessful) result.body() else result.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else runCatching { JSONTokener(content).nextValue() }.getOrElse { JSONObject() }
        if (!result.isSuccessful) {
            val errorBody = root as? JSONObject ?: JSONObject()
            val message = sequenceOf("error", "message", "details")
                .map { errorBody.optString(it) }
                .firstOrNull { it.isNotBlank() }
            val endpoint = path.substringBefore('?')
            val diagnostic = buildString {
                append("HEIKA API ").append(method).append(' ').append(endpoint)
                append(" 返回 HTTP ").append(result.code())
                message?.let { append("：").append(it) }
            }
            throw IOException(diagnostic)
        }
        if (root is JSONObject && root.has("error") && !root.isNull("error")) throw IOException(root.optString("error"))
        return if (root is JSONObject && root.has("data")) root.opt("data") else root
    }

    private val aiResourceTypes = setOf("knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial")

    private suspend fun send(url: String, method: String, body: String?, token: String?): Response<ResponseBody> {
        val authorization = token?.let { "Bearer $it" }
        val jsonBody = body?.toRequestBody(JSON)
        return when (method) {
            "POST" -> api.post(url, authorization, jsonBody ?: "{}".toRequestBody(JSON))
            "PATCH" -> api.patch(url, authorization, jsonBody ?: "{}".toRequestBody(JSON))
            "DELETE" -> api.delete(url, authorization, jsonBody ?: "{}".toRequestBody(JSON))
            else -> api.get(url, authorization)
        }
    }

    private fun parsePosts(source: String): List<HeikaPost> = runCatching {
        JSONArray(source).jsonObjects().map(HeikaPost::from)
    }.getOrDefault(emptyList())

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun isUuid(value: String): Boolean = value.matches(Regex("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))

    private companion object {
        const val RANKING_CACHE_MS = 5L * 60 * 1000
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}

data class FeedPageKey(
    val cursorCreatedAt: String? = null,
    val cursorPostId: String? = null,
    val page: Int = 1,
)
