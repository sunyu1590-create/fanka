package com.heika.android

import android.content.Context
import android.graphics.Color
import android.os.Build
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView

internal object WebViewCore {
    fun create(context: Context): WebView {
        val webView = WebView(context)
        webView.apply {
            setBackgroundColor(Color.rgb(13, 16, 18))
            isFocusable = true
            isFocusableInTouchMode = true

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                allowFileAccess = false
                allowContentAccess = true
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
            }
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, false)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_BOUND, false)
        }
        return webView
    }
}
