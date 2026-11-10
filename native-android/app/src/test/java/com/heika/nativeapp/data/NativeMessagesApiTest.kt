package com.heika.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class NativeMessagesApiTest {
    @Test
    fun nativeMessagingUsesSupabaseDataApiRoutesAndMethods() {
        assertEquals("/rpc/dm_inbox_summary", NativeMessagesApi.INBOX_PATH)
        assertEquals("/rpc/open_dm", NativeMessagesApi.OPEN_PATH)
        assertEquals("/rpc/send_dm", NativeMessagesApi.SEND_PATH)
        assertEquals("/dm_messages", NativeMessagesApi.MESSAGES_PATH)
        assertEquals("/dm_reads", NativeMessagesApi.READS_PATH)
        assertEquals("POST", NativeMessagesApi.RPC_METHOD)
        assertEquals("GET", NativeMessagesApi.READ_METHOD)
        assertEquals("POST", NativeMessagesApi.UPSERT_METHOD)
        assertFalse(listOf(NativeMessagesApi.INBOX_PATH, NativeMessagesApi.OPEN_PATH, NativeMessagesApi.SEND_PATH).any { it.startsWith("/api/") })
    }

    @Test
    fun conversationQueryUsesStablePagingAndEscapesTimestamp() {
        val id = "8b0f5a22-f231-4f21-b67e-2628e00db4b9"
        assertEquals(
            "/dm_messages?select=id,conversation_id,sender_id,body,created_at&conversation_id=eq.$id&order=created_at.desc,id.desc&limit=40",
            NativeMessagesApi.messagesQuery(id),
        )
        assertEquals(
            "/dm_messages?select=id,conversation_id,sender_id,body,created_at&conversation_id=eq.$id&order=created_at.desc,id.desc&limit=40&created_at=lt.2026-11-10T10%3A00%3A00Z",
            NativeMessagesApi.messagesQuery(id, "2026-11-10T10:00:00Z"),
        )
    }
}
