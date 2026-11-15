package com.heika.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeMessagesApiTest {
    @Test
    fun messagingUsesCloudBaseBackedBusinessApi() {
        assertEquals("/api/v1/messages", NativeMessagesApi.PATH)
    }

    @Test
    fun conversationCursorIsEncodedAndScopedToConversation() {
        val id = "8b0f5a22-f231-4f21-b67e-2628e00db4b9"
        assertEquals("/api/v1/messages?conversation=$id", NativeMessagesApi.conversationPath(id))
        assertEquals(
            "/api/v1/messages?conversation=$id&before=2026-11-10T10%3A00%3A00Z",
            NativeMessagesApi.conversationPath(id, "2026-11-10T10:00:00Z"),
        )
        assertTrue(NativeMessagesApi.conversationPath(id).startsWith(NativeMessagesApi.PATH))
    }
}
