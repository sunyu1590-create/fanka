package com.heika.nativeapp.feature.compat

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.ui.BackHeader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val LOAD_TIMEOUT_MS = 30_000L
private const val TAG = "HeikaCompat"

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun CompatWebScreen(path: String, auth: AuthRepository, onBack: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val latestBack by rememberUpdatedState(onBack)
    var initialized by remember(path) { mutableStateOf(false) }
    var targetUrl by remember(path) { mutableStateOf("") }
    var authStorageKey by remember(path) { mutableStateOf<String?>(null) }
    var sessionBootstrap by remember(path) { mutableStateOf<Pair<String, String>?>(null) }
    var pageState by remember(path) { mutableStateOf<CompatPageState>(CompatPageState.Loading) }
    var webGeneration by remember(path) { mutableIntStateOf(0) }
    var hostRetry by remember(path) { mutableStateOf<(() -> Unit)?>(null) }
    val currentAuth by rememberUpdatedState(auth)

    LaunchedEffect(path) {
        val target = runCatching { safeTarget(path) }.getOrElse {
            pageState = CompatPageState.Failed(it.message ?: "目标页面无效")
            initialized = true
            return@LaunchedEffect
        }
        targetUrl = target
        sessionBootstrap = runCatching { auth.compatBootstrap() }.getOrNull()
        authStorageKey = runCatching { auth.compatStorageKey() }.getOrNull()
        initialized = true
    }

    // A bounded deadline turns stalled redirects/scripts into a visible retry state.
    // Successful first paint is detected by WebCompatibilityHost, not by this timer.
    LaunchedEffect(targetUrl, webGeneration, pageState) {
        if (targetUrl.isBlank() || pageState !is CompatPageState.Loading) return@LaunchedEffect
        delay(LOAD_TIMEOUT_MS)
        if (pageState is CompatPageState.Loading) {
            Log.w(TAG, "load_timeout route=${Uri.parse(targetUrl).path}")
            pageState = CompatPageState.Failed("页面加载超时，请检查连接后重试。")
        }
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(compatTitle(path), { latestBack() })
        Box(Modifier.fillMaxSize()) {
            if (initialized && targetUrl.isNotBlank()) {
                key(webGeneration) {
                    val host = remember(path, webGeneration) {
                        WebCompatibilityHost(
                            baseUrl = BuildConfig.API_BASE_URL,
                            targetUrl = targetUrl,
                            sessionBootstrap = sessionBootstrap,
                            authStorageKey = authStorageKey,
                            onState = { pageState = it },
                            onBridgeMessage = { payload ->
                                scope.launch { currentAuth.importCompatSession(payload) }
                            },
                            onOpenExternal = { uri -> openExternal(context, uri) },
                        )
                    }
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = host::create,
                        update = host::attach,
                    )
                    DisposableEffect(host, lifecycleOwner) {
                        val observer = LifecycleEventObserver { _, event ->
                            when (event) {
                                Lifecycle.Event.ON_RESUME -> host.resume()
                                Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP -> host.pause()
                                else -> Unit
                            }
                        }
                        lifecycleOwner.lifecycle.addObserver(observer)
                        hostRetry = host::retry
                        onDispose {
                            lifecycleOwner.lifecycle.removeObserver(observer)
                            hostRetry = null
                            host.dispose()
                        }
                    }
                }
            }

            when (val state = pageState) {
                CompatPageState.Loading -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(Modifier.size(24.dp), color = MaterialTheme.colorScheme.primary, strokeWidth = 2.dp)
                    Text("正在打开兼容页面", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 11.dp))
                }
                is CompatPageState.Visible -> Unit
                is CompatPageState.Failed -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.message, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    Text("重新加载", color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, modifier = Modifier.padding(top = 14.dp).clickable {
                        pageState = CompatPageState.Loading
                        if (state.rendererGone) webGeneration += 1 else {
                            hostRetry?.invoke()
                        }
                    })
                }
            }
        }
    }
}

internal sealed interface CompatPageState {
    data object Loading : CompatPageState
    data class Visible(val resourcesComplete: Boolean) : CompatPageState
    data class Failed(val message: String, val rendererGone: Boolean = false) : CompatPageState
}

@SuppressLint("SetJavaScriptEnabled")
internal class WebCompatibilityHost(
    private val baseUrl: String,
    private val targetUrl: String,
    private val sessionBootstrap: Pair<String, String>?,
    private val authStorageKey: String?,
    private val onState: (CompatPageState) -> Unit,
    private val onBridgeMessage: (String) -> Unit,
    private val onOpenExternal: (Uri) -> Unit,
) {
    private var webView: WebView? = null
    private var bootstrapPending = false
    private var bootstrapped = sessionBootstrap == null
    private var disposed = false
    private var lastAuthSyncedUrl: String? = null
    private var failed = false
    private var targetLoadStarted = false
    private var rapidStartWindowMs = 0L
    private var rapidStartCount = 0

    fun create(viewContext: android.content.Context): WebView {
        check(!disposed) { "WebCompatibilityHost has been disposed" }
        return WebView(viewContext).also { view ->
            webView = view
            view.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = false
                mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                allowFileAccess = false
                allowContentAccess = false
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
                safeBrowsingEnabled = true
            }
            android.webkit.CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setAcceptThirdPartyCookies(view, false)
            }
            view.visibility = android.view.View.INVISIBLE
            installBridge(view)
            installClients(view)
            start(view)
        }
    }

    fun attach(view: WebView) {
        if (webView !== view) webView = view
    }

    fun retry() {
        val view = webView ?: return
        failed = false
        onState(CompatPageState.Loading)
        view.visibility = android.view.View.INVISIBLE
        view.stopLoading()
        if (!bootstrapped && sessionBootstrap != null) startBootstrap(view) else {
            targetLoadStarted = false
            view.loadUrl(targetUrl)
        }
    }

    fun pause() { webView?.onPause() }

    fun resume() { webView?.onResume() }

    fun dispose() {
        if (disposed) return
        disposed = true
        val view = webView ?: return
        webView = null
        destroy(view)
    }

    private fun start(view: WebView) {
        if (sessionBootstrap != null) startBootstrap(view) else {
            targetLoadStarted = false
            view.loadUrl(targetUrl)
        }
    }

    private fun startBootstrap(view: WebView) {
        failed = false
        val (storageKey, sessionValue) = sessionBootstrap ?: run {
            bootstrapped = true
            view.loadUrl(targetUrl)
            return
        }
        bootstrapPending = true
        bootstrapped = false
        targetLoadStarted = false
        view.loadDataWithBaseURL(
            baseUrl,
            "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>",
            "text/html",
            "UTF-8",
            null,
        )
        // onPageFinished processes this trusted, host-created bootstrap document even
        // when WebView reports about:blank for its URL.
        pendingBootstrap = storageKey to sessionValue
    }

    private var pendingBootstrap: Pair<String, String>? = null

    private fun installBridge(view: WebView) {
        if (androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.WEB_MESSAGE_LISTENER)) {
            androidx.webkit.WebViewCompat.addWebMessageListener(
                view,
                "HeikaAuthBridge",
                setOf("https://moonclean.shop", "https://www.moonclean.shop"),
            ) { _, message, sourceOrigin, isMainFrame, _ ->
                val payload = message.data
                if (isMainFrame && sourceOrigin?.let { isTrusted(it) } == true && payload != null && payload.length <= 32_768) {
                    onBridgeMessage(payload)
                }
            }
        }
    }

    private fun installClients(view: WebView) {
        view.webChromeClient = object : android.webkit.WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                if (!failed && targetLoadStarted && newProgress == 100 && bootstrapped && isTrusted(Uri.parse(view.url.orEmpty()))) {
                    showDocument(view, resourcesComplete = true)
                }
            }
        }
        view.webViewClient = object : android.webkit.WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: android.webkit.WebResourceRequest): Boolean {
                val uri = request.url
                if (!request.isForMainFrame) return !isTrusted(uri)
                if (isTrusted(uri)) return false
                Log.i(TAG, "external_navigation scheme=${uri.scheme} host=${uri.host.orEmpty()}")
                onOpenExternal(uri)
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                val uri = Uri.parse(url.orEmpty())
                if (!bootstrapPending && isTrusted(uri)) {
                    val now = android.os.SystemClock.elapsedRealtime()
                    if (now - rapidStartWindowMs > 10_000L) {
                        rapidStartWindowMs = now
                        rapidStartCount = 0
                    }
                    rapidStartCount += 1
                    if (rapidStartCount > 12) {
                        fail(view, "页面跳转次数过多，请返回后重试。")
                        return
                    }
                    failed = false
                    targetLoadStarted = true
                    Log.d(TAG, "page_started host=${uri.host.orEmpty()} route=${uri.path.orEmpty()}")
                    onState(CompatPageState.Loading)
                }
            }

            override fun onPageCommitVisible(view: WebView, url: String?) {
                super.onPageCommitVisible(view, url)
                val uri = Uri.parse(url.orEmpty())
                if (!failed && targetLoadStarted && bootstrapped && isTrusted(uri)) showDocument(view, resourcesComplete = false)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                if (bootstrapPending) {
                    val pair = pendingBootstrap
                    bootstrapPending = false
                    pendingBootstrap = null
                    if (pair == null) {
                        onState(CompatPageState.Failed("登录状态初始化失败，请重新加载。"))
                        return
                    }
                    val script = "try { localStorage.setItem(${JSONObject.quote(pair.first)}, ${JSONObject.quote(pair.second)}); true } catch (e) { false }"
                    view.evaluateJavascript(script) { result ->
                        if (disposed) return@evaluateJavascript
                        if (result == "true") {
                            bootstrapped = true
                            Log.d(TAG, "session_bootstrap=complete")
                            view.loadUrl(targetUrl)
                        } else {
                            Log.w(TAG, "session_bootstrap=failed")
                            onState(CompatPageState.Failed("登录状态暂时无法恢复，请重新加载。"))
                        }
                    }
                    return
                }
                val uri = Uri.parse(url.orEmpty())
                if (!failed && targetLoadStarted && bootstrapped && isTrusted(uri)) {
                    Log.d(TAG, "page_finished host=${uri.host.orEmpty()} route=${uri.path.orEmpty()}")
                    showDocument(view, resourcesComplete = true)
                }
            }

            override fun onReceivedError(view: WebView, request: android.webkit.WebResourceRequest, error: android.webkit.WebResourceError) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) {
                    Log.e(TAG, "main_frame_error code=${error.errorCode} description=${error.description}")
                    fail(view, "页面暂时无法加载，请检查网络后重试。")
                } else {
                    Log.w(TAG, "subresource_error code=${error.errorCode} host=${request.url.host.orEmpty()}")
                }
            }

            override fun onReceivedHttpError(view: WebView, request: android.webkit.WebResourceRequest, response: android.webkit.WebResourceResponse) {
                super.onReceivedHttpError(view, request, response)
                if (request.isForMainFrame) {
                    Log.e(TAG, "main_frame_http_error status=${response.statusCode} host=${request.url.host.orEmpty()}")
                    fail(view, if (response.statusCode == 401 || response.statusCode == 403) "登录状态需要更新，请返回后重新进入。" else "服务暂时不可用，请稍后重试。")
                }
            }

            override fun onReceivedSslError(view: WebView, handler: android.webkit.SslErrorHandler, error: android.net.http.SslError) {
                handler.cancel()
                Log.e(TAG, "ssl_error primary=${error.primaryError} host=${Uri.parse(error.url.orEmpty()).host.orEmpty()}")
                fail(view, "安全连接校验失败，请稍后重试。")
            }

            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                Log.e(TAG, "renderer_gone crashed=${detail.didCrash()} priority=${detail.rendererPriorityAtExit()}")
                webView = null
                destroy(view)
                onState(CompatPageState.Failed("页面渲染已中断，请重新打开。", rendererGone = true))
                return true
            }
        }
    }

    private fun showDocument(view: WebView, resourcesComplete: Boolean) {
        if (disposed || failed || !targetLoadStarted || !bootstrapped) return
        view.visibility = android.view.View.VISIBLE
        onState(CompatPageState.Visible(resourcesComplete))
        Log.d(TAG, "page_content_visible resources_complete=$resourcesComplete")
        val currentUrl = view.url
        if (currentUrl != null && currentUrl != lastAuthSyncedUrl) {
            lastAuthSyncedUrl = currentUrl
            authStorageKey?.let { view.evaluateJavascript(authSyncScript(it), null) }
        }
    }

    private fun fail(view: WebView, message: String) {
        failed = true
        view.stopLoading()
        view.visibility = android.view.View.INVISIBLE
        onState(CompatPageState.Failed(message))
    }

    private fun destroy(view: WebView) {
        runCatching {
            androidx.webkit.WebViewCompat.removeWebMessageListener(view, "HeikaAuthBridge")
        }
        view.stopLoading()
        view.webChromeClient = null
        view.webViewClient = android.webkit.WebViewClient()
        view.removeAllViews()
        view.destroy()
    }

    private fun isTrusted(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host in TRUSTED_HOSTS
}

private val TRUSTED_HOSTS = setOf("moonclean.shop", "www.moonclean.shop")

private fun openExternal(context: android.content.Context, uri: Uri) {
    if (uri.scheme != "http" && uri.scheme != "https" && uri.scheme != "mailto" && uri.scheme != "tel") return
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        .onFailure { if (it !is ActivityNotFoundException) Log.w(TAG, "external_open_failed scheme=${uri.scheme}") }
}

private fun safeTarget(path: String): String {
    return BuildConfig.API_BASE_URL.trimEnd('/') + normalizeCompatPath(path)
}

private fun compatTitle(path: String): String = when (Uri.parse(path).getQueryParameter("nativeTab")) {
    "messages" -> "消息"
    "mine" -> "我的"
    "search" -> "搜索"
    "publish" -> "发布内容"
    "feedback" -> "意见反馈"
    else -> if (Uri.parse(path).getQueryParameter("post") != null) "内容详情" else "HEIKA 页面"
}

private fun authSyncScript(storageKey: String): String {
    val key = JSONObject.quote(storageKey)
    return """(function(){
        const k=$key;
        if(window.__heikaAuthSyncInstalled)return;
        window.__heikaAuthSyncInstalled=true;
        const send=()=>{try{window.HeikaAuthBridge.postMessage(localStorage.getItem(k)||"")}catch(_){}};
        const set=Storage.prototype.setItem;
        Storage.prototype.setItem=function(name,value){set.call(this,name,value);if(name===k)send()};
        const remove=Storage.prototype.removeItem;
        Storage.prototype.removeItem=function(name){remove.call(this,name);if(name===k)send()};
        const clear=Storage.prototype.clear;
        Storage.prototype.clear=function(){clear.call(this);send()};
        window.addEventListener("storage",event=>{if(event.key===k)send()});
        send();
    })();""".trimIndent()
}
