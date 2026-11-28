package com.heika.lite

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import android.net.http.SslError
import org.json.JSONObject
import java.util.UUID

class MainActivity : ComponentActivity(), LiteBridge.Callbacks {

    private val prefs by lazy { (application as HeikaLiteApp).prefs }
    private val diagnostics by lazy { (application as HeikaLiteApp).diagnostics }
    private val mainHandler = Handler(Looper.getMainLooper())

    private var root: FrameLayout? = null
    private var webView: WebView? = null
    private var bridge: LiteBridge? = null
    private var recoveryOverlay: View? = null
    private var loadingOverlay: View? = null

    private var webContentVisible = false
    private var lastSafePath: String = "/"
    private var pendingBackRequestId: String? = null
    private var backTimeout: Runnable? = null
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermissionRequestId: String? = null

    private var rendererRestartCount = 0
    private var rendererRestartWindowStart = 0L
    private var currentDownloadRequestId: String? = null

    private val trustedScheme = "https"
    private val trustedHosts = BuildConfig.WEB_APP_HOSTS.split(',').map { it.trim().lowercase() }
    private val trustedPort = 443
    private val homeUrl = BuildConfig.WEB_APP_URL

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val requestId = pendingPermissionRequestId
        pendingPermissionRequestId = null
        if (requestId != null) {
            val enabled = areNotificationsEnabled()
            bridge?.completePermissionRequest(requestId, granted, enabled)
            bridge?.emit("notifications.changed", JSONObject()
                .put("granted", granted).put("enabled", enabled))
        }
    }

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = pendingFileCallback
        pendingFileCallback = null
        if (callback == null) return@registerForActivityResult
        if (result.resultCode != Activity.RESULT_OK) {
            callback.onReceiveValue(null)
            return@registerForActivityResult
        }
        val data = result.data ?: run {
            callback.onReceiveValue(null)
            return@registerForActivityResult
        }
        val uris = collectUris(data)
        if (uris.isEmpty()) {
            callback.onReceiveValue(null)
        } else {
            uris.forEach { uri ->
                runCatching {
                    contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }
            callback.onReceiveValue(uris.toTypedArray())
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        LiteRuntimeState.restore(this)
        diagnostics.record("activity_create")

        val container = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(MATCH, MATCH)
            setBackgroundColor(backgroundColorForTheme())
        }
        root = container
        setContentView(container)
        applySystemBarPadding(container)

        registerBackCallback()
        createWebView(savedInstanceState)
        observeNetwork()
    }

    // ---------- WebView ----------

    private fun createWebView(savedInstanceState: Bundle?) {
        val container = root ?: return
        val accelerated = LiteRuntimeState.effectiveMode != PerformanceMode.ULTRA_LIGHT
        val view = LiteWebViewFactory.create(this, accelerated)
        webView = view
        webContentVisible = false

        val origin = Uri.parse(BuildConfig.WEB_APP_ORIGIN)
        val newBridge = LiteBridge(
            webView = view,
            trustedScheme = trustedScheme,
            trustedHosts = trustedHosts,
            trustedPort = trustedPort,
            diagnostics = diagnostics,
            deviceInfoProvider = { deviceSnapshot() },
            callbacks = this
        )
        bridge = newBridge
        newBridge.install()

        view.webViewClient = createWebViewClient()
        view.webChromeClient = createChromeClient()
        view.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            handleDownload(url, mimeType, contentDisposition)
        }

        container.addView(view, FrameLayout.LayoutParams(MATCH, MATCH))
        showLoadingOverlay()

        val restored = savedInstanceState != null && view.restoreState(savedInstanceState) != null
        if (!restored) {
            val target = safeStartUrl(savedInstanceState = savedInstanceState)
            view.loadUrl(target)
        } else {
            diagnostics.record("webview_state_restored")
        }
        diagnostics.record(if (accelerated) "webview_accelerated" else "webview_lite_rendering")
    }

    private fun safeStartUrl(savedInstanceState: Bundle?): String {
        val stored = prefs.lastSafeRoute
        val deepLink = intent?.data
        if (deepLink != null && isTrustedUrl(deepLink)) {
            val path = deepLink.encodedPath ?: "/"
            if (path.startsWith("/")) return homeUrl.trimEnd('/') + path + (deepLink.encodedQuery?.let { "?$it" } ?: "")
        }
        if (!stored.isNullOrBlank() && stored != "/") {
            return homeUrl.trimEnd('/') + stored
        }
        return homeUrl
    }

    private fun createWebViewClient(): WebViewClient = object : WebViewClient() {

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (isTrustedUrl(url)) return false
            // 外部链接一律交给系统浏览器，外部页面永远拿不到敏感 Bridge。
            openExternal(url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            val uri = runCatching { Uri.parse(url) }.getOrNull()
            webContentVisible = false
            if (uri != null && isTrustedUrl(uri)) {
                val path = (uri.encodedPath ?: "/") + (uri.encodedQuery?.let { "?$it" } ?: "")
                lastSafePath = path
                prefs.lastSafeRoute = path
            }
        }

        override fun onPageCommitVisible(view: WebView, url: String?) {
            webContentVisible = true
            hideLoadingOverlay()
            hideRecoveryOverlay()
            diagnostics.record("web_content_visible")
        }

        override fun onPageFinished(view: WebView, url: String?) {
            diagnostics.record("web_page_finished")
            if (!webContentVisible) hideLoadingOverlay()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) {
                diagnostics.record("web_resource_error", error.errorCode.toLong())
                return
            }
            if (error.errorCode == ERROR_HOST_LOOKUP || error.errorCode == ERROR_CONNECT ||
                error.errorCode == ERROR_TIMEOUT
            ) {
                diagnostics.record("web_main_frame_error", error.errorCode.toLong())
                showRecoveryOverlay(kind = RecoveryKind.OFFLINE)
            }
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError?) {
            // 证书错误绝不放过。
            handler.cancel()
            diagnostics.record("web_ssl_error")
            showRecoveryOverlay(kind = RecoveryKind.SECURITY)
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail?): Boolean {
            diagnostics.record("web_renderer_gone", if (detail?.didCrash() == true) 1 else 0)
            handleRendererGone(view, detail?.didCrash() == true)
            return true
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            bridge?.emit("navigation.changed", JSONObject()
                .put("canGoBack", view.canGoBack())
                .put("path", lastSafePath))
        }
    }

    private fun createChromeClient(): WebChromeClient = object : WebChromeClient() {

        override fun onShowFileChooser(
            view: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams
        ): Boolean {
            pendingFileCallback?.onReceiveValue(null)
            pendingFileCallback = callback
            val accepts = params.acceptTypes.filter { it.isNotBlank() }
            val multiple = params.mode == FileChooserParams.MODE_OPEN_MULTIPLE
            return try {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    if (accepts.isNotEmpty()) {
                        putExtra(Intent.EXTRA_MIME_TYPES, expandMimeTypes(accepts))
                    }
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                filePickerLauncher.launch(intent)
                true
            } catch (t: Throwable) {
                diagnostics.record("file_picker_failed")
                pendingFileCallback = null
                callback.onReceiveValue(null)
                false
            }
        }

        override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
            if (message.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) {
                diagnostics.record("web_console_error")
            }
            return true
        }
    }

    private fun expandMimeTypes(accepts: List<String>): Array<String> {
        val out = LinkedHashSet<String>()
        accepts.forEach { raw ->
            raw.split(',').forEach { piece ->
                val value = piece.trim().lowercase()
                if (value.isEmpty() || value.startsWith(".")) return@forEach
                when (value) {
                    "image/*" -> {
                        out.add("image/png"); out.add("image/jpeg"); out.add("image/webp")
                        out.add("image/gif"); out.add("image/heic")
                    }
                    "video/*" -> {
                        out.add("video/mp4"); out.add("video/webm"); out.add("video/quicktime")
                    }
                    "audio/*" -> {
                        out.add("audio/mpeg"); out.add("audio/mp4")
                    }
                    else -> out.add(value)
                }
            }
        }
        if (out.isEmpty()) out.add("*/*")
        return out.toTypedArray()
    }

    private fun collectUris(data: Intent): List<Uri> {
        val out = ArrayList<Uri>()
        val clip = data.clipData
        if (clip != null) {
            for (i in 0 until clip.itemCount) {
                clip.getItemAt(i).uri?.let { out.add(it) }
            }
        } else {
            data.data?.let { out.add(it) }
        }
        return out
    }

    // ---------- 返回键 ----------

    private fun registerBackCallback() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = handleBack()
        })
    }

    private fun handleBack() {
        val view = webView
        if (view == null) {
            finish()
            return
        }
        if (pendingBackRequestId != null) return

        val requestId = newId("back")
        pendingBackRequestId = requestId
        bridge?.emit("system.back", JSONObject().put("requestId", requestId))

        val timeout = Runnable {
            pendingBackRequestId?.let { id ->
                if (id == requestId) {
                    pendingBackRequestId = null
                    performNativeBack()
                }
            }
        }
        backTimeout = timeout
        mainHandler.postDelayed(timeout, BACK_GRACE_MS)
    }

    private fun performNativeBack() {
        val view = webView ?: run { finish(); return }
        if (view.canGoBack()) {
            view.goBack()
        } else if (lastSafePath != "/" && lastSafePath.isNotBlank()) {
            view.loadUrl(homeUrl)
        } else {
            finish()
        }
    }

    override fun onBackResult(requestId: String, consumed: Boolean) {
        if (pendingBackRequestId != requestId) return
        pendingBackRequestId = null
        backTimeout?.let { mainHandler.removeCallbacks(it) }
        backTimeout = null
        if (!consumed) performNativeBack()
    }

    // ---------- LiteBridge.Callbacks ----------

    override fun onWebReady() {
        diagnostics.record("bridge_ready")
        hideLoadingOverlay()
    }

    override fun onPerformanceChange(mode: PerformanceMode) {
        LiteRuntimeState.setPreference(this, mode)
        applyPerformanceModeToWebView()
        bridge?.emit("performance.changed", JSONObject()
            .put("mode", LiteRuntimeState.effectiveMode.wire)
            .put("preference", LiteRuntimeState.preference.wire))
    }

    override fun onAutoDegradeChange(enabled: Boolean) {
        LiteRuntimeState.setAutoDegrade(this, enabled)
    }

    override fun onThemeChange(mode: ThemeMode, dark: Boolean) {
        LiteRuntimeState.setTheme(this, mode, dark)
        applyTheme(dark)
    }

    override fun onNotificationPermissionRequest(requestId: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            bridge?.completePermissionRequest(requestId, areNotificationsEnabled(), areNotificationsEnabled())
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            bridge?.completePermissionRequest(requestId, true, areNotificationsEnabled())
            return
        }
        pendingPermissionRequestId = requestId
        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onNotificationStatusRequest(requestId: String) {
        val state = when {
            !areNotificationsEnabled() -> "disabled"
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED -> "denied"
            else -> "granted"
        }
        bridge?.completeStatusRequest(requestId, state)
    }

    override fun onNotificationSettingsRequest(requestId: String) {
        val opened = runCatching {
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            true
        }.getOrDefault(false)
        bridge?.completeSettingsRequest(requestId, opened)
    }

    override fun onShareRequest(requestId: String, payload: JSONObject) {
        val title = payload.optString("title", "黑卡 HEIKA Lite")
        val text = payload.optString("text")
        val url = payload.optString("url")
        val body = listOf(text, url).filter { it.isNotBlank() }.joinToString("\n")
        if (body.isBlank()) {
            bridge?.emit("share.result", JSONObject().put("requestId", requestId).put("ok", false))
            return
        }
        runCatching {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, title)
                putExtra(Intent.EXTRA_TEXT, body)
            }
            startActivity(Intent.createChooser(send, title))
        }.onFailure {
            bridge?.emit("share.result", JSONObject().put("requestId", requestId).put("ok", false))
        }
    }

    override fun onAboutOpenRequest(requestId: String) {
        bridge?.emit("app.about", JSONObject()
            .put("clientType", LiteBridge.CLIENT_TYPE)
            .put("clientVersion", BuildInfo.VERSION_NAME)
            .put("clientVersionCode", BuildInfo.VERSION_CODE.toLong())
            .put("protocolVersion", BuildInfo.PROTOCOL_VERSION.toLong())
            .put("packageName", packageName))
    }

    override fun onPageState(path: String) {
        lastSafePath = path
        prefs.lastSafeRoute = path
    }

    override fun onNavigationAck(requestId: String, accepted: Boolean) {
        // 网页已确认导航，无需额外动作。
    }

    override fun onCardTransition(requestId: String, requestType: String, payload: JSONObject) {
        // Lite 默认不承担卡片过渡的原生动画，网页侧自行处理。
        bridge?.emit("card.transition.skipped", JSONObject().put("requestId", requestId))
    }

    override fun onDownloadRequest(requestId: String, url: String, fileName: String?) {
        currentDownloadRequestId = requestId
        val ok = enqueueDownload(url, fileName, mimeType = null)
        currentDownloadRequestId = null
        bridge?.completeDownloadRequest(requestId, ok, if (ok) null else "download_failed")
    }

    override fun onWebCacheClearRequest(requestId: String) {
        val view = webView
        if (view == null) {
            bridge?.completeCacheClear(requestId, false)
            return
        }
        LiteWebViewFactory.clearWebCache(view, clearStorage = false) { ok ->
            bridge?.completeCacheClear(requestId, ok)
        }
    }

    override fun onOpenExternalRequest(requestId: String, url: String) {
        val uri = runCatching { Uri.parse(url) }.getOrNull()
        if (uri != null) openExternal(uri)
    }

    override fun onEnvironmentRequest(): JSONObject {
        val metrics = currentWindowMetrics()
        return LiteRuntimeState.environment(this, metrics.first, metrics.second, resources.displayMetrics.density)
    }

    // ---------- 下载 ----------

    private fun handleDownload(url: String, mimeType: String?, contentDisposition: String?) {
        val name = parseFileName(contentDisposition) ?: parseFileName(url)
        val ok = enqueueDownload(url, name, mimeType)
        bridge?.emit("download.result", JSONObject().put("ok", ok).put("url", url.take(2048)))
    }

    private fun enqueueDownload(url: String, fileName: String?, mimeType: String?): Boolean {
        if (!url.startsWith("https://")) {
            diagnostics.record("download_reject_scheme")
            return false
        }
        return runCatching {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setTitle(fileName ?: "黑卡下载")
                setAllowedOverMetered(true)
                setAllowedOverRoaming(false)
                if (!mimeType.isNullOrBlank()) setMimeType(mimeType)
            }
            val cookie = CookieManager.getInstance().getCookie(url)
            if (!cookie.isNullOrBlank()) request.addRequestHeader("Cookie", cookie)
            val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.enqueue(request)
            diagnostics.record("download_enqueued")
            true
        }.getOrElse {
            diagnostics.record("download_failed")
            false
        }
    }

    private fun parseFileName(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val patterns = listOf(
            Regex("filename\\*=UTF-8''([^;]+)", RegexOption.IGNORE_CASE),
            Regex("filename=\"?([^\";]+)\"?", RegexOption.IGNORE_CASE)
        )
        patterns.forEach { regex ->
            val match = regex.find(raw) ?: return@forEach
            val value = runCatching { Uri.decode(match.groupValues[1].trim()) }.getOrNull()
            if (!value.isNullOrBlank() && !value.contains('/') && !value.contains('\\')) return value
        }
        val last = raw.substringAfterLast('/', "").substringBefore('?').trim()
        return last.ifBlank { "heika-download" }.take(120)
    }

    // ---------- 外部跳转 ----------

    private fun openExternal(uri: Uri) {
        val scheme = uri.scheme?.lowercase()
        if (scheme != "https" && scheme != "http") return
        runCatching {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }.onFailure {
            if (it is ActivityNotFoundException) {
                Toast.makeText(this, "没有可打开该链接的应用", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun isTrustedUrl(uri: Uri): Boolean {
        if (!uri.scheme.equals(trustedScheme, ignoreCase = true)) return false
        val host = uri.host?.lowercase() ?: return false
        if (trustedHosts.none { it == host }) return false
        val port = if (uri.port > 0) uri.port else 443
        return port == trustedPort
    }

    // ---------- 渲染进程异常 ----------

    private fun handleRendererGone(view: WebView, didCrash: Boolean) {
        val now = SystemClock.elapsedRealtime()
        if (now - rendererRestartWindowStart > RENDERER_WINDOW_MS) {
            rendererRestartWindowStart = now
            rendererRestartCount = 0
        }
        rendererRestartCount += 1

        runCatching { (view.parent as? ViewGroup)?.removeView(view) }
        runCatching { view.destroy() }
        webView = null
        bridge = null

        if (rendererRestartCount > MAX_RENDERER_RESTARTS) {
            showRecoveryOverlay(kind = RecoveryKind.RENDERER)
            return
        }
        // 低内存设备遭遇渲染进程回收时，主动降到极致轻量再重建。
        if (LiteRuntimeState.effectiveMode != PerformanceMode.ULTRA_LIGHT) {
            LiteRuntimeState.applyDegrade(PerformanceMode.ULTRA_LIGHT)
        }
        diagnostics.record("webview_recreated", rendererRestartCount.toLong())
        createWebView(null)
        showRecoveryOverlay(kind = RecoveryKind.RENDERER)
    }

    // ---------- 主题与系统栏 ----------

    private fun backgroundColorForTheme(): Int =
        if (LiteRuntimeState.darkActive) Color.parseColor("#0D1012") else Color.parseColor("#F7F5F1")

    private fun applyTheme(dark: Boolean) {
        root?.setBackgroundColor(backgroundColorForTheme())
        val barColor = backgroundColorForTheme()
        window.statusBarColor = barColor
        window.navigationBarColor = barColor
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = !dark
        controller.isAppearanceLightNavigationBars = !dark
    }

    private fun applyPerformanceModeToWebView() {
        val view = webView ?: return
        val accelerated = LiteRuntimeState.effectiveMode != PerformanceMode.ULTRA_LIGHT
        runCatching { view.setLayerType(if (accelerated) View.LAYER_TYPE_HARDWARE else View.LAYER_TYPE_NONE, null) }
    }

    private fun applySystemBarPadding(container: FrameLayout) {
        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(container)
    }

    // ---------- 覆盖层 ----------

    private fun showLoadingOverlay() {
        val container = root ?: return
        if (loadingOverlay != null) return
        val overlay = FrameLayout(this).apply {
            setBackgroundColor(backgroundColorForTheme())
            layoutParams = FrameLayout.LayoutParams(MATCH, MATCH)
        }
        val label = TextView(this).apply {
            text = getString(R.string.loading)
            setTextColor(if (LiteRuntimeState.darkActive) Color.parseColor("#E8E3DA") else Color.parseColor("#3A3A3A"))
            textSize = 14f
            gravity = Gravity.CENTER
        }
        overlay.addView(label, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.CENTER })
        container.addView(overlay)
        loadingOverlay = overlay
    }

    private fun hideLoadingOverlay() {
        val overlay = loadingOverlay ?: return
        runCatching { (overlay.parent as? ViewGroup)?.removeView(overlay) }
        loadingOverlay = null
    }

    private enum class RecoveryKind { OFFLINE, RENDERER, SECURITY }

    private fun showRecoveryOverlay(kind: RecoveryKind) {
        val container = root ?: return
        hideLoadingOverlay()
        hideRecoveryOverlay()

        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            setBackgroundColor(backgroundColorForTheme())
        }
        val title = TextView(this).apply {
            text = when (kind) {
                RecoveryKind.OFFLINE -> getString(R.string.offline_title)
                RecoveryKind.RENDERER -> getString(R.string.renderer_failed_title)
                RecoveryKind.SECURITY -> "页面安全校验失败"
            }
            textSize = 18f
            gravity = Gravity.CENTER
            setTextColor(if (LiteRuntimeState.darkActive) Color.parseColor("#E8E3DA") else Color.parseColor("#1F1F1F"))
        }
        val desc = TextView(this).apply {
            text = when (kind) {
                RecoveryKind.OFFLINE -> getString(R.string.offline_desc)
                RecoveryKind.RENDERER -> getString(R.string.renderer_failed_desc)
                RecoveryKind.SECURITY -> "服务器证书不受信任，已阻止继续加载以保护账号安全。"
            }
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 32)
            setTextColor(if (LiteRuntimeState.darkActive) Color.parseColor("#B9B3A8") else Color.parseColor("#5A5A5A"))
        }
        panel.addView(title, LinearLayout.LayoutParams(MATCH, WRAP))
        panel.addView(desc, LinearLayout.LayoutParams(MATCH, WRAP))

        panel.addView(actionButton(getString(R.string.retry)) {
            hideRecoveryOverlay()
            showLoadingOverlay()
            webView?.reload() ?: run {
                createWebView(null)
            }
        })
        if (LiteRuntimeState.effectiveMode != PerformanceMode.ULTRA_LIGHT) {
            panel.addView(actionButton(getString(R.string.switch_lite)) {
                LiteRuntimeState.setPreference(this, PerformanceMode.ULTRA_LIGHT)
                hideRecoveryOverlay()
                recreateWebViewForMode()
            })
        }
        panel.addView(actionButton(getString(R.string.clear_cache)) {
            webView?.let { LiteWebViewFactory.clearWebCache(it, clearStorage = false) { _ -> } }
            hideRecoveryOverlay()
            showLoadingOverlay()
            webView?.reload() ?: createWebView(null)
        })

        container.addView(panel, FrameLayout.LayoutParams(MATCH, MATCH))
        recoveryOverlay = panel
    }

    private fun actionButton(label: String, onClick: () -> Unit): Button =
        Button(this).apply {
            text = label
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(WRAP, WRAP).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                topMargin = 24
            }
        }

    private fun hideRecoveryOverlay() {
        val overlay = recoveryOverlay ?: return
        runCatching { (overlay.parent as? ViewGroup)?.removeView(overlay) }
        recoveryOverlay = null
    }

    private fun recreateWebViewForMode() {
        val old = webView
        if (old != null) {
            runCatching { (old.parent as? ViewGroup)?.removeView(old) }
            runCatching { old.destroy() }
        }
        webView = null
        bridge = null
        createWebView(null)
    }

    // ---------- 网络监听 ----------

    private fun observeNetwork() {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return
        runCatching {
            manager.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = reportNetwork(true)
                override fun onLost(network: Network) = reportNetwork(false)
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    val metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                    bridge?.emit("network.metered", JSONObject().put("metered", metered))
                }
            })
        }
    }

    private fun reportNetwork(online: Boolean) {
        bridge?.emit("network.change", JSONObject().put("online", online))
        if (online && recoveryOverlay != null) {
            diagnostics.record("network_restored")
        }
    }

    // ---------- 生命周期 ----------

    override fun onResume() {
        super.onResume()
        webView?.onResume()
        webView?.resumeTimers()
        bridge?.emit("lifecycle.change", JSONObject().put("state", "resumed"))
    }

    override fun onPause() {
        webView?.onPause()
        webView?.pauseTimers()
        bridge?.emit("lifecycle.change", JSONObject().put("state", "paused"))
        super.onPause()
    }

    override fun onStart() {
        super.onStart()
        applyTheme(LiteRuntimeState.darkActive)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView?.saveState(outState)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val metrics = currentWindowMetrics()
        val dark = LiteRuntimeState.darkActive
        applyTheme(dark)
        bridge?.emit(
            "window.change",
            JSONObject()
                .put("widthDp", metrics.first)
                .put("heightDp", metrics.second)
                .put("windowClass", LiteRuntimeState.windowClass(metrics.first))
                .put("density", resources.displayMetrics.density.toDouble())
        )
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        diagnostics.record("trim_memory", level.toLong())
        if (!LiteRuntimeState.autoDegrade) return
        when {
            level >= android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> {
                LiteRuntimeState.applyDegrade(PerformanceMode.ULTRA_LIGHT)
                bridge?.emit("performance.degraded", JSONObject()
                    .put("mode", LiteRuntimeState.effectiveMode.wire)
                    .put("reason", "memory_critical"))
            }
            level >= android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> {
                if (LiteRuntimeState.effectiveMode == PerformanceMode.FULL) {
                    LiteRuntimeState.applyDegrade(PerformanceMode.BALANCED)
                    bridge?.emit("performance.degraded", JSONObject()
                        .put("mode", LiteRuntimeState.effectiveMode.wire)
                        .put("reason", "memory_low"))
                }
            }
        }
    }

    override fun onDestroy() {
        hideLoadingOverlay()
        hideRecoveryOverlay()
        val view = webView
        webView = null
        bridge = null
        if (view != null) {
            runCatching { (view.parent as? ViewGroup)?.removeView(view) }
            runCatching {
                view.stopLoading()
                view.webChromeClient = null
                view.webViewClient = WebViewClient()
                view.destroy()
            }
        }
        diagnostics.record("activity_destroy")
        super.onDestroy()
    }

    // ---------- 工具 ----------

    private fun areNotificationsEnabled(): Boolean =
        androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled()

    private fun currentWindowMetrics(): Pair<Int, Int> {
        val metrics = resources.displayMetrics
        val density = if (metrics.density <= 0f) 1f else metrics.density
        val widthDp = (metrics.widthPixels / density).toInt()
        val heightDp = (metrics.heightPixels / density).toInt()
        return widthDp to heightDp
    }

    private fun deviceSnapshot(): JSONObject {
        val metrics = currentWindowMetrics()
        return DeviceProfile.snapshot(this, metrics.first, metrics.second, resources.displayMetrics.density)
    }

    private fun newId(prefix: String): String =
        prefix + "-" + UUID.randomUUID().toString().replace("-", "").take(16)

    private companion object {
        const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
        const val BACK_GRACE_MS = 350L
        const val RENDERER_WINDOW_MS = 60_000L
        const val MAX_RENDERER_RESTARTS = 3
    }
}
