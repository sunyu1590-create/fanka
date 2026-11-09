package com.heika.nativeapp.feature.compat

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.view.View
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.ui.BackHeader
import kotlinx.coroutines.launch
import org.json.JSONObject

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun CompatWebScreen(path: String, auth: AuthRepository, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var bootstrapped by remember(path) { mutableStateOf(false) }
    var loading by remember(path) { mutableStateOf(true) }
    var error by remember(path) { mutableStateOf<String?>(null) }
    var renderProcessGone by remember(path) { mutableStateOf(false) }
    var webView by remember(path) { mutableStateOf<WebView?>(null) }
    var webGeneration by remember(path) { mutableIntStateOf(0) }
    var targetUrl by remember(path) { mutableStateOf("") }
    var authStorageKey by remember(path) { mutableStateOf<String?>(null) }
    var sessionBootstrap by remember(path) { mutableStateOf<Pair<String, String>?>(null) }

    LaunchedEffect(path) {
        val target = runCatching { safeTarget(path) }.getOrElse {
            error = it.message ?: "目标页面无效"
            return@LaunchedEffect
        }
        val bootstrap = runCatching { auth.compatBootstrap() }.getOrNull()
        sessionBootstrap = bootstrap
        bootstrapped = bootstrap == null
        targetUrl = target
        // The page can open before this public project identifier is fetched. It is
        // used only for a same-origin read of the existing Supabase session key.
        authStorageKey = runCatching { auth.compatStorageKey() }.getOrNull()
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(compatTitle(path), onBack)
        Box(Modifier.fillMaxSize()) {
            if (targetUrl.isNotBlank()) {
                key(webGeneration) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { viewContext ->
                            WebView(viewContext).apply {
                                webView = this
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                settings.databaseEnabled = false
                                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                settings.allowFileAccess = false
                                settings.allowContentAccess = false
                                settings.javaScriptCanOpenWindowsAutomatically = false
                                settings.setSupportMultipleWindows(false)
                                settings.cacheMode = WebSettings.LOAD_DEFAULT
                                settings.safeBrowsingEnabled = true
                                webChromeClient = WebChromeClient()

                                if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                                    WebViewCompat.addWebMessageListener(
                                        this,
                                        "HeikaAuthBridge",
                                        setOf("https://moonclean.shop", "https://www.moonclean.shop"),
                                    ) { _, message, sourceOrigin, isMainFrame, _ ->
                                        val payload = message.data
                                        if (isMainFrame && sourceOrigin?.let(::isTrusted) == true && payload != null && payload.length <= 32_768) {
                                            scope.launch { auth.importCompatSession(payload) }
                                        }
                                    }
                                }

                                webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                        val uri = request.url
                                        if (isTrusted(uri)) return false
                                        openExternal(viewContext, uri)
                                        return true
                                    }

                                    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                                        super.onPageStarted(view, url, favicon)
                                        if (url?.startsWith(BuildConfig.API_BASE_URL) == true) {
                                            loading = true
                                            error = null
                                        }
                                    }

                                    override fun onPageFinished(view: WebView, url: String?) {
                                        super.onPageFinished(view, url)
                                        if (!bootstrapped && sessionBootstrap != null && url?.startsWith(BuildConfig.API_BASE_URL) == true) {
                                            bootstrapped = true
                                            val (key, value) = sessionBootstrap!!
                                            val script = "localStorage.setItem(${JSONObject.quote(key)}, ${JSONObject.quote(value)}); window.location.replace(${JSONObject.quote(targetUrl)});"
                                            view.evaluateJavascript(script, null)
                                            return
                                        }
                                        if (bootstrapped && url?.startsWith(BuildConfig.API_BASE_URL) == true) {
                                            loading = false
                                            view.visibility = View.VISIBLE
                                            authStorageKey?.let { storageKey ->
                                                view.evaluateJavascript(authSyncScript(storageKey), null)
                                            }
                                        }
                                    }

                                    override fun onReceivedError(view: WebView, request: WebResourceRequest, webError: WebResourceError) {
                                        if (request.isForMainFrame) {
                                            loading = false
                                            error = "页面暂时无法加载，请检查网络后重试。"
                                        }
                                    }

                                    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, sslError: android.net.http.SslError) {
                                        handler.cancel()
                                        loading = false
                                        view.visibility = View.INVISIBLE
                                        error = "安全连接校验失败，请稍后重试。"
                                    }

                                    override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                                        loading = false
                                        renderProcessGone = true
                                        error = "页面渲染已中断，请重新打开。"
                                        view.stopLoading()
                                        return true
                                    }
                                }

                                visibility = View.INVISIBLE
                                if (!bootstrapped && sessionBootstrap != null) {
                                    loadDataWithBaseURL(BuildConfig.API_BASE_URL, "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>", "text/html", "UTF-8", null)
                                } else {
                                    loadUrl(targetUrl)
                                }
                            }
                        },
                        update = { view ->
                            if (bootstrapped && view.url?.startsWith(BuildConfig.API_BASE_URL) == true) {
                                authStorageKey?.let { storageKey -> view.evaluateJavascript(authSyncScript(storageKey), null) }
                            }
                        },
                    )
                }
            }
            if (loading) Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(Modifier.size(24.dp), color = MaterialTheme.colorScheme.primary, strokeWidth = 2.dp)
                Text("正在打开兼容页面", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 11.dp))
            }
            error?.let { message ->
                Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    Text("重新加载", color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, modifier = Modifier.padding(top = 14.dp).clickable {
                        error = null
                        loading = true
                        if (renderProcessGone) {
                            renderProcessGone = false
                            webView = null
                            webGeneration += 1
                        } else webView?.reload()
                    })
                }
            }
        }
    }

    DisposableEffect(webView) {
        onDispose {
            webView?.let { page ->
                page.stopLoading()
                page.webChromeClient = null
                page.webViewClient = WebViewClient()
                page.removeAllViews()
                page.destroy()
            }
            webView = null
        }
    }
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

private fun safeTarget(path: String): String {
    require(path.startsWith('/') && !path.startsWith("//") && !path.contains("\\") && !path.startsWith("/javascript:", true)) { "目标页面无效" }
    val uri = Uri.parse(path)
    val builder = uri.buildUpon().clearQuery()
    uri.queryParameterNames.forEach { name ->
        if (name != "nativeShell") uri.getQueryParameters(name).forEach { value -> builder.appendQueryParameter(name, value) }
    }
    builder.appendQueryParameter("nativeShell", "1")
    return BuildConfig.API_BASE_URL + builder.build().toString()
}

private fun compatTitle(path: String): String = when (Uri.parse(path).getQueryParameter("nativeTab")) {
    "messages" -> "消息"
    "mine" -> "我的"
    "search" -> "搜索"
    "publish" -> "发布内容"
    "feedback" -> "意见反馈"
    else -> if (Uri.parse(path).getQueryParameter("post") != null) "内容详情" else "HEIKA 页面"
}

private fun isTrusted(uri: Uri): Boolean = uri.scheme == "https" && uri.host in setOf("moonclean.shop", "www.moonclean.shop")

private fun openExternal(context: android.content.Context, uri: Uri) {
    try { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: ActivityNotFoundException) { }
}
