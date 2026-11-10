package com.heika.nativeapp.data

import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class NativeCacheKeysTest {
    @Test
    fun accountScopedSnapshotsNeverShareKeys() {
        val accountA = "account-a"
        val accountB = "account-b"
        assertNotEquals(NativeCacheKeys.profile(accountA), NativeCacheKeys.profile(accountB))
        assertNotEquals(NativeCacheKeys.messages(accountA), NativeCacheKeys.messages(accountB))
        assertNotEquals(NativeCacheKeys.notifications(accountA), NativeCacheKeys.notifications(accountB))
        assertNotEquals(NativeCacheKeys.exploration("calendar-2026-11", accountA), NativeCacheKeys.exploration("calendar-2026-11", accountB))
    }

    @Test
    fun snapshotsAlsoIncludeTheirPageOrResourceParameters() {
        assertNotEquals(NativeCacheKeys.exploration("calendar-2026-11", "account-a"), NativeCacheKeys.exploration("calendar-2026-12", "account-a"))
        assertNotEquals(NativeCacheKeys.aiVersions("account-a", "post-a"), NativeCacheKeys.aiVersions("account-a", "post-b"))
        assertEquals(NativeCacheKeys.postDetail("account-a", "client-38"), NativeCacheKeys.postDetail("account-a", "38"))
        assertNotEquals(NativeCacheKeys.postDetail("account-a", "38"), NativeCacheKeys.postDetail("account-b", "38"))
    }
}
