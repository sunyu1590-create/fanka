package com.heika.nativeapp.feature.compat

import java.util.UUID

sealed interface HeikaDestination {
    data class CommunityPost(val id: Int) : HeikaDestination
    data class AiResource(val id: Int, val cloudId: String) : HeikaDestination
    data class UserProfile(val id: String) : HeikaDestination
    data object Messages : HeikaDestination
    data class Conversation(val id: String) : HeikaDestination
    data object MyPage : HeikaDestination
    data object Search : HeikaDestination
    data object Publish : HeikaDestination
    data object Settings : HeikaDestination
    data object WebsiteSettings : HeikaDestination
    data object Membership : HeikaDestination
    data object About : HeikaDestination
    data object Feedback : HeikaDestination
    data object Notifications : HeikaDestination
}

sealed interface DestinationTarget {
    data class Native(val route: String, val type: String) : DestinationTarget
    data class Compatibility(val path: String, val type: String, val id: String? = null) : DestinationTarget
    data class Invalid(val message: String) : DestinationTarget
}

/** Maps typed app destinations to the exact 2.40.7 deep-link contract. */
object DestinationResolver {
    fun resolve(destination: HeikaDestination): DestinationTarget = when (destination) {
        is HeikaDestination.CommunityPost -> if (destination.id > 0) {
            DestinationTarget.Compatibility("/?post=${destination.id}", "community_post", destination.id.toString())
        } else invalid("内容编号无效")
        is HeikaDestination.AiResource -> if (destination.id > 0 && isUuid(destination.cloudId)) {
            DestinationTarget.Compatibility("/?aiPost=${destination.id}&cloudId=${destination.cloudId.lowercase()}", "ai_resource", destination.cloudId.lowercase())
        } else invalid("AI 资源信息无效")
        is HeikaDestination.UserProfile -> if (isUuid(destination.id)) {
            DestinationTarget.Compatibility("/?profile=${destination.id.lowercase()}", "user_profile", destination.id.lowercase())
        } else invalid("用户主页地址无效")
        HeikaDestination.Messages -> compat("/?nativeTab=messages&nativeBottomBar=1", "messages")
        is HeikaDestination.Conversation -> if (isUuid(destination.id)) {
            DestinationTarget.Compatibility("/?nativeTab=messages&conversation=${destination.id.lowercase()}", "conversation", destination.id.lowercase())
        } else invalid("私信会话地址无效")
        HeikaDestination.MyPage -> compat("/?nativeTab=mine&nativeBottomBar=1", "my_page")
        HeikaDestination.Search -> compat("/?nativeTab=search", "search")
        HeikaDestination.Publish -> compat("/?nativeTab=publish", "publish")
        HeikaDestination.Settings -> DestinationTarget.Native("settings", "settings")
        HeikaDestination.WebsiteSettings -> compat("/?nativeTab=settings", "website_settings")
        HeikaDestination.Membership -> compat("/?nativeTab=membership", "membership")
        HeikaDestination.About -> DestinationTarget.Native("about", "about")
        HeikaDestination.Feedback -> compat("/?nativeTab=feedback", "feedback")
        HeikaDestination.Notifications -> DestinationTarget.Native("notifications", "notifications")
    }

    private fun compat(path: String, type: String) = DestinationTarget.Compatibility(path, type)
    private fun invalid(message: String) = DestinationTarget.Invalid(message)

    private fun isUuid(value: String): Boolean = runCatching {
        UUID.fromString(value).toString().equals(value, ignoreCase = true)
    }.getOrDefault(false)
}
