package com.heika.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class HeikaPostIdMappingTest {
    @Test
    fun detailPayloadKeepsDatabaseUuidAndNumericClientIdSeparate() {
        val uuid = "4a4f04ae-3eef-4d86-bf14-2b61ce52a1a9"
        assertEquals(275, PostIdMapping.clientId(null, 275, uuid))
        assertEquals(uuid, PostIdMapping.cloudId("", uuid, ""))
    }

    @Test
    fun uuidWithoutClientIdIsRejectedInsteadOfBecomingZero() {
        assertThrows(IllegalArgumentException::class.java) {
            PostIdMapping.clientId(null, null, "4a4f04ae-3eef-4d86-bf14-2b61ce52a1a9")
        }
    }

    @Test
    fun numericLegacyIdRemainsTheClientId() {
        assertEquals(18, PostIdMapping.clientId(null, null, 18))
        assertEquals("", PostIdMapping.cloudId("", "18", ""))
    }

    @Test
    fun ratingAndLibraryStateUseNumericClientIdInWebsiteProtocol() {
        assertEquals("/api/v1/posts/275/rating", PostInteractionProtocol.ratingPath(275))
        assertEquals("/api/v1/posts/275/rating", PostInteractionProtocol.ratingStatePath(275))
        assertEquals("{\"action\":\"like\",\"id\":275,\"value\":true}", PostInteractionProtocol.libraryStateBody(275, "like", true))
        assertEquals("{\"action\":\"bookmark\",\"id\":275,\"value\":false}", PostInteractionProtocol.libraryStateBody(275, "bookmark", false))
        assertThrows(IllegalArgumentException::class.java) { PostInteractionProtocol.ratingPath(0) }
        assertThrows(IllegalArgumentException::class.java) { PostInteractionProtocol.libraryStateBody(0, "like", true) }
    }

    @Test
    fun fractionalClientIdIsRejectedRatherThanTruncated() {
        assertThrows(IllegalArgumentException::class.java) {
            PostIdMapping.clientId(null, 275.5, "4a4f04ae-3eef-4d86-bf14-2b61ce52a1a9")
        }
    }
}
