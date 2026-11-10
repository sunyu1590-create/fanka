package com.heika.nativeapp.data

/** Native messaging uses authenticated Supabase Data API routes, not the optional Next.js proxy. */
object NativeMessagesApi {
    const val INBOX_PATH = "/rpc/dm_inbox_summary"
    const val OPEN_PATH = "/rpc/open_dm"
    const val SEND_PATH = "/rpc/send_dm"
    const val MESSAGES_PATH = "/dm_messages"
    const val READS_PATH = "/dm_reads"

    const val RPC_METHOD = "POST"
    const val READ_METHOD = "GET"
    const val UPSERT_METHOD = "POST"

    fun messagesQuery(conversationId: String, before: String? = null): String = buildString {
        append(MESSAGES_PATH)
        append("?select=id,conversation_id,sender_id,body,created_at")
        append("&conversation_id=eq.").append(conversationId)
        append("&order=created_at.desc,id.desc&limit=40")
        before?.let { append("&created_at=lt.").append(java.net.URLEncoder.encode(it, Charsets.UTF_8.name())) }
    }

    const val READ_UPSERT_QUERY = "?on_conflict=conversation_id,user_id"
}
