package com.heika.nativeapp.data

/** Native inbox operations use the authenticated CloudBase-backed HEIKA API. */
object NativeMessagesApi {
    const val PATH = "/api/v1/messages"

    fun conversationPath(conversationId: String, before: String? = null): String = buildString {
        append(PATH).append("?conversation=").append(encode(conversationId))
        before?.takeIf(String::isNotBlank)?.let { append("&before=").append(encode(it)) }
    }

    /**
     * Chat 2.0 GET views. All parameters are optional except the view itself;
     * blank values are dropped so the server can apply its own defaults.
     */
    fun viewPath(
        view: String,
        conversationId: String? = null,
        before: String? = null,
        query: String? = null,
        kind: String? = null,
    ): String = buildString {
        append(PATH).append("?view=").append(encode(view))
        conversationId?.takeIf(String::isNotBlank)?.let { append("&conversation=").append(encode(it)) }
        before?.takeIf(String::isNotBlank)?.let { append("&before=").append(encode(it)) }
        query?.takeIf(String::isNotBlank)?.let { append("&q=").append(encode(it)) }
        kind?.takeIf(String::isNotBlank)?.let { append("&kind=").append(encode(it)) }
    }

    fun action(name: String, conversationId: String? = null): org.json.JSONObject =
        org.json.JSONObject().put("action", name).apply {
            conversationId?.let { put("conversation", it) }
        }

    private fun encode(value: String) = java.net.URLEncoder.encode(value, Charsets.UTF_8.name())
}
