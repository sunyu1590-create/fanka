package com.heika.android

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.FrameMetrics
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.webkit.ConsoleMessage
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.provider.Settings
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import java.util.ArrayDeque
import java.util.LinkedHashSet
import java.util.UUID
import kotlin.math.max

class MainActivity : androidx.activity.ComponentActivity() {
    private val diagnostics get() = (application as HeikaApplication).diagnostics
    private val trustedOrigin = BuildConfig.WEB_APP_ORIGIN.toUri()
    private val trustedOrigins = BuildConfig.WEB_APP_HOSTS.split(',')
        .mapNotNull { host -> runCatching { Uri.Builder().scheme("https").authority(host.trim()).build() }.getOrNull() }
        .toSet()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var root: FrameLayout? = null
    private var webView: WebView? = null
    private var bridge: NativeBridge? = null
    private var cardTransition: NativeCardTransition? = null
    private var bridgeSupported = false
    private var webContentCommitted = false
    private var overlay: View? = null
    private var lastSafeRoute = BuildConfig.WEB_APP_URL
    private var rendererRestartWindow = 0L
    private var rendererRestartCount = 0
    private var pendingPermissionRequest: String? = null
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null
    private var backRequestId: String? = null
    private var backTimeout: Runnable? = null
    private val navigationQueue = ArrayDeque<PendingNavigation>()
    private val seenNavigationIds = LinkedHashSet<String>()
    private var inFlightNavigationId: String? = null
    private var lastDeliveredRoute: String? = null
    private var navigationTimeout: Runnable? = null
    private var lastBackAt = 0L
    private var loadTimeout: Runnable? = null
    private var bridgeFallbackTimeout: Runnable? = null
    private var recoveringFromUntrustedNavigation = false
    private var frameMetricsListener: Window.OnFrameMetricsAvailableListener? = null

    private data class PendingNavigation(val id: String, val route: String)

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val requestId = pendingPermissionRequest
        pendingPermissionRequest = null
        if (requestId != null) {
            bridge?.replyPermission(
                requestId,
                granted,
                granted && NotificationManagerCompat.from(this).areNotificationsEnabled(),
            )
        }
    }

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val data = result.data
        val selected = if (result.resultCode == Activity.RESULT_OK && data != null) {
            val clip = data.clipData
            when {
                clip != null -> Array(clip.itemCount) { index -> clip.getItemAt(index).uri }
                data.data != null -> arrayOf(data.data!!)
                else -> null
            }
        } else null
        deliverPickedFiles(selected)
    }

    private val singlePhotoPickerLauncher = registerForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri -> deliverPickedFiles(uri?.let { arrayOf(it) }) }

    private val multiPhotoPickerLauncher = registerForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(9),
    ) { uris -> deliverPickedFiles(uris.takeIf { it.isNotEmpty() }?.toTypedArray()) }

    private fun deliverPickedFiles(uris: Array<Uri>?) {
        val callback = pendingFileCallback
        pendingFileCallback = null
        callback?.onReceiveValue(uris)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        val container = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(13, 16, 18))
            ViewCompat.setOnApplyWindowInsetsListener(this) { view, insets ->
                val safe = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
                )
                val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
                view.setPadding(safe.left, safe.top, safe.right, max(safe.bottom, keyboard.bottom))
                WindowInsetsCompat.CONSUMED
            }
        }
        root = container
        setContentView(container)
        ViewCompat.requestApplyInsets(container)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = dispatchSystemBack()
        })

        restorePendingNavigations(savedInstanceState)
        val deepLink = routeFromIntent(intent)
        if (deepLink != null) queueNavigation(deepLink.first, deepLink.second)
        createWebView(savedInstanceState?.getBundle(WEB_VIEW_STATE_KEY), BuildConfig.WEB_APP_URL)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        routeFromIntent(intent)?.let { (route, id) -> queueNavigation(route, id) }
    }

    override fun onResume() {
        super.onResume()
        startFrameMetrics()
        webView?.onResume()
        bridge?.sendEvent("app.lifecycle", JSONObject().put("state", "foreground"))
    }

    override fun onPause() {
        stopFrameMetrics()
        bridge?.sendEvent("app.lifecycle", JSONObject().put("state", "background"))
        cardTransition?.clearAll()
        webView?.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView?.let { view ->
            val state = Bundle()
            view.saveState(state)
            outState.putBundle(WEB_VIEW_STATE_KEY, state)
        }
        val ids = ArrayList<String>()
        val routes = ArrayList<String>()
        inFlightNavigationId?.let { id ->
            lastDeliveredRoute?.let { route ->
                ids.add(id)
                routes.add(route)
            }
        }
        navigationQueue.forEach { navigation ->
            ids.add(navigation.id)
            routes.add(navigation.route)
        }
        outState.putStringArrayList(NAVIGATION_IDS_KEY, ids)
        outState.putStringArrayList(NAVIGATION_ROUTES_KEY, routes)
        outState.putStringArrayList(SEEN_NAVIGATION_IDS_KEY, ArrayList(seenNavigationIds))
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        stopFrameMetrics()
        cardTransition?.clearAll()
        cardTransition = null
        loadTimeout?.let(mainHandler::removeCallbacks)
        cancelBridgeFallbackTimeout()
        backTimeout?.let(mainHandler::removeCallbacks)
        navigationTimeout?.let(mainHandler::removeCallbacks)
        pendingFileCallback?.onReceiveValue(null)
        pendingFileCallback = null
        releaseWebView()
        root = null
        super.onDestroy()
    }

    private fun startFrameMetrics() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || frameMetricsListener != null) return
        val refreshRate = window.decorView.display?.refreshRate ?: 60f
        val listener = Window.OnFrameMetricsAvailableListener { _, metrics, droppedReports ->
            diagnostics.recordFrameSample(
                metrics.getMetric(FrameMetrics.TOTAL_DURATION),
                refreshRate,
                droppedReports,
            )
        }
        frameMetricsListener = listener
        window.addOnFrameMetricsAvailableListener(listener, mainHandler)
    }

    private fun stopFrameMetrics() {
        frameMetricsListener?.let(window::removeOnFrameMetricsAvailableListener)
        frameMetricsListener = null
    }

    private fun createWebView(restoredState: Bundle?, firstUrl: String) {
        val container = root ?: return
        val view = WebViewCore.create(this)
        webView = view
        container.addView(view, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        ))

        cardTransition = NativeCardTransition(this, container, view, diagnostics) { id, completed ->
            bridge?.sendEvent(
                "card.transition.finished",
                JSONObject().put("transactionId", id).put("completed", completed),
            )
        }

        val nativeBridge = NativeBridge(view, trustedOrigin, trustedOrigins, diagnostics, object : NativeBridge.Callbacks {
            override fun onWebReady() {
                diagnostics.recordFirstInteractive()
                cancelLoadTimeout()
                cancelBridgeFallbackTimeout()
                if (overlay?.tag == LOADING_MASK_TAG) dismissLoadingMask() else clearOverlay()
                bridge?.sendEvent("app.lifecycle", JSONObject().put("state", "foreground"))
                dispatchNextNavigation()
            }

            override fun onPermissionRequest(requestId: String) = requestNotificationPermission(requestId)

            override fun onNotificationStatusRequest(requestId: String) {
                val permissionState = notificationPermissionState()
                val enabled = NotificationManagerCompat.from(this@MainActivity).areNotificationsEnabled()
                bridge?.completeRequest(
                    requestId,
                    "notifications.status",
                    true,
                    JSONObject()
                        .put("granted", permissionState == "granted")
                        .put("enabled", enabled)
                        .put("permission", permissionState),
                )
            }

            override fun onNotificationSettingsRequest(requestId: String) {
                val opened = openNotificationSettings()
                bridge?.completeRequest(
                    requestId,
                    "notifications.openSettings",
                    true,
                    JSONObject().put("opened", opened),
                )
            }

            override fun onSystemShareRequest(requestId: String, payload: JSONObject) {
                shareFromNative(requestId, payload)
            }

            override fun onPageState(path: String) {
                lastSafeRoute = BuildConfig.WEB_APP_URL.trimEnd('/') + path
            }

            override fun onBackResult(requestId: String, consumed: Boolean) {
                if (backRequestId != requestId) return
                backTimeout?.let(mainHandler::removeCallbacks)
                backTimeout = null
                backRequestId = null
                if (!consumed) fallbackBack()
            }

            override fun onNavigationAck(requestId: String, accepted: Boolean) {
                if (inFlightNavigationId != requestId) return
                if (!accepted) diagnostics.record("navigation_rejected")
                else lastDeliveredRoute?.let { route ->
                    lastSafeRoute = BuildConfig.WEB_APP_URL.trimEnd('/') + route
                }
                navigationTimeout?.let(mainHandler::removeCallbacks)
                navigationTimeout = null
                inFlightNavigationId = null
                lastDeliveredRoute = null
                dispatchNextNavigation()
            }

            override fun onCardTransitionRequest(requestId: String, requestType: String, payload: JSONObject) {
                val transactionId = payload.optString("transactionId")
                when (requestType) {
                    "card.transition.prepare" -> {
                        val rect = payload.optJSONObject("rect")
                        if (rect == null) {
                            bridge?.completeRequest(requestId, requestType, false, JSONObject().put("code", "invalid_rect"))
                        } else {
                            cardTransition?.prepare(transactionId, rect, payload.optDouble("devicePixelRatio", Double.NaN)) { prepared ->
                                bridge?.completeRequest(
                                    requestId,
                                    requestType,
                                    true,
                                    JSONObject().put("prepared", prepared),
                                )
                            } ?: bridge?.completeRequest(requestId, requestType, true, JSONObject().put("prepared", false))
                        }
                    }
                    "card.transition.start" -> {
                        val target = payload.optJSONObject("targetRect")
                        val accepted = target != null && cardTransition?.start(
                            transactionId,
                            payload.optString("direction"),
                            target,
                            payload.optLong("durationMs", 360L),
                        ) == true
                        bridge?.completeRequest(requestId, requestType, true, JSONObject().put("accepted", accepted))
                    }
                    "card.transition.cancel" -> {
                        cardTransition?.cancel(transactionId)
                        bridge?.completeRequest(requestId, requestType, true)
                    }
                    "card.transition.release" -> {
                        cardTransition?.release(transactionId)
                        bridge?.completeRequest(requestId, requestType, true)
                    }
                }
            }
        })
        bridge = nativeBridge
        bridgeSupported = nativeBridge.install()
        if (!bridgeSupported) diagnostics.record("bridge_unavailable")

        view.webViewClient = object : WebViewClient() {
            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                super.doUpdateVisitedHistory(view, url, isReload)
                safeRoute(url.toUri())?.let { lastSafeRoute = it }
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val uri = request.url
                if (isTrustedUrl(uri)) return false
                openExternal(uri)
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                webContentCommitted = false
                cardTransition?.clearAll()
                bridge?.onPageStarted()
                val uri = url.toUri()
                if (!isTrustedUrl(uri)) {
                    diagnostics.record("web_untrusted_main_navigation")
                    if (!recoveringFromUntrustedNavigation) {
                        recoveringFromUntrustedNavigation = true
                        cancelLoadTimeout()
                        lastSafeRoute = BuildConfig.WEB_APP_URL
                        view.stopLoading()
                        view.loadUrl(lastSafeRoute)
                    }
                    return
                }
                diagnostics.record("web_navigation_start_${uri.host?.lowercase()?.replace(Regex("[^a-z0-9.-]"), "_") ?: "unknown"}")
                cancelLoadTimeout()
                cancelBridgeFallbackTimeout()
                showLoading()
                loadTimeout = Runnable {
                    diagnostics.record("web_load_timeout")
                    showLoadError()
                }.also { mainHandler.postDelayed(it, LOAD_TIMEOUT_MS) }
                lastSafeRoute = safeRoute(uri) ?: BuildConfig.WEB_APP_URL
            }

            override fun onPageCommitVisible(view: WebView, url: String) {
                super.onPageCommitVisible(view, url)
                if (!isTrustedUrl(url.toUri())) return
                webContentCommitted = true
                diagnostics.recordFirstContentVisible()
                val committedHost = url.toUri().host?.lowercase() ?: "unknown"
                diagnostics.record("web_page_committed_$committedHost")
                recoveringFromUntrustedNavigation = false
                if (!bridgeSupported) {
                    cancelLoadTimeout()
                    dismissLoadingMask()
                    dispatchNextNavigation()
                } else if (bridge?.isReady() != true) {
                    cancelBridgeFallbackTimeout()
                    bridgeFallbackTimeout = Runnable {
                        bridgeFallbackTimeout = null
                        if (webContentCommitted && bridge?.isReady() != true) {
                            diagnostics.record("web_bridge_ready_timeout")
                            cancelLoadTimeout()
                            dismissLoadingMask()
                            dispatchNextNavigation()
                        }
                    }.also { mainHandler.postDelayed(it, BRIDGE_READY_TIMEOUT_MS) }
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                super.onReceivedError(view, request, error)
                diagnostics.recordResourceFailure()
                if (recoveringFromUntrustedNavigation && !isTrustedUrl(request.url)) return
                if (request.isForMainFrame) {
                    diagnostics.record("web_main_frame_error", error.errorCode.toLong())
                    showLoadError()
                }
            }

            override fun onReceivedHttpError(
                view: WebView,
                request: WebResourceRequest,
                errorResponse: android.webkit.WebResourceResponse,
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                if (recoveringFromUntrustedNavigation && !isTrustedUrl(request.url)) return
                if (request.isForMainFrame && errorResponse.statusCode >= 400) {
                    diagnostics.record("web_main_frame_http_error", errorResponse.statusCode.toLong())
                    showLoadError()
                }
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
                diagnostics.record("web_ssl_error")
                handler.cancel()
                showLoadError()
            }

            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                diagnostics.recordRendererExit(detail.didCrash())
                cancelLoadTimeout()
                if (view !== webView) {
                    (view.parent as? ViewGroup)?.removeView(view)
                    view.destroy()
                    return true
                }
                lastSafeRoute = safeRoute(view.url?.toUri()) ?: lastSafeRoute
                cardTransition?.clearAll()
                detachRendererLostWebView(view)
                val now = SystemClock.elapsedRealtime()
                if (now - rendererRestartWindow > RENDERER_RESTART_WINDOW_MS) {
                    rendererRestartWindow = now
                    rendererRestartCount = 0
                }
                rendererRestartCount += 1
                if (rendererRestartCount > MAX_AUTOMATIC_RENDERER_RESTARTS) {
                    showLoadError()
                } else {
                    diagnostics.record("web_renderer_restarting", rendererRestartCount.toLong())
                    createWebView(null, lastSafeRoute)
                }
                return true
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: WebChromeClient.FileChooserParams,
            ): Boolean {
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = filePathCallback
                val multiple = fileChooserParams.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
                val accepted = fileChooserParams.acceptTypes
                    .flatMap { it.split(',') }
                    .map { it.trim().lowercase() }
                    .filter { it.isNotEmpty() }
                val imageOnly = accepted.isNotEmpty() && accepted.all { it.startsWith("image/") }
                val videoOnly = accepted.isNotEmpty() && accepted.all { it.startsWith("video/") }
                val imageOrVideo = accepted.isNotEmpty() && accepted.all { it.startsWith("image/") || it.startsWith("video/") }
                if (imageOnly || videoOnly || imageOrVideo) {
                    val mediaType = when {
                        imageOnly -> ActivityResultContracts.PickVisualMedia.ImageOnly
                        videoOnly -> ActivityResultContracts.PickVisualMedia.VideoOnly
                        else -> ActivityResultContracts.PickVisualMedia.ImageAndVideo
                    }
                    return try {
                        val request = PickVisualMediaRequest(mediaType)
                        if (multiple) multiPhotoPickerLauncher.launch(request)
                        else singlePhotoPickerLauncher.launch(request)
                        true
                    } catch (_: Exception) {
                        launchDocumentPicker(multiple)
                    }
                }
                return launchDocumentPicker(multiple)
            }

            private fun launchDocumentPicker(multiple: Boolean): Boolean {
                val picker = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "video/*"))
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
                }
                return try {
                    filePickerLauncher.launch(picker)
                    true
                } catch (_: ActivityNotFoundException) {
                    pendingFileCallback?.onReceiveValue(null)
                    pendingFileCallback = null
                    Toast.makeText(this@MainActivity, "没有可用的文件选择器", Toast.LENGTH_SHORT).show()
                    false
                }
            }

            override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
                diagnostics.record("web_permission_denied")
                request.deny()
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                if (consoleMessage.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    diagnostics.record("web_console_error")
                }
                return true
            }
        }

        lastSafeRoute = safeRoute(firstUrl.toUri()) ?: BuildConfig.WEB_APP_URL
        showLoading()
        val restored = restoredState != null && view.restoreState(restoredState) != null
        if (restored) {
            val restoredRoute = safeRoute(view.url?.toUri())
            if (restoredRoute != null) {
                lastSafeRoute = restoredRoute
            } else {
                diagnostics.record("web_state_restore_rejected")
                recoveringFromUntrustedNavigation = true
                lastSafeRoute = BuildConfig.WEB_APP_URL
                view.stopLoading()
                view.clearHistory()
                view.loadUrl(lastSafeRoute)
            }
        } else {
            view.loadUrl(lastSafeRoute)
        }
    }

    private fun releaseWebView() {
        val view = webView ?: return
        cardTransition?.clearAll()
        cardTransition = null
        bridge?.dispose()
        bridge = null
        cancelLoadTimeout()
        view.stopLoading()
        view.webChromeClient = null
        view.webViewClient = WebViewClient()
        (view.parent as? ViewGroup)?.removeView(view)
        view.removeAllViews()
        view.destroy()
        webView = null
    }

    private fun detachRendererLostWebView(view: WebView) {
        bridge?.dispose()
        bridge = null
        (view.parent as? ViewGroup)?.removeView(view)
        view.destroy()
        if (webView === view) webView = null
        pendingFileCallback?.onReceiveValue(null)
        pendingFileCallback = null
    }

    private fun requestNotificationPermission(requestId: String) {
        val enabled = NotificationManagerCompat.from(this).areNotificationsEnabled()
        if (pendingPermissionRequest != null) {
            bridge?.failRequest(requestId, "notifications.requestPermission", "permission_request_in_progress")
            return
        }
        when (notificationPermissionState()) {
            "granted" -> {
                bridge?.replyPermission(requestId, true, enabled)
                return
            }
            "denied" -> {
                bridge?.replyPermission(requestId, false, enabled)
                return
            }
        }
        pendingPermissionRequest = requestId
        getSharedPreferences(NOTIFICATION_PREFS, MODE_PRIVATE)
            .edit()
            .putBoolean(NOTIFICATION_PERMISSION_ASKED, true)
            .apply()
        try {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } catch (_: Exception) {
            pendingPermissionRequest = null
            bridge?.failRequest(requestId, "notifications.requestPermission", "permission_dialog_unavailable")
        }
    }

    private fun notificationPermissionState(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) return "granted"
        return if (getSharedPreferences(NOTIFICATION_PREFS, MODE_PRIVATE)
                .getBoolean(NOTIFICATION_PERMISSION_ASKED, false)
        ) "denied" else "default"
    }

    private fun openNotificationSettings(): Boolean = try {
        startActivity(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
        )
        true
    } catch (_: ActivityNotFoundException) {
        runCatching {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
            true
        }.getOrDefault(false)
    }

    private fun shareFromNative(requestId: String, payload: JSONObject) {
        val rawUrl = payload.optString("url")
        val uri = runCatching { rawUrl.toUri() }.getOrNull()
        if (uri == null || !isTrustedUrl(uri) || safeRoute(uri) == null) {
            bridge?.completeRequest(
                requestId,
                "system.share",
                false,
                JSONObject().put("code", "invalid_share_url"),
            )
            return
        }
        val cleanTitle = payload.optString("title", "黑卡 HEIKA")
            .filterNot(Char::isISOControl)
            .trim()
            .take(120)
            .ifEmpty { "黑卡 HEIKA" }
        val cleanText = payload.optString("text")
            .filterNot(Char::isISOControl)
            .trim()
            .take(2_000)
        val shareText = listOf(cleanText, uri.toString()).filter(String::isNotEmpty).joinToString("\n")
        try {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TITLE, cleanTitle)
                putExtra(Intent.EXTRA_TEXT, shareText)
            }
            startActivity(Intent.createChooser(intent, "分享黑卡内容"))
            bridge?.completeRequest(
                requestId,
                "system.share",
                true,
                JSONObject().put("shared", true),
            )
        } catch (_: ActivityNotFoundException) {
            bridge?.completeRequest(
                requestId,
                "system.share",
                false,
                JSONObject().put("code", "share_unavailable"),
            )
        }
    }

    private fun dispatchSystemBack() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastBackAt < BACK_DEBOUNCE_MS || backRequestId != null) return
        lastBackAt = now
        val id = UUID.randomUUID().toString()
        backRequestId = id
        val sent = bridge?.sendEvent("system.back", JSONObject().put("requestId", id)) == true
        if (!sent) {
            backRequestId = null
            fallbackBack()
            return
        }
        backTimeout = Runnable {
            if (backRequestId == id) {
                backRequestId = null
                backTimeout = null
                fallbackBack()
            }
        }.also { mainHandler.postDelayed(it, BACK_RESPONSE_TIMEOUT_MS) }
    }

    private fun fallbackBack() {
        val view = webView ?: run { finish(); return }
        view.evaluateJavascript(
            "window.history.state&&window.history.state.heikaDetail?'detail':'none'",
        ) { result ->
            if (isFinishing || webView !== view) return@evaluateJavascript
            if (result == "\"detail\"") {
                view.evaluateJavascript("window.history.back()", null)
            } else if (view.canGoBack()) {
                view.goBack()
            } else {
                finish()
            }
        }
    }

    private fun queueNavigation(route: String, messageId: String) {
        val safeRoute = normalizeBusinessRoute(route) ?: return
        val stableId = messageId.takeIf { MESSAGE_ID.matches(it) } ?: safeRoute.hashCode().toUInt().toString()
        if (!seenNavigationIds.add(stableId)) return
        while (seenNavigationIds.size > MAX_SEEN_NAVIGATION_IDS) {
            seenNavigationIds.remove(seenNavigationIds.first())
        }
        if (navigationQueue.size >= MAX_PENDING_NAVIGATIONS) navigationQueue.removeFirst()
        navigationQueue.addLast(PendingNavigation(stableId, safeRoute))
        dispatchNextNavigation()
    }

    private fun dispatchNextNavigation() {
        if (inFlightNavigationId != null || navigationQueue.isEmpty()) return
        val next = navigationQueue.first()
        if (!bridgeSupported) {
            if (!webContentCommitted) return
            val view = webView ?: return
            navigationQueue.removeFirst()
            webContentCommitted = false
            lastSafeRoute = BuildConfig.WEB_APP_ORIGIN.trimEnd('/') + next.route
            diagnostics.record("navigation_direct_route")
            view.loadUrl(lastSafeRoute)
            return
        }
        val sent = bridge?.sendEvent(
            "navigation.open",
            JSONObject().put("requestId", next.id).put("route", next.route),
        ) == true
        if (!sent) return
        navigationQueue.removeFirst()
        inFlightNavigationId = next.id
        lastDeliveredRoute = next.route
        navigationTimeout = Runnable {
            if (inFlightNavigationId == next.id) {
                diagnostics.record("navigation_ack_timeout")
                inFlightNavigationId = null
                lastDeliveredRoute = null
                navigationTimeout = null
                dispatchNextNavigation()
            }
        }.also { mainHandler.postDelayed(it, NAVIGATION_ACK_TIMEOUT_MS) }
    }

    private fun restorePendingNavigations(state: Bundle?) {
        if (state == null) return
        state.getStringArrayList(SEEN_NAVIGATION_IDS_KEY)
            ?.takeLast(MAX_SEEN_NAVIGATION_IDS)
            ?.filter { MESSAGE_ID.matches(it) }
            ?.let(seenNavigationIds::addAll)
        val ids = state.getStringArrayList(NAVIGATION_IDS_KEY) ?: return
        val routes = state.getStringArrayList(NAVIGATION_ROUTES_KEY) ?: return
        for (index in 0 until minOf(ids.size, routes.size, MAX_PENDING_NAVIGATIONS)) {
            val id = ids[index]
            val route = normalizeBusinessRoute(routes[index]) ?: continue
            if (!MESSAGE_ID.matches(id)) continue
            seenNavigationIds.add(id)
            navigationQueue.addLast(PendingNavigation(id, route))
        }
    }

    private fun routeFromIntent(intent: Intent?): Pair<String, String>? {
        if (intent == null) return null
        val extraRoute = intent.getStringExtra(EXTRA_NOTIFICATION_ROUTE)
        if (extraRoute != null) {
            return normalizeBusinessRoute(extraRoute)?.let { route ->
                route to (intent.getStringExtra(EXTRA_NOTIFICATION_ID) ?: UUID.randomUUID().toString())
            }
        }
        val data = intent.data ?: return null
        if (data.scheme.equals("heika", ignoreCase = true)) {
            val conversationId = data.pathSegments.singleOrNull()
                ?.takeIf { CONVERSATION_ID.matches(it) }
                ?.lowercase()
            if (data.host.equals("chat", ignoreCase = true) &&
                data.userInfo == null && data.query == null && data.fragment == null &&
                conversationId != null
            ) {
                return "/?conversation=$conversationId" to UUID.randomUUID().toString()
            }
            diagnostics.record("blocked_external_scheme")
            return null
        }
        if (!isTrustedUrl(data)) return null
        val route = safeRoute(data) ?: return null
        return route to (intent.getStringExtra(EXTRA_NOTIFICATION_ID) ?: UUID.randomUUID().toString())
    }

    private fun safeRoute(uri: Uri?): String? {
        if (uri == null || !isTrustedUrl(uri)) return null
        val path = uri.encodedPath?.takeIf { it.isNotEmpty() } ?: "/"
        return normalizeBusinessRoute(path + uri.encodedQuery?.let { "?$it" }.orEmpty())
    }

    private fun normalizeBusinessRoute(route: String): String? {
        if (route.length > MAX_ROUTE_LENGTH || !route.startsWith('/') || route.startsWith("//")) return null
        if ('#' in route || '\\' in route) return null
        return runCatching {
            val uri = "${BuildConfig.WEB_APP_ORIGIN}$route".toUri()
            if (!isTrustedUrl(uri) || uri.path != "/" || uri.userInfo != null) return null
            val params = uri.queryParameterNames
            val post = uri.getQueryParameter("post")
            val auth = uri.getQueryParameter("auth")
            val conversation = uri.getQueryParameter("conversation")
            if (params.any { it !in setOf("post", "auth", "conversation") }) return null
            if (uri.getQueryParameters("post").size > 1 || uri.getQueryParameters("auth").size > 1) return null
            if (uri.getQueryParameters("conversation").size > 1) return null
            val numericPostId = post?.toLongOrNull()
            if (post != null && (!POST_ID.matches(post) || numericPostId == null || numericPostId > MAX_SAFE_JS_INTEGER)) return null
            if (auth != null && auth != "reset") return null
            if (conversation != null && !CONVERSATION_ID.matches(conversation)) return null
            if (listOfNotNull(post, auth, conversation).size > 1) return null
            buildString {
                append('/')
                if (post != null) append("?post=").append(post)
                else if (auth != null) append("?auth=reset")
                else if (conversation != null) append("?conversation=").append(conversation.lowercase())
            }
        }.getOrNull()
    }

    private fun isTrustedUrl(uri: Uri): Boolean =
        uri.scheme.equals("https", ignoreCase = true) &&
            uri.userInfo == null && trustedOrigins.any { origin ->
                uri.host.equals(origin.host, ignoreCase = true) &&
                    (uri.port == -1 && origin.port == -1 ||
                        uri.port == origin.port || uri.port == 443 && origin.port == -1)
            }

    private fun openExternal(uri: Uri) {
        val allowed = uri.scheme.equals("https", true) || uri.scheme.equals("http", true) ||
            uri.scheme.equals("mailto", true) || uri.scheme.equals("tel", true)
        if (!allowed || uri.userInfo != null) {
            diagnostics.record("blocked_external_scheme")
            return
        }
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "没有可用的应用打开此链接", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showLoading() {
        val container = root ?: return
        if (overlay?.tag == LOADING_MASK_TAG && overlay?.parent === container) return
        clearOverlay()
        val mask = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.rgb(13, 16, 18))
            isClickable = true
            isFocusable = true
            tag = LOADING_MASK_TAG
        }
        val logo = ImageView(this).apply {
            setImageResource(R.drawable.ic_heika)
            contentDescription = getString(R.string.app_name)
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        mask.addView(logo, LinearLayout.LayoutParams(dp(84), dp(84)))
        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleSmall).apply {
            isIndeterminate = true
            indeterminateTintList = android.content.res.ColorStateList.valueOf(Color.rgb(213, 180, 92))
        }
        mask.addView(progress, LinearLayout.LayoutParams(dp(22), dp(22)).apply {
            topMargin = dp(22)
        })
        overlay = mask
        container.addView(mask, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        ))
        mask.alpha = 0f
        mask.animate().alpha(1f).setDuration(SPLASH_MASK_ENTER_MS).start()
    }

    private fun dismissLoadingMask() {
        val mask = overlay?.takeIf { it.tag == LOADING_MASK_TAG } ?: return
        overlay = null
        mask.animate().cancel()
        mask.animate()
            .alpha(0f)
            .setDuration(SPLASH_MASK_EXIT_MS)
            .withEndAction { (mask.parent as? ViewGroup)?.removeView(mask) }
            .start()
    }

    private fun showLoadError() {
        val container = root ?: return
        clearOverlay()
        cancelLoadTimeout()
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(32), dp(28), dp(32))
            setBackgroundColor(Color.rgb(13, 16, 18))
        }
        panel.addView(TextView(this).apply {
            text = getString(R.string.load_failed_title)
            setTextColor(Color.WHITE)
            textSize = 20f
            gravity = Gravity.CENTER
        })
        panel.addView(TextView(this).apply {
            text = getString(R.string.load_failed_message)
            setTextColor(Color.rgb(179, 184, 187))
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(20))
        })
        panel.addView(Button(this).apply {
            text = getString(R.string.retry)
            setTextColor(Color.rgb(13, 16, 18))
            setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(213, 180, 92)))
            setOnClickListener {
                rendererRestartCount = 0
                if (webView == null) createWebView(null, lastSafeRoute)
                else {
                    showLoading()
                    webView?.loadUrl(lastSafeRoute)
                }
            }
        })
        overlay = panel
        container.addView(panel, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        ))
    }

    private fun clearOverlay() {
        overlay?.let {
            it.animate().cancel()
            root?.removeView(it)
        }
        overlay = null
    }

    private fun cancelLoadTimeout() {
        loadTimeout?.let(mainHandler::removeCallbacks)
        loadTimeout = null
    }

    private fun cancelBridgeFallbackTimeout() {
        bridgeFallbackTimeout?.let(mainHandler::removeCallbacks)
        bridgeFallbackTimeout = null
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val WEB_VIEW_STATE_KEY = "heika_web_state_v1"
        const val NAVIGATION_IDS_KEY = "heika_navigation_ids_v1"
        const val NAVIGATION_ROUTES_KEY = "heika_navigation_routes_v1"
        const val SEEN_NAVIGATION_IDS_KEY = "heika_seen_navigation_ids_v1"
        const val EXTRA_NOTIFICATION_ROUTE = "com.heika.android.extra.ROUTE"
        const val EXTRA_NOTIFICATION_ID = "com.heika.android.extra.MESSAGE_ID"
        const val NOTIFICATION_PREFS = "heika_notification_permissions"
        const val NOTIFICATION_PERMISSION_ASKED = "post_notifications_asked"
        const val LOAD_TIMEOUT_MS = 20_000L
        const val BACK_RESPONSE_TIMEOUT_MS = 280L
        const val BACK_DEBOUNCE_MS = 250L
        const val NAVIGATION_ACK_TIMEOUT_MS = 5_000L
        const val BRIDGE_READY_TIMEOUT_MS = 2_000L
        const val RENDERER_RESTART_WINDOW_MS = 60_000L
        const val MAX_AUTOMATIC_RENDERER_RESTARTS = 1
        const val LOADING_MASK_TAG = "heika-native-loading-mask"
        const val SPLASH_MASK_ENTER_MS = 120L
        const val SPLASH_MASK_EXIT_MS = 180L
        const val MAX_PENDING_NAVIGATIONS = 20
        const val MAX_SEEN_NAVIGATION_IDS = 128
        const val MAX_ROUTE_LENGTH = 2_048
        const val MAX_SAFE_JS_INTEGER = 9_007_199_254_740_991L
        val MESSAGE_ID = Regex("^[A-Za-z0-9_-]{1,120}$")
        val POST_ID = Regex("^[0-9]{1,20}$")
        val CONVERSATION_ID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
    }
}
