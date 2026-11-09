package com.heika.nativeapp.util

import android.webkit.CookieManager
import android.webkit.WebStorage

object WebSessionCleaner {
    fun clear() {
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        WebStorage.getInstance().deleteAllData()
    }
}
