package com.heika.nativeapp.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class HeikaPostIdMappingTest {
    @Test
    fun detailPayloadKeepsDatabaseUuidAndNumericClientIdSeparate() {
        val uuid = "4a4f04ae-3eef-4d86-bf14-2b61ce52a1a9"
        val post = HeikaPost.from(JSONObject().put("id", uuid).put("client_id", 275).put("title", "test"))
        assertEquals(275, post.id)
        assertEquals(uuid, post.cloudId)
    }

    @Test
    fun uuidWithoutClientIdIsRejectedInsteadOfBecomingZero() {
        assertThrows(IllegalArgumentException::class.java) {
            HeikaPost.from(JSONObject().put("id", "4a4f04ae-3eef-4d86-bf14-2b61ce52a1a9"))
        }
    }

    @Test
    fun numericLegacyIdRemainsTheClientId() {
        val post = HeikaPost.from(JSONObject().put("id", 18))
        assertEquals(18, post.id)
        assertTrue(post.cloudId.isBlank())
    }

    @Test
    fun ratingAndLibraryStateUseNumericClientIdInWebsiteProtocol() {
        assertEquals("/api/v1/posts/275/rating", PostInteractionProtocol.ratingPath(275))
        assertEquals("/api/v1/posts/275/rating", PostInteractionProtocol.ratingStatePath(275))
        val like = JSONObject(PostInteractionProtocol.libraryStateBody(275, "like", true))
        assertEquals(275, like.getInt("id"))
        assertEquals("like", like.getString("action"))
        val bookmark = JSONObject(PostInteractionProtocol.libraryStateBody(275, "bookmark", false))
        assertEquals(275, bookmark.getInt("id"))
        assertEquals("bookmark", bookmark.getString("action"))
        assertThrows(IllegalArgumentException::class.java) { PostInteractionProtocol.ratingPath(0) }
        assertThrows(IllegalArgumentException::class.java) { PostInteractionProtocol.libraryStateBody(0, "like", true) }
    }

    @Test
    fun fractionalClientIdIsRejectedRatherThanTruncated() {
        assertThrows(IllegalArgumentException::class.java) {
            HeikaPost.from(JSONObject().put("id", "4a4f04ae-3eef-4d86-bf14-2b61ce52a1a9").put("client_id", 275.5))
        }
    }
}
