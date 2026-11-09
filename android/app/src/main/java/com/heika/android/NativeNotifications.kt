package com.heika.android

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

internal data class NativeNoticePost(val id: Long, val cloudId: String, val channel: String)
internal data class NativeNotice(
    val id: String,
    val type: String,
    val title: String,
    val createdAt: String,
    val read: Boolean,
    val actor: String,
    val postTitle: String,
    val post: NativeNoticePost?,
)
internal data class NativeNoticePage(val items: List<NativeNotice>, val unread: Int)

internal class NativeNotificationRepository {
    suspend fun load(token: String): NativeNoticePage = withContext(Dispatchers.IO) {
        val data = request("/api/v1/notifications?page=1&limit=30", token).optJSONObject("data")
            ?: throw IllegalStateException("通知数据格式无效")
        val rows = data.optJSONArray("items")
        val items = (0 until (rows?.length() ?: 0)).mapNotNull { index ->
            val row = rows?.optJSONObject(index) ?: return@mapNotNull null
            val id = row.optString("id").takeIf { it.length in 1..80 } ?: return@mapNotNull null
            val post = row.optJSONObject("post")?.let { value ->
                val postId = value.optLong("id", -1L)
                if (postId < 1L) null else NativeNoticePost(
                    id = postId,
                    cloudId = value.optString("cloudId"),
                    channel = if (value.optString("channel") == "ai") "ai" else "community",
                )
            }
            NativeNotice(
                id = id,
                type = row.optString("notification_type"),
                title = row.optString("title").take(240),
                createdAt = row.optString("created_at"),
                read = !row.isNull("read_at"),
                actor = row.optJSONObject("actor")?.optString("nickname")?.take(80).orEmpty(),
                postTitle = row.optJSONObject("post")?.optString("title")?.take(160).orEmpty(),
                post = post,
            )
        }
        NativeNoticePage(items, data.optInt("unread", 0).coerceAtLeast(0))
    }

    suspend fun markRead(token: String, id: String? = null) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("action", if (id == null) "read_all" else "read")
        if (id != null) body.put("id", id)
        request("/api/v1/notifications", token, body)
    }

    suspend fun commentsEnabled(token: String): Boolean = withContext(Dispatchers.IO) {
        request("/api/v1/settings/notifications", token).optJSONObject("data")?.optBoolean("commentsEnabled", true) ?: true
    }

    suspend fun setCommentsEnabled(token: String, value: Boolean) = withContext(Dispatchers.IO) {
        request("/api/v1/settings/notifications", token, JSONObject().put("commentsEnabled", value), "PATCH")
    }

    private fun request(path: String, token: String, body: JSONObject? = null, method: String = if (body == null) "GET" else "POST"): JSONObject {
        val connection = URL(BuildConfig.WEB_APP_URL.trimEnd('/') + path).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 12_000
        connection.readTimeout = 15_000
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Authorization", "Bearer $token")
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        }
        return try {
            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (connection.responseCode !in 200..299) {
                val error = runCatching { JSONObject(payload).optString("error") }.getOrNull()
                throw IllegalStateException(error?.takeIf(String::isNotBlank) ?: "通知请求失败（${connection.responseCode}）")
            }
            JSONObject(payload)
        } finally {
            connection.disconnect()
        }
    }
}

/** App-owned notification inbox backed by the same authenticated web API. */
internal class NativeNotificationCenter(
    context: Context,
    private val tokenProvider: () -> String?,
    private val initialMessagesEnabled: Boolean,
    private val onMessagesEnabledChange: (Boolean) -> Unit,
    private val unreadSystemStatus: () -> String,
    private val onRequestPermission: () -> Unit,
    private val onOpenPost: (NativeNoticePost) -> Unit,
    private val onLogin: () -> Unit,
    private val onClose: () -> Unit,
) : LinearLayout(context) {
    private val repository = NativeNotificationRepository()
    private val viewScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val dark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) != android.content.res.Configuration.UI_MODE_NIGHT_NO
    private val ink = if (dark) Color.rgb(238, 238, 232) else Color.rgb(35, 36, 33)
    private val muted = if (dark) Color.rgb(160, 165, 162) else Color.rgb(111, 111, 105)
    private val backgroundColor = if (dark) Color.rgb(13, 16, 18) else Color.rgb(247, 245, 239)
    private val list = LinearLayout(context).apply { orientation = VERTICAL }
    private val status = TextView(context).apply { textSize = 13f; gravity = Gravity.CENTER; setTextColor(muted); setPadding(dp(20), dp(32), dp(20), dp(32)) }
    private val unreadSummary = TextView(context).apply { textSize = 12f; setTextColor(muted); setPadding(dp(2), dp(8), dp(2), dp(8)) }
    private val systemStatus = TextView(context).apply { textSize = 12f; setTextColor(muted); setPadding(0, dp(4), 0, dp(8)) }
    private var page = NativeNoticePage(emptyList(), 0)
    private var loading = false
    private var markingAll = false

    init {
        orientation = VERTICAL
        setBackgroundColor(backgroundColor)
        val header = LinearLayout(context).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(18), dp(8), dp(18), dp(8))
        }
        header.addView(button("‹") { onClose() }, LayoutParams(dp(42), dp(44)))
        header.addView(TextView(context).apply { text = "通知中心"; textSize = 19f; setTextColor(ink); setTypeface(typeface, android.graphics.Typeface.BOLD) }, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
        val readAll = button("全部已读") { markAll() }
        header.addView(readAll, LayoutParams(LayoutParams.WRAP_CONTENT, dp(40)))
        addView(header, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))

        val scroll = ScrollView(context).apply { isFillViewport = true; clipToPadding = false; setPadding(dp(16), dp(4), dp(16), dp(24)) }
        val content = LinearLayout(context).apply { orientation = VERTICAL }
        content.addView(preferenceSection())
        content.addView(unreadSummary)
        content.addView(status)
        content.addView(list)
        scroll.addView(content)
        addView(scroll, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
        load()
    }

    fun refreshSystemStatus() {
        systemStatus.text = unreadSystemStatus()
    }

    private fun preferenceSection() = LinearLayout(context).apply {
        orientation = VERTICAL
        setPadding(dp(14), dp(12), dp(14), dp(10))
        background = panelBackground()
        addView(TextView(context).apply { text = "系统通知权限"; textSize = 14f; setTextColor(ink) })
        systemStatus.text = unreadSystemStatus()
        addView(systemStatus)
        addView(button("管理通知权限") { onRequestPermission() }, LayoutParams(LayoutParams.WRAP_CONTENT, dp(38)))
        val messages = SwitchRow(context).apply {
            text = "私信消息提醒"
            isChecked = initialMessagesEnabled
            setOnCheckedChangeListener { _, checked -> onMessagesEnabledChange(checked) }
        }
        addView(messages)
        addView(TextView(context).apply {
            text = "应用在线时可显示系统提醒；进程结束后的推送服务尚未接通。"
            textSize = 11f
            setTextColor(muted)
            setPadding(0, 0, 0, dp(6))
        })
        val comments = SwitchRow(context)
        var updatingComments = false
        addView(comments)
        val token = tokenProvider()
        comments.text = "评论与回复提醒"
        comments.isEnabled = false
        comments.setOnCheckedChangeListener { _, checked ->
            if (!updatingComments && token != null) viewScope.launch {
                comments.isEnabled = false
                runCatching { repository.setCommentsEnabled(token, checked) }
                    .onSuccess { comments.isEnabled = true }
                    .onFailure {
                        updatingComments = true
                        comments.isChecked = !checked
                        updatingComments = false
                        comments.isEnabled = true
                        showError(it.message ?: "偏好设置同步失败")
                    }
            }
        }
        if (token != null) viewScope.launch {
            runCatching { repository.commentsEnabled(token) }
                .onSuccess {
                    updatingComments = true
                    comments.isChecked = it
                    updatingComments = false
                    comments.isEnabled = true
                }
                .onFailure { comments.isEnabled = true; showError(it.message ?: "无法读取通知偏好") }
        } else comments.isEnabled = false
    }

    private fun load() {
        if (loading) return
        status.visibility = View.VISIBLE
        status.text = "正在加载通知…"
        val token = tokenProvider()
        if (token.isNullOrBlank()) {
            status.text = "登录后查看账号通知"
            status.setOnClickListener { onLogin() }
            return
        }
        loading = true
        status.setOnClickListener(null)
        viewScope.launch {
            runCatching { repository.load(token) }
                .onSuccess { loading = false; page = it; render() }
                .onFailure { loading = false; showError(it.message ?: "通知加载失败") }
        }
    }

    private fun markAll() {
        val token = tokenProvider() ?: return
        if (page.unread == 0 || markingAll) return
        markingAll = true
        viewScope.launch {
            runCatching { repository.markRead(token) }
                .onSuccess { markingAll = false; page = page.copy(items = page.items.map { it.copy(read = true) }, unread = 0); render() }
                .onFailure { markingAll = false; showError(it.message ?: "标记已读失败") }
        }
    }

    private fun render() {
        list.removeAllViews()
        unreadSummary.text = "未读 ${page.unread} 条"
        status.setOnClickListener(null)
        if (page.items.isEmpty()) {
            status.visibility = View.VISIBLE
            status.text = "暂时没有新通知"
            return
        }
        status.visibility = View.GONE
        page.items.forEach { item ->
            val row = LinearLayout(context).apply {
                orientation = VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
                background = panelBackground()
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    if (!item.read) {
                        val token = tokenProvider()
                        if (token != null) viewScope.launch {
                            runCatching { repository.markRead(token, item.id) }
                                .onSuccess { page = page.copy(unread = (page.unread - 1).coerceAtLeast(0), items = page.items.map { old -> if (old.id == item.id) old.copy(read = true) else old }); render() }
                                .onFailure { showError(it.message ?: "已读状态同步失败") }
                        }
                    }
                    item.post?.let(onOpenPost)
                }
            }
            val byline = item.actor.ifBlank { if (item.type == "moderation") "黑卡审核" else "黑卡社区" }
            row.addView(TextView(context).apply { text = if (item.read) byline else "●  $byline"; textSize = 13f; setTextColor(if (item.read) muted else Color.rgb(202, 165, 83)) })
            row.addView(TextView(context).apply { text = item.title + item.postTitle.takeIf(String::isNotBlank)?.let { " ·《$it》" }.orEmpty(); textSize = 14f; setTextColor(ink); setPadding(0, dp(5), 0, dp(4)) })
            row.addView(TextView(context).apply { text = item.createdAt.replace('T', ' ').take(16); textSize = 11f; setTextColor(muted) })
            list.addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })
        }
    }

    private fun showError(message: String) {
        status.visibility = View.VISIBLE
        status.text = "$message\n点此重试"
        status.setOnClickListener { load() }
    }

    private fun button(label: String, action: () -> Unit) = TextView(context).apply {
        text = label; textSize = 13f; gravity = Gravity.CENTER; setTextColor(ink); setPadding(dp(8), 0, dp(8), 0)
        isClickable = true; isFocusable = true; setOnClickListener { action() }
    }

    private fun panelBackground() = GradientDrawable().apply {
        setColor(if (dark) Color.rgb(24, 28, 31) else Color.WHITE)
        cornerRadius = dp(10).toFloat()
        setStroke(dp(1), if (dark) Color.rgb(48, 54, 57) else Color.rgb(225, 222, 214))
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    override fun onDetachedFromWindow() {
        viewScope.cancel()
        super.onDetachedFromWindow()
    }

    private class SwitchRow(context: Context) : android.widget.Switch(context)
}
