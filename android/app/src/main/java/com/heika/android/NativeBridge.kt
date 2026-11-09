package com.heika.android

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.webkit.WebView
import androidx.core.net.toUri
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.LinkedHashMap
import java.util.UUID

internal class NativeBridge(
    private val webView: WebView,
    private val appOrigin: Uri,
    private val trustedOrigins: Set<Uri>,
    private val diagnostics: Diagnostics,
    private val callbacks: Callbacks,
) {
    interface Callbacks {
        fun onWebReady()
        fun onPermissionRequest(requestId: String)
        fun onNotificationStatusRequest(requestId: String)
        fun onNotificationSettingsRequest(requestId: String)
        fun onSystemShareRequest(requestId: String, payload: JSONObject)
        fun onAboutOpenRequest(requestId: String)
        fun onPageState(path: String)
        fun onBackResult(requestId: String, consumed: Boolean)
        fun onNavigationAck(requestId: String, accepted: Boolean)
        fun onCardTransitionRequest(requestId: String, requestType: String, payload: JSONObject)
        fun onDiscoveryVisibility(visible: Boolean, navigationTopCss: Double, theme: String, composeLeftCss: Double, composeTopCss: Double, composeWidthCss: Double, composeHeightCss: Double)
        fun onDiscoverySession(userId: String?, accessToken: String?)
        fun onDiscoveryPersonalization(userId: String?, interests: List<String>, viewedIds: List<Long>, personalRatings: Map<Long, Int>)
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val pending = mutableMapOf<String, PendingReply>()
    private val completed = object : LinkedHashMap<String, String>(MAX_CACHED_RESULTS, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?): Boolean =
            size > MAX_CACHED_RESULTS
    }
    private var currentProxy: JavaScriptReplyProxy? = null
    private var ready = false
    private var disposed = false

    data class PendingReply(val requestType: String, val proxy: JavaScriptReplyProxy)

    @SuppressLint("RequiresFeature")
    fun install(): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            diagnostics.recordBridgeFailure()
            return false
        }
        return runCatching {
            WebViewCompat.addWebMessageListener(
                webView,
                JS_OBJECT_NAME,
                trustedOrigins.mapTo(LinkedHashSet(), ::originString),
            ) { _, message, sourceOrigin, isMainFrame, replyProxy ->
                if (!isMainFrame || trustedOrigins.none { sameOrigin(sourceOrigin, it) }) {
                    diagnostics.recordBridgeFailure()
                    return@addWebMessageListener
                }
                val raw = message.data ?: ""
                if (raw.length > MAX_MESSAGE_LENGTH) {
                    diagnostics.recordBridgeFailure()
                    return@addWebMessageListener
                }
                mainHandler.postAtTime({
                    if (!disposed) handleMessage(raw, replyProxy)
                }, this, SystemClock.uptimeMillis())
            }
            true
        }.getOrElse {
            diagnostics.recordBridgeFailure()
            false
        }
    }

    fun onPageStarted() {
        if (disposed) return
        ready = false
        currentProxy = null
        pending.clear()
    }

    fun dispose() {
        if (disposed) return
        disposed = true
        mainHandler.removeCallbacksAndMessages(this)
        runCatching { WebViewCompat.removeWebMessageListener(webView, JS_OBJECT_NAME) }
        pending.clear()
        completed.clear()
        currentProxy = null
        ready = false
    }

    fun sendEvent(type: String, payload: JSONObject = JSONObject()): Boolean {
        if (disposed || !ready) return false
        val proxy = currentProxy ?: return false
        val message = JSONObject()
            .put("version", PROTOCOL_VERSION)
            .put("id", UUID.randomUUID().toString())
            .put("type", "event")
            .put("event", type)
            .put("payload", payload)
            .toString()
        return safePost(proxy, message)
    }

    fun isReady(): Boolean = ready && !disposed

    fun replyPermission(requestId: String, granted: Boolean, enabled: Boolean) {
        complete(
            requestId,
            "notifications.requestPermission",
            true,
            JSONObject()
                .put("granted", granted)
                .put("enabled", enabled)
                .put("permission", if (granted) "granted" else "denied"),
        )
    }

    fun failRequest(requestId: String, requestType: String, error: String) {
        complete(requestId, requestType, false, JSONObject().put("code", error))
    }

    fun completeRequest(requestId: String, requestType: String, ok: Boolean, data: JSONObject = JSONObject()) {
        complete(requestId, requestType, ok, data)
    }

    private fun handleMessage(raw: String, replyProxy: JavaScriptReplyProxy) {
        if (disposed) return
        val request = try {
            JSONObject(raw)
        } catch (_: Exception) {
            diagnostics.recordBridgeFailure()
            return
        }
        val version = request.optInt("version", -1)
        val id = request.optString("id")
        val type = request.optString("type")
        if (version != PROTOCOL_VERSION || !REQUEST_ID.matches(id) || type !in ALLOWED_TYPES) {
            diagnostics.recordBridgeFailure()
            return
        }
        completed[id]?.let {
            safePost(replyProxy, it)
            return
        }
        if (pending.containsKey(id)) return
        currentProxy = replyProxy

        when (type) {
            "bridge.ready" -> {
                ready = true
                complete(id, type, true, JSONObject())
                callbacks.onWebReady()
            }
            "capabilities.get" -> complete(
                id,
                type,
                true,
                JSONObject()
                    .put("notifications.permission", true)
                    .put("notifications.status", true)
                    .put("notifications.openSettings", true)
                    .put("system.filePicker", true)
                    .put("system.share", true)
                    .put("app.about.open", true)
                    .put("discovery.native", true)
                    .put("navigation.events", true),
            )
            "notifications.requestPermission" -> {
                pending[id] = PendingReply(type, replyProxy)
                callbacks.onPermissionRequest(id)
            }
            "notifications.status" -> callbacks.onNotificationStatusRequest(id)
            "notifications.openSettings" -> callbacks.onNotificationSettingsRequest(id)
            "system.share" -> {
                val payload = request.optJSONObject("payload") ?: JSONObject()
                callbacks.onSystemShareRequest(id, payload)
            }
            "app.about.open" -> callbacks.onAboutOpenRequest(id)
            "page.state" -> {
                val path = request.optJSONObject("payload")?.optString("path").orEmpty()
                if (!isSafePagePath(path)) {
                    complete(id, type, false, JSONObject().put("code", "invalid_path"))
                } else {
                    callbacks.onPageState(path)
                    complete(id, type, true, JSONObject())
                }
            }
            "system.back.result" -> {
                val payload = request.optJSONObject("payload")
                val backId = payload?.optString("requestId").orEmpty()
                if (!REQUEST_ID.matches(backId)) {
                    complete(id, type, false, JSONObject().put("code", "invalid_request"))
                } else {
                    callbacks.onBackResult(backId, payload?.optBoolean("consumed", false) == true)
                    complete(id, type, true, JSONObject())
                }
            }
            "navigation.ack" -> {
                val payload = request.optJSONObject("payload")
                val navigationId = payload?.optString("requestId").orEmpty()
                if (!REQUEST_ID.matches(navigationId)) {
                    complete(id, type, false, JSONObject().put("code", "invalid_request"))
                } else {
                    callbacks.onNavigationAck(navigationId, payload?.optBoolean("accepted", false) == true)
                    complete(id, type, true, JSONObject())
                }
            }
            "image.error" -> {
                diagnostics.recordResourceFailure()
                complete(id, type, true, JSONObject())
            }
            "discovery.visibility" -> {
                val payload = request.optJSONObject("payload") ?: JSONObject()
                val top = payload.optDouble("navigationTopCss", Double.NaN)
                val theme = payload.optString("theme").takeIf { it == "light" || it == "dark" } ?: "dark"
                val composeLeft = payload.optDouble("composeLeftCss", Double.NaN)
                val composeTop = payload.optDouble("composeTopCss", Double.NaN)
                val composeWidth = payload.optDouble("composeWidthCss", Double.NaN)
                val composeHeight = payload.optDouble("composeHeightCss", Double.NaN)
                val visible = payload.optBoolean("visible")
                val validCutout = composeLeft.isFinite() && composeLeft in -500.0..10_000.0 &&
                    composeTop.isFinite() && composeTop in -500.0..10_000.0 && composeWidth.isFinite() && composeWidth in 1.0..500.0 &&
                    composeHeight.isFinite() && composeHeight in 1.0..500.0
                val validLayout = top.isFinite() && top in 0.0..10_000.0 && (!visible || validCutout)
                if (!validLayout) {
                    complete(id, type, false, JSONObject().put("code", "invalid_layout"))
                } else {
                    callbacks.onDiscoveryVisibility(visible, top, theme, composeLeft, composeTop, composeWidth, composeHeight)
                    complete(id, type, true, JSONObject())
                }
            }
            "discovery.auth" -> {
                val payload = request.optJSONObject("payload") ?: JSONObject()
                val userId = payload.optString("userId").takeIf { UUID_PATTERN.matches(it) }
                val token = payload.optString("accessToken").takeIf { isValidAccessToken(it) }
                callbacks.onDiscoverySession(userId, token)
                complete(id, type, true, JSONObject().put("received", token != null))
            }
            "discovery.personalization" -> {
                val payload = request.optJSONObject("payload") ?: JSONObject()
                val userId = payload.optString("userId").takeIf { UUID_PATTERN.matches(it) }
                val interests = payload.optJSONArray("interests")?.let { values ->
                    (0 until minOf(values.length(), 24)).mapNotNull { index ->
                        values.optString(index).filterNot(Char::isISOControl).trim().take(40).takeIf(String::isNotEmpty)
                    }.distinct()
                }.orEmpty()
                val viewed = payload.optJSONArray("viewedIds")?.let { values ->
                    (0 until minOf(values.length(), 200)).mapNotNull { index -> values.optLong(index, -1L).takeIf { it > 0L } }.distinct()
                }.orEmpty()
                val ratingsObject = payload.optJSONObject("personalRatings") ?: JSONObject()
                val ratings = ratingsObject.keys().asSequence().take(200).mapNotNull { key ->
                    val postId = key.toLongOrNull() ?: return@mapNotNull null
                    val rating = ratingsObject.optInt(key, 0)
                    if (postId > 0L && rating in 1..5) postId to rating else null
                }.toMap()
                callbacks.onDiscoveryPersonalization(userId, interests, viewed, ratings)
                complete(id, type, true, JSONObject().put("accepted", true))
            }
            "card.transition.prepare", "card.transition.start", "card.transition.cancel", "card.transition.release" -> {
                val payload = request.optJSONObject("payload") ?: JSONObject()
                val transactionId = payload.optString("transactionId")
                if (!TRANSITION_ID.matches(transactionId)) {
                    complete(id, type, false, JSONObject().put("code", "invalid_transition"))
                } else {
                    pending[id] = PendingReply(type, replyProxy)
                    callbacks.onCardTransitionRequest(id, type, payload)
                }
            }
        }
    }

    private fun complete(id: String, requestType: String, ok: Boolean, data: JSONObject) {
        if (disposed) return
        val saved = pending.remove(id)
        val proxy = saved?.proxy ?: currentProxy
        val response = JSONObject()
            .put("version", PROTOCOL_VERSION)
            .put("id", id)
            .put("type", "result")
            .put("requestType", requestType)
            .put("ok", ok)
            .put("data", data)
            .toString()
        completed[id] = response
        if (proxy == null || !safePost(proxy, response)) diagnostics.recordBridgeFailure()
    }

    @SuppressLint("RequiresFeature")
    private fun safePost(proxy: JavaScriptReplyProxy, message: String): Boolean =
        runCatching { proxy.postMessage(message); true }.getOrElse { false }

    private fun isSafePagePath(path: String): Boolean {
        if (path.length > MAX_PATH_LENGTH || !path.startsWith('/') || path.startsWith("//")) return false
        if ('#' in path || '\\' in path) return false
        if (!SAFE_PAGE_PATH.matches(path)) return false
        return runCatching {
            val uri = "${originString(appOrigin)}$path".toUri()
            val post = uri.getQueryParameter("post")
            val numericPostId = post?.toLongOrNull()
            if (post != null && (!POST_ID.matches(post) || numericPostId == null || numericPostId > MAX_SAFE_JS_INTEGER)) return false
            trustedOrigins.any { sameOrigin(uri, it) } && uri.userInfo == null
        }.getOrDefault(false)
    }

    private fun sameOrigin(left: Uri, right: Uri): Boolean =
        left.scheme.equals(right.scheme, ignoreCase = true) &&
            left.host.equals(right.host, ignoreCase = true) &&
            effectivePort(left) == effectivePort(right) &&
            left.userInfo == null

    private fun effectivePort(uri: Uri): Int = when {
        uri.port != -1 -> uri.port
        uri.scheme.equals("https", true) -> 443
        uri.scheme.equals("http", true) -> 80
        else -> -1
    }

    private fun originString(uri: Uri): String {
        val port = if (uri.port == -1 || uri.port == 443 && uri.scheme == "https") "" else ":${uri.port}"
        return "${uri.scheme}://${uri.host}$port"
    }

    companion object {
        const val JS_OBJECT_NAME = "HeikaNative"
        private const val PROTOCOL_VERSION = 1
        private const val MAX_MESSAGE_LENGTH = 16 * 1024
        private const val MAX_PATH_LENGTH = 1024
        private const val MAX_CACHED_RESULTS = 128
        private const val MAX_SAFE_JS_INTEGER = 9_007_199_254_740_991L
        private val REQUEST_ID = Regex("^[A-Za-z0-9_-]{1,80}$")
        private val TRANSITION_ID = Regex("^[A-Za-z0-9_-]{1,80}$")
        private val POST_ID = Regex("^[0-9]{1,20}$")
        private val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        private val SAFE_PAGE_PATH = Regex("^/(?:\\?post=[0-9]{1,20}|\\?auth=reset|\\?conversation=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})?$")
        private val ALLOWED_TYPES = setOf(
            "bridge.ready",
            "capabilities.get",
            "notifications.requestPermission",
            "notifications.status",
            "notifications.openSettings",
            "system.share",
            "app.about.open",
            "page.state",
            "system.back.result",
            "navigation.ack",
            "image.error",
            "card.transition.prepare",
            "card.transition.start",
            "card.transition.cancel",
            "card.transition.release",
            "discovery.visibility",
            "discovery.auth",
            "discovery.personalization",
        )

        private fun isValidAccessToken(token: String): Boolean = token.length in 60..4096 &&
            token.count { it == '.' } == 2 && token.matches(Regex("^[A-Za-z0-9_=-]+\\.[A-Za-z0-9_=-]+\\.[A-Za-z0-9_=-]*$"))
    }
}
