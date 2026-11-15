package com.heika.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class ImageCacheKeysTest {
    @Test
    fun rotatingSignedQueryKeepsDiskCacheIdentity() {
        val first = imageCacheKey("post-1", "https://moonclean.shop/media/a-480.webp?token=old", "feed-thumb")
        val refreshed = imageCacheKey("post-1", "https://moonclean.shop/media/a-480.webp?token=new", "feed-thumb")
        assertEquals(first, refreshed)
    }

    @Test
    fun aChangedMediaPathInvalidatesPreviousImage() {
        val first = imageCacheKey("post-1", "https://moonclean.shop/media/a-480.webp?token=old", "feed-thumb")
        val updated = imageCacheKey("post-1", "https://moonclean.shop/media/b-480.webp?token=old", "feed-thumb")
        assertNotEquals(first, updated)
    }

    @Test
    fun imageVariantsUseIndependentCacheEntries() {
        val image = "https://moonclean.shop/media/a.webp?token=current"
        val thumbnail = imageCacheKey("post-1", image, "feed-thumb")
        val original = imageCacheKey("post-1", image, "detail-full-0")
        assertNotEquals(thumbnail, original)
    }
}
