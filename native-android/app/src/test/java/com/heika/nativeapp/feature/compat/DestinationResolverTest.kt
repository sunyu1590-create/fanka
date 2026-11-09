package com.heika.nativeapp.feature.compat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DestinationResolverTest {
    private val uuid = "e5d8c3d2-cdc1-4d8e-9d18-a8823a7035d2"

    @Test
    fun communityAndAiPostsRemainDistinct() {
        val community = DestinationResolver.resolve(HeikaDestination.CommunityPost(42)) as DestinationTarget.Compatibility
        val ai = DestinationResolver.resolve(HeikaDestination.AiResource(42, uuid)) as DestinationTarget.Compatibility
        assertEquals("/?post=42", community.path)
        assertEquals("/?aiPost=42&cloudId=$uuid", ai.path)
        assertTrue(community.path != ai.path)
    }

    @Test
    fun allExistingCompatibilityTargetsHaveExplicitRoutes() {
        val targets = listOf(
            HeikaDestination.Messages,
            HeikaDestination.Conversation(uuid),
            HeikaDestination.MyPage,
            HeikaDestination.Search,
            HeikaDestination.Publish,
            HeikaDestination.WebsiteSettings,
            HeikaDestination.Membership,
            HeikaDestination.Feedback,
            HeikaDestination.UserProfile(uuid),
        ).map { DestinationResolver.resolve(it) as DestinationTarget.Compatibility }
        assertEquals(
            listOf(
                "/?nativeTab=messages&nativeBottomBar=1",
                "/?nativeTab=messages&conversation=$uuid",
                "/?nativeTab=mine&nativeBottomBar=1",
                "/?nativeTab=search",
                "/?nativeTab=publish",
                "/?nativeTab=settings",
                "/?nativeTab=membership",
                "/?nativeTab=feedback",
                "/?profile=$uuid",
            ),
            targets.map { it.path },
        )
    }

    @Test
    fun nativeRoutesStayNativeAndInvalidTargetsFailExplicitly() {
        assertEquals(DestinationTarget.Native("settings", "settings"), DestinationResolver.resolve(HeikaDestination.Settings))
        assertEquals(DestinationTarget.Native("about", "about"), DestinationResolver.resolve(HeikaDestination.About))
        assertEquals(DestinationTarget.Native("notifications", "notifications"), DestinationResolver.resolve(HeikaDestination.Notifications))
        assertTrue(DestinationResolver.resolve(HeikaDestination.CommunityPost(0)) is DestinationTarget.Invalid)
        assertTrue(DestinationResolver.resolve(HeikaDestination.UserProfile("not-a-uuid")) is DestinationTarget.Invalid)
    }
}
