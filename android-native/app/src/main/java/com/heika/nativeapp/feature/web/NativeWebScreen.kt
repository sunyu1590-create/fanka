package com.heika.nativeapp.feature.web

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaRadii
import org.json.JSONObject

/**
 * APP 内的网页容器：只用于明确指定的功能（装扮、工坊等），
 * 直接落到目标子页，不经过网页首页。
 *
 * 约定：
 * - 加载进度来自 WebChromeClient 的真实 progress，不人为增加等待；
 * - 失败可重试或返回，不会把用户困在白屏；
 * - 通过 [Bridge] 暴露受控动作给网页，令牌不进 URL；
 * - 网页侧以 `app=1` 隐藏重复的顶栏、底栏与下载入口。
 */
@Composable
fun NativeWebScreen(
    title: String,
    path: String,
    sessionJson: String?,
    onBack: () -> Unit,
    onEvent: (type: String, payload: JSONObject) -> Unit,
) {
    var progress by remember(path) { mutableFloatStateOf(0f) }
    var failed by remember(path) { mutableStateOf<String?>(null) }
    var reloadKey by remember(path) { mutableIntStateOf(0) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    // 会话是异步恢复的：桥接对象在 factory 里创建一次，用 State 读取最新值，
    // 避免网页脚本拿到创建时还没准备好的空会话。
    val latestSession = rememberUpdatedState(sessionJson)
    val latestEvent = rememberUpdatedState(onEvent)

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(title, onBack)
        Box(Modifier.fillMaxSize()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    WebView(context).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = true
                        settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        addJavascriptInterface(Bridge({ latestSession.value }, { type, payload -> latestEvent.value(type, payload) }), "HeikaNative")
                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView, newProgress: Int) {
                                progress = newProgress / 100f
                            }
                        }
                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                                failed = null
                            }

                            override fun onPageFinished(view: WebView, url: String?) {
                                progress = 1f
                                // 双保险：即使网页没读到 app=1，也不显示重复导航。
                                view.evaluateJavascript(
                                    "(function(){document.documentElement.dataset.appEmbed='1';" +
                                        "var m=document.querySelector('meta[name=theme-color]');" +
                                        "if(m){m.setAttribute('content','#0B0D0F');}})();",
                                    null,
                                )
                            }

                            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                                if (request.isForMainFrame) failed = "页面加载失败，请检查网络后重试"
                            }
                        }
                        webView = this
                    }
                },
                update = { view -> webView = view },
            )
            LaunchedEffect(path, reloadKey) {
                progress = 0f
                failed = null
                webView?.loadUrl(BuildConfig.WEB_APP_URL.trimEnd('/') + path)
            }
            // 过渡页只在「还没有真实进度」或加载未完成时出现，进度是真实值。
            if (progress < 1f && failed == null) {
                Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
                    Column(
                        Modifier.align(Alignment.Center).padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Box(
                            Modifier.size(58.dp).background(
                                MaterialTheme.colorScheme.surface,
                                RoundedCornerShape(HeikaRadii.group),
                            ),
                            contentAlignment = Alignment.Center,
                        ) {
                            androidx.compose.material3.Icon(
                                HeikaIcons.Magic,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(26.dp),
                            )
                        }
                        Text("黑卡", color = MaterialTheme.colorScheme.onBackground, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 4.sp)
                        Text("正在打开「$title」", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        Box(Modifier.fillMaxWidth(0.6f).height(3.dp).background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(99.dp))) {
                            Box(
                                Modifier.fillMaxWidth(progress.coerceIn(0.04f, 1f)).height(3.dp)
                                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(99.dp)),
                            )
                        }
                        Text("${(progress * 100).toInt()}%", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .7f), fontSize = 10.sp)
                    }
                }
            }
            if (failed != null) {
                Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
                    Column(
                        Modifier.align(Alignment.Center).padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(failed ?: "", color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp)
                        Text("可以重试，或返回上一页继续使用。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            TextButton(onClick = { reloadKey++ }) { Text("重试") }
                            TextButton(onClick = onBack) { Text("返回") }
                        }
                    }
                }
            }
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            webView?.apply {
                stopLoading()
                removeJavascriptInterface("HeikaNative")
                destroy()
            }
            webView = null
        }
    }
}

/** 只暴露已定义的动作，令牌按需读取，不落到 URL 或页面源码里。 */
private class Bridge(
    private val session: () -> String?,
    private val onEvent: (String, JSONObject) -> Unit,
) {
    @JavascriptInterface
    fun session(): String = session().orEmpty()

    @JavascriptInterface
    fun post(message: String) {
        val payload = runCatching { JSONObject(message) }.getOrNull() ?: return
        val type = payload.optString("type")
        if (type.isBlank()) return
        onEvent(type, payload)
    }
}
