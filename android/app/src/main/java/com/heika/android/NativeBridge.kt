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
    private val trustedOrigin: Uri,
    private val diagnostics: Diagnostics,
    private val callbacks: Callbacks,
) {
    interface Callbacks {
        fun onWebReady()
        fun onPermissionRequest(requestId: String)
        fun onPageState(path: String)
        fun onBackResult(requestId: String, consumed: Boolean)
        fun onNavigationAck(requestId: String, accepted: Boolean)
        fun onCardTransitionRequest(requestId: String, requestType: String, payload: JSONObject)
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
                setOf(originString(trustedOrigin)),
            ) { _, message, sourceOrigin, isMainFrame, replyProxy ->
                if (!isMainFrame || !sameOrigin(sourceOrigin, trustedOrigin)) {
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

    fun replyPermission(requestId: String, granted: Boolean, enabled: Boolean) {
        complete(
            requestId,
            "notifications.requestPermission",
            true,
            JSONObject().put("granted", granted).put("enabled", enabled),
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
                    .put("system.filePicker", true)
                    .put("navigation.events", true),
            )
            "notifications.requestPermission" -> {
                pending[id] = PendingReply(type, replyProxy)
                callbacks.onPermissionRequest(id)
            }
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
            val uri = "${originString(trustedOrigin)}$path".toUri()
            val post = uri.getQueryParameter("post")
            val numericPostId = post?.toLongOrNull()
            if (post != null && (!POST_ID.matches(post) || numericPostId == null || numericPostId > MAX_SAFE_JS_INTEGER)) return false
            sameOrigin(uri, trustedOrigin) && uri.userInfo == null
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
        private val SAFE_PAGE_PATH = Regex("^/(?:\\?post=[0-9]{1,20}|\\?auth=reset|\\?conversation=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})?$")
        private val ALLOWED_TYPES = setOf(
            "bridge.ready",
            "capabilities.get",
            "notifications.requestPermission",
            "page.state",
            "system.back.result",
            "navigation.ack",
            "image.error",
            "card.transition.prepare",
            "card.transition.start",
            "card.transition.cancel",
            "card.transition.release",
        )
    }
}
