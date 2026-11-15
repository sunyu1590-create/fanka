package com.heika.nativeapp.data

/** Native inbox operations use the authenticated CloudBase-backed HEIKA API. */
object NativeMessagesApi {
    const val PATH = "/api/v1/messages"

    fun conversationPath(conversationId: String, before: String? = null): String = buildString {
        append(PATH).append("?conversation=").append(encode(conversationId))
        before?.takeIf(String::isNotBlank)?.let { append("&before=").append(encode(it)) }
    }

    fun action(name: String, conversationId: String? = null): org.json.JSONObject =
        org.json.JSONObject().put("action", name).apply {
            conversationId?.let { put("conversation", it) }
        }

    private fun encode(value: String) = java.net.URLEncoder.encode(value, Charsets.UTF_8.name())
}
