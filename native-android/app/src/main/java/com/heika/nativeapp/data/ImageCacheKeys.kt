package com.heika.nativeapp.data

import java.net.URI
import java.security.MessageDigest

/** Cache identity follows the media path, not the rotating signed-query token. */
fun imageCacheKey(postId: String, url: String, variant: String): String {
    val stableUrl = runCatching {
        URI(url).let { uri -> "${uri.scheme}://${uri.host}${uri.path}" }
    }.getOrDefault(url.substringBefore('?').substringBefore('#'))
    val input = "$postId|$variant|$stableUrl".toByteArray(Charsets.UTF_8)
    val digest = MessageDigest.getInstance("SHA-256").digest(input)
    return digest.joinToString("") { byte -> "%02x".format(byte) }
}
