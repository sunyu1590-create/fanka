package com.heika.nativeapp.feature.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DestinationResolverTest {
    private val uuid = "e5d8c3d2-cdc1-4d8e-9d18-a8823a7035d2"

    @Test
    fun communityAndAiPostsResolveToNativeDetailRoutes() {
        val community = DestinationResolver.resolve(HeikaDestination.CommunityPost(42)) as DestinationTarget.Native
        val linkedCommunity = DestinationResolver.resolve(HeikaDestination.CommunityPost(42, uuid)) as DestinationTarget.Native
        val cloudOnlyCommunity = DestinationResolver.resolve(HeikaDestination.CommunityPost(0, uuid)) as DestinationTarget.Native
        val ai = DestinationResolver.resolve(HeikaDestination.AiResource(42, uuid)) as DestinationTarget.Native
        assertEquals("post/client-42", community.route)
        assertEquals("post/$uuid", linkedCommunity.route)
        assertEquals("post/$uuid", cloudOnlyCommunity.route)
        assertEquals("post/$uuid", ai.route)
        assertEquals("community_post", linkedCommunity.type)
        assertEquals("ai_resource", ai.type)
    }

    @Test
    fun coreBusinessDestinationsResolveToNativeRoutes() {
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
        ).map { DestinationResolver.resolve(it) as DestinationTarget.Native }
        assertEquals(
            listOf(
                "messages",
                "conversation/$uuid",
                "profile",
                "search",
                "publish",
                "settings",
                "membership",
                "feedback",
                "user/$uuid",
            ),
            targets.map { it.route },
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
