package com.heika.lite

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

/** WebView 创建与安全基线，所有配置集中在此，避免页面各自调整。 */
object LiteWebViewFactory {

    @SuppressLint("SetJavaScriptEnabled")
    fun create(context: Context, hardwareAccelerated: Boolean): WebView {
        val view = WebView(context)
        // 生产环境不开放远程调试。
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        view.isVerticalScrollBarEnabled = false
        view.isHorizontalScrollBarEnabled = false
        view.overScrollMode = WebView.OVER_SCROLL_NEVER
        view.setBackgroundColor(0xFF0D1012.toInt())

        val settings: WebSettings = view.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        // 网页业务使用 localStorage/IndexedDB 保存草稿与状态，禁用会导致功能缺失。
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.allowFileAccessFromFileURLs = false
        settings.allowUniversalAccessFromFileURLs = false
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)
        settings.mediaPlaybackRequiresUserGesture = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.loadsImagesAutomatically = true
        settings.blockNetworkImage = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.setSupportZoom(false)
        settings.textZoom = 100
        settings.offscreenPreRaster = hardwareAccelerated

        runCatching {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
                WebSettingsCompat.setSafeBrowsingEnabled(settings, true)
            }
        }
        runCatching {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                // 网页自带深浅色体系，禁止系统二次反色。
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
            }
        }

        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        // 第三方 Cookie 在混合架构里没有业务需要。
        cookies.setAcceptThirdPartyCookies(view, false)

        return view
    }

    /**
     * 缓存预算：Android 未提供可精确限制 WebView HTTP 缓存字节数的公开 API，
     * 因此预算只作用于宿主可完全控制的应用私有缓存目录，超预算时回收，
     * 不伪造 WebView 内部缓存的精确数值。
     */
    fun applyCacheBudget(view: WebView, budgetMb: Int, cacheDir: java.io.File): Long {
        val budget = budgetMb.toLong() * 1024L * 1024L
        if (directorySize(cacheDir) > budget) {
            runCatching { view.clearCache(true) }
        }
        return directorySize(cacheDir)
    }

    fun directorySize(dir: java.io.File): Long {
        if (!dir.exists()) return 0L
        return runCatching {
            dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
        }.getOrDefault(0L)
    }

    /** 清理网页缓存与存储，但保留 Cookie（登录状态）与本地草稿（本地存储由网页草稿层管理）。 */
    fun clearWebCache(view: WebView, clearStorage: Boolean, onDone: (Boolean) -> Unit) {
        runCatching {
            view.clearCache(true)
            if (clearStorage) {
                runCatching { WebStorageBridge.clearLocalStorage() }
            }
            CookieManager.getInstance().flush()
        }.onSuccess { onDone(true) }.onFailure { onDone(false) }
    }
}

/** 隔离 localStorage 清理，避免误调用将草稿一起删除。 */
internal object WebStorageBridge {
    fun clearLocalStorage() {
        // 由网页端在收到清缓存指令后自行决定清理范围，原生侧不直接清空 localStorage，
        // 以免删掉未发布草稿。这里只做占位，真实清理由网页运行时完成。
    }
}
