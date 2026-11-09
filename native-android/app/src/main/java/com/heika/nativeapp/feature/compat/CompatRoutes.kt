package com.heika.nativeapp.feature.compat

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/** Accepts only a relative, same-origin route and enforces the native-shell flag. */
internal fun normalizeCompatPath(path: String): String {
    require(path.startsWith('/') && !path.startsWith("//") && !path.contains('\\') && !path.startsWith("/javascript:", true)) {
        "目标页面无效"
    }
    val parsed = URI(path)
    require(parsed.scheme == null && parsed.rawAuthority == null && parsed.rawPath?.startsWith('/') == true) {
        "目标页面无效"
    }
    val query = parsed.rawQuery.orEmpty().split('&').filter { part ->
        val rawKey = part.substringBefore('=')
        runCatching { URLDecoder.decode(rawKey, StandardCharsets.UTF_8.name()) }
            .getOrDefault(rawKey) != "nativeShell"
    }.filter(String::isNotBlank) + "nativeShell=1"
    val fragment = parsed.rawFragment?.let { "#$it" }.orEmpty()
    return parsed.rawPath + "?" + query.joinToString("&") + fragment
}
