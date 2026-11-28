package com.heika.lite

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import java.util.LinkedHashMap

/**
 * HEIKA Lite 版本化原生通信层（协议 v2，向下兼容 v1）。
 *
 * 约束：
 * 1. 仅接受主框架、可信同源调用（scheme + host + port 严格比对，userInfo 必须为空）。
 * 2. 已知类型白名单，未知类型返回 unsupported_type，不抛异常。
 * 3. 相同 requestId 的结果会被重放，副作用不会重复执行。
 * 4. 失败统一返回稳定错误码字符串，不返回堆栈或内部路径。
 */
internal class LiteBridge(
    private val webView: WebView,
    private val trustedScheme: String,
    private val trustedHosts: List<String>,
    private val trustedPort: Int,
    private val diagnostics: LiteDiagnostics,
    private val deviceInfoProvider: () -> JSONObject,
    private val callbacks: Callbacks
) {

    interface Callbacks {
        fun onWebReady()
        fun onPerformanceChange(mode: PerformanceMode)
        fun onThemeChange(mode: ThemeMode, dark: Boolean)
        fun onAutoDegradeChange(enabled: Boolean)
        fun onNotificationPermissionRequest(requestId: String)
        fun onNotificationStatusRequest(requestId: String)
        fun onNotificationSettingsRequest(requestId: String)
        fun onShareRequest(requestId: String, payload: JSONObject)
        fun onAboutOpenRequest(requestId: String)
        fun onPageState(path: String)
        fun onBackResult(requestId: String, consumed: Boolean)
        fun onNavigationAck(requestId: String, accepted: Boolean)
        fun onCardTransition(requestId: String, requestType: String, payload: JSONObject)
        fun onDownloadRequest(requestId: String, url: String, fileName: String?)
        fun onWebCacheClearRequest(requestId: String)
        fun onOpenExternalRequest(requestId: String, url: String)
        fun onEnvironmentRequest(): JSONObject
    }

    private val handler = Handler(Looper.getMainLooper())
    private val pending = HashSet<String>()
    private val completed = object : LinkedHashMap<String, String>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?): Boolean =
            size > MAX_CACHED_RESULTS
    }

    private val allowedTypes = setOf(
        "bridge.ready", "capabilities.get", "environment.get",
        "page.state", "system.back.result", "navigation.ack", "navigation.open.external",
        "device.info", "performance.get", "performance.set",
        "theme.get", "theme.set",
        "notifications.requestPermission", "notifications.status", "notifications.openSettings",
        "system.share", "system.download", "app.about.open",
        "cache.clearWeb", "app.reload",
        "diagnostics.snapshot", "diagnostics.clear", "image.error",
        "card.transition.prepare", "card.transition.start", "card.transition.cancel", "card.transition.release"
    )

    private val supportedFeatures = JSONArray().apply {
        listOf(
            "environment.get", "device.info", "performance.modes", "performance.autoDegrade",
            "theme.sync", "notifications.permission", "notifications.status",
            "notifications.openSettings", "system.share", "system.download",
            "system.filePicker", "navigation.events", "navigation.external",
            "lifecycle.events", "network.events", "window.adaptive",
            "cache.clearWeb", "diagnostics.snapshot", "card.transition"
        ).forEach { put(it) }
    }

    fun install() {
        val ok = runCatching {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return@runCatching false
            val allowed = trustedHosts.map { "$trustedScheme://$it" }.toSet()
            WebViewCompat.addWebMessageListener(
                webView,
                JS_OBJECT_NAME,
                allowed,
                object : WebViewCompat.WebMessageListener {
                    override fun onPostMessage(
                        view: WebView,
                        message: WebMessageCompat,
                        sourceOrigin: android.net.Uri,
                        isMainFrame: Boolean,
                        replyProxy: androidx.webkit.JavaScriptReplyProxy
                    ) {
                        if (!isMainFrame) {
                            diagnostics.record("bridge_reject_subframe")
                            return
                        }
                        if (!isTrustedOrigin(sourceOrigin)) {
                            diagnostics.record("bridge_reject_origin")
                            return
                        }
                        message.data?.let { handleRaw(it) }
                    }
                }
            )
            true
        }.getOrDefault(false)

        if (!ok) {
            runCatching { webView.addJavascriptInterface(LegacyInterface(), JS_OBJECT_NAME) }
            diagnostics.record("bridge_legacy_mode")
        } else {
            diagnostics.record("bridge_web_message_listener")
        }
    }

    private inner class LegacyInterface {
        @JavascriptInterface
        fun postMessage(raw: String) {
            handler.post {
                val current = runCatching { android.net.Uri.parse(webView.url) }.getOrNull()
                if (!isTrustedOrigin(current)) {
                    diagnostics.record("bridge_reject_origin")
                    return@post
                }
                handleRaw(raw)
            }
        }

        @JavascriptInterface
        fun version(): Int = PROTOCOL_VERSION
    }

    private fun isTrustedOrigin(uri: android.net.Uri?): Boolean {
        if (uri == null) return false
        if (!uri.userInfo.isNullOrEmpty()) return false
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme != trustedScheme) return false
        val host = uri.host?.lowercase() ?: return false
        if (trustedHosts.none { it.equals(host, ignoreCase = true) }) return false
        val port = if (uri.port > 0) uri.port else if (scheme == "https") 443 else 80
        return port == trustedPort
    }

    private fun handleRaw(raw: String) {
        if (raw.length > MAX_MESSAGE_LENGTH) {
            diagnostics.record("bridge_payload_too_large", raw.length.toLong())
            return
        }
        val obj = runCatching { JSONObject(raw) }.getOrNull()
        if (obj == null) {
            diagnostics.record("bridge_invalid_json")
            return
        }
        val version = obj.optInt("version", 1)
        val id = obj.optString("id")
        val type = obj.optString("type")

        if (!ID_PATTERN.matches(id)) {
            diagnostics.record("bridge_invalid_id")
            return
        }
        if (version < 1 || version > PROTOCOL_VERSION) {
            send(resultError(id, type, "unsupported_version"))
            return
        }
        if (type !in allowedTypes) {
            send(resultError(id, type, "unsupported_type"))
            return
        }

        completed[id]?.let { cached ->
            deliver(cached)
            return
        }
        if (!pending.add(id)) return

        val payload = obj.optJSONObject("payload") ?: JSONObject()
        runCatching { dispatch(id, type, payload) }.onFailure {
            diagnostics.record("bridge_dispatch_error")
            finish(id, type, resultError(id, type, "internal_error"))
        }
    }

    private fun dispatch(id: String, type: String, payload: JSONObject) {
        when (type) {
            "bridge.ready" -> {
                finish(id, type, resultOk(id, type, JSONObject().put("protocolVersion", PROTOCOL_VERSION)))
                callbacks.onWebReady()
            }

            "capabilities.get" -> finish(id, type, resultOk(id, type, JSONObject()
                .put("protocolVersion", PROTOCOL_VERSION)
                .put("clientType", CLIENT_TYPE)
                .put("clientVersion", BuildInfo.VERSION_NAME)
                .put("clientVersionCode", BuildInfo.VERSION_CODE)
                .put("features", supportedFeatures)))

            "environment.get" -> finish(id, type, resultOk(id, type, callbacks.onEnvironmentRequest()))

            "device.info" -> finish(id, type, resultOk(id, type, deviceInfoProvider()))

            "performance.get" -> finish(id, type, resultOk(id, type, JSONObject()
                .put("mode", LiteRuntimeState.effectiveMode.wire)
                .put("preference", LiteRuntimeState.preference.wire)
                .put("recommended", LiteRuntimeState.recommended.wire)
                .put("autoDegrade", LiteRuntimeState.autoDegrade)))

            "performance.set" -> {
                val requested = PerformanceMode.fromWire(payload.optString("mode"))
                if (requested == null) {
                    finish(id, type, resultError(id, type, "invalid_mode"))
                } else {
                    callbacks.onPerformanceChange(requested)
                    if (payload.has("autoDegrade")) {
                        callbacks.onAutoDegradeChange(payload.optBoolean("autoDegrade", true))
                    }
                    finish(id, type, resultOk(id, type, JSONObject()
                        .put("preference", LiteRuntimeState.preference.wire)
                        .put("mode", LiteRuntimeState.effectiveMode.wire)
                        .put("autoDegrade", LiteRuntimeState.autoDegrade)))
                }
            }

            "theme.get" -> finish(id, type, resultOk(id, type, JSONObject()
                .put("preference", LiteRuntimeState.themePreference.wire)
                .put("dark", LiteRuntimeState.darkActive)))

            "theme.set" -> {
                val mode = ThemeMode.fromWire(payload.optString("mode"))
                if (mode == null) {
                    finish(id, type, resultError(id, type, "invalid_mode"))
                } else {
                    callbacks.onThemeChange(mode, payload.optBoolean("dark", LiteRuntimeState.darkActive))
                    finish(id, type, resultOk(id, type, JSONObject().put("preference", mode.wire)))
                }
            }

            "page.state" -> {
                val path = payload.optString("path")
                if (!isSafePagePath(path)) {
                    finish(id, type, resultError(id, type, "invalid_path"))
                } else {
                    callbacks.onPageState(path)
                    finish(id, type, resultOk(id, type, JSONObject().put("accepted", true)))
                }
            }

            "system.back.result" -> {
                callbacks.onBackResult(id, payload.optBoolean("consumed", false))
                finish(id, type, resultOk(id, type, JSONObject().put("ack", true)))
            }

            "navigation.ack" -> {
                callbacks.onNavigationAck(id, payload.optBoolean("accepted", false))
                finish(id, type, resultOk(id, type, JSONObject().put("ack", true)))
            }

            "navigation.open.external" -> {
                val url = payload.optString("url")
                if (!isSafeHttpsUrl(url)) {
                    finish(id, type, resultError(id, type, "invalid_url"))
                } else {
                    callbacks.onOpenExternalRequest(id, url)
                    finish(id, type, resultOk(id, type, JSONObject().put("accepted", true)))
                }
            }

            "notifications.requestPermission" -> {
                callbacks.onNotificationPermissionRequest(id)
            }

            "notifications.status" -> callbacks.onNotificationStatusRequest(id)

            "notifications.openSettings" -> callbacks.onNotificationSettingsRequest(id)

            "system.share" -> {
                val safe = JSONObject()
                    .put("title", payload.optString("title").take(120))
                    .put("text", payload.optString("text").take(2000))
                    .put("url", payload.optString("url").take(1024))
                callbacks.onShareRequest(id, safe)
                finish(id, type, resultOk(id, type, JSONObject().put("opened", true)))
            }

            "system.download" -> {
                val url = payload.optString("url")
                if (!isSafeHttpsUrl(url)) {
                    finish(id, type, resultError(id, type, "invalid_url"))
                } else {
                    callbacks.onDownloadRequest(id, url, payload.optString("fileName").takeIf { it.isNotBlank() })
                }
            }

            "app.about.open" -> {
                callbacks.onAboutOpenRequest(id)
                finish(id, type, resultOk(id, type, JSONObject().put("opened", true)))
            }

            "cache.clearWeb" -> callbacks.onWebCacheClearRequest(id)

            "app.reload" -> {
                finish(id, type, resultOk(id, type, JSONObject().put("reloading", true)))
                webView.post { webView.reload() }
            }

            "diagnostics.snapshot" -> finish(id, type, resultOk(id, type, JSONObject()
                .put("events", diagnostics.recent(40))
                .put("protocolVersion", PROTOCOL_VERSION)))

            "diagnostics.clear" -> {
                diagnostics.clear()
                finish(id, type, resultOk(id, type, JSONObject().put("cleared", true)))
            }

            "image.error" -> {
                diagnostics.record("web_image_error")
                finish(id, type, resultOk(id, type, JSONObject().put("noted", true)))
            }

            "card.transition.prepare", "card.transition.start",
            "card.transition.cancel", "card.transition.release" -> {
                callbacks.onCardTransition(id, type, payload)
                finish(id, type, resultOk(id, type, JSONObject().put("ack", true)))
            }

            else -> finish(id, type, resultError(id, type, "unsupported_type"))
        }
    }

    private fun isSafeHttpsUrl(raw: String): Boolean {
        if (raw.isBlank() || raw.length > MAX_URL_LENGTH) return false
        val uri = runCatching { android.net.Uri.parse(raw) }.getOrNull() ?: return false
        if (!uri.scheme.equals("https", ignoreCase = true)) return false
        return !uri.host.isNullOrBlank()
    }

    private fun isSafePagePath(path: String): Boolean {
        if (path.isEmpty() || path.length > MAX_PATH_LENGTH) return false
        if (!path.startsWith("/")) return false
        if (path.startsWith("//")) return false
        if (path.contains('\\') || path.contains('#')) return false
        return SAFE_PATH.matches(path)
    }

    private fun resultOk(id: String, requestType: String, data: JSONObject): String =
        JSONObject()
            .put("version", PROTOCOL_VERSION)
            .put("id", id)
            .put("type", "result")
            .put("requestType", requestType)
            .put("ok", true)
            .put("data", data)
            .toString()

    private fun resultError(id: String, requestType: String, code: String): String =
        JSONObject()
            .put("version", PROTOCOL_VERSION)
            .put("id", id)
            .put("type", "result")
            .put("requestType", requestType)
            .put("ok", false)
            .put("error", JSONObject().put("code", code))
            .toString()

    private fun finish(id: String, requestType: String, message: String) {
        pending.remove(id)
        completed[id] = message
        deliver(message)
    }

    private fun send(message: String) = deliver(message)

    private fun deliver(message: String) {
        handler.post {
            val escaped = JSONObject.quote(message)
            webView.evaluateJavascript(BRIDGE_SINK_SCRIPT.replace("__PAYLOAD__", escaped), null)
        }
    }

    fun emit(event: String, payload: JSONObject) {
        deliver(JSONObject()
            .put("version", PROTOCOL_VERSION)
            .put("id", "evt-" + System.currentTimeMillis())
            .put("type", "event")
            .put("event", event)
            .put("payload", payload)
            .toString())
    }

    fun completePermissionRequest(requestId: String, granted: Boolean, enabled: Boolean) {
        finish(requestId, "notifications.requestPermission", resultOk(
            requestId, "notifications.requestPermission",
            JSONObject().put("granted", granted).put("enabled", enabled)))
    }

    fun completeStatusRequest(requestId: String, status: String) {
        finish(requestId, "notifications.status",
            resultOk(requestId, "notifications.status", JSONObject().put("status", status)))
    }

    fun completeSettingsRequest(requestId: String, opened: Boolean) {
        finish(requestId, "notifications.openSettings",
            resultOk(requestId, "notifications.openSettings", JSONObject().put("opened", opened)))
    }

    fun completeDownloadRequest(requestId: String, started: Boolean, errorCode: String? = null) {
        finish(
            requestId, "system.download",
            if (started) {
                resultOk(requestId, "system.download", JSONObject().put("started", true))
            } else {
                resultError(requestId, "system.download", errorCode ?: "download_failed")
            }
        )
    }

    fun completeCacheClear(requestId: String, ok: Boolean) {
        finish(
            requestId, "cache.clearWeb",
            if (ok) resultOk(requestId, "cache.clearWeb", JSONObject().put("cleared", true))
            else resultError(requestId, "cache.clearWeb", "clear_failed")
        )
    }

    companion object {
        const val JS_OBJECT_NAME = "HeikaNative"
        const val PROTOCOL_VERSION = 2
        const val CLIENT_TYPE = "heika-lite"
        private const val MAX_MESSAGE_LENGTH = 16 * 1024
        private const val MAX_URL_LENGTH = 2048
        private const val MAX_PATH_LENGTH = 1024
        private const val MAX_CACHED_RESULTS = 128
        private val ID_PATTERN = Regex("^[A-Za-z0-9_-]{1,80}$")
        private val SAFE_PATH = Regex("^/[A-Za-z0-9_\\-./?=&%]*$")

        /** 收到消息后统一投递到这条通道，网页端只监听事件即可，避免绑定具体实现。 */
        private const val BRIDGE_SINK_SCRIPT =
            "(function(){try{var s=__PAYLOAD__;" +
                "if(window.HeikaNativeHost&&typeof window.HeikaNativeHost.receive==='function'){window.HeikaNativeHost.receive(s);}" +
                "window.dispatchEvent(new CustomEvent('heika:native-message',{detail:s}));" +
                "}catch(e){}})();"
    }
}
