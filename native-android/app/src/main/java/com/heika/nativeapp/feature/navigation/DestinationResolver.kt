package com.heika.nativeapp.feature.navigation

import java.util.UUID

sealed interface HeikaDestination {
    data class CommunityPost(val id: Int, val cloudId: String? = null) : HeikaDestination
    data class AiResource(val id: Int, val cloudId: String) : HeikaDestination
    data class UserProfile(val id: String) : HeikaDestination
    data class StartConversation(val userId: String) : HeikaDestination
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
    data class Invalid(val message: String) : DestinationTarget
}

/** Resolves business destinations to the Native 3.0 Compose navigation graph. */
object DestinationResolver {
    fun resolve(destination: HeikaDestination): DestinationTarget = when (destination) {
        is HeikaDestination.CommunityPost -> if (destination.cloudId?.let(::isUuid) == true) {
            native("post/${destination.cloudId.lowercase()}", "community_post")
        } else if (destination.id > 0) {
            val key = "client-${destination.id}"
            native("post/${key}", "community_post")
        } else invalid("内容编号无效")
        is HeikaDestination.AiResource -> if (destination.id > 0 && isUuid(destination.cloudId)) {
            native("post/${destination.cloudId.lowercase()}", "ai_resource")
        } else invalid("AI 资源信息无效")
        is HeikaDestination.UserProfile -> if (isUuid(destination.id)) {
            native("user/${destination.id.lowercase()}", "user_profile")
        } else invalid("用户主页地址无效")
        is HeikaDestination.StartConversation -> if (isUuid(destination.userId)) {
            native("new-conversation/${destination.userId.lowercase()}", "new_conversation")
        } else invalid("聊天对象无效")
        HeikaDestination.Messages -> native("messages", "messages")
        is HeikaDestination.Conversation -> if (isUuid(destination.id)) {
            native("conversation/${destination.id.lowercase()}", "conversation")
        } else invalid("私信会话地址无效")
        HeikaDestination.MyPage -> native("profile", "my_page")
        HeikaDestination.Search -> native("search", "search")
        HeikaDestination.Publish -> native("publish", "publish")
        HeikaDestination.Settings -> DestinationTarget.Native("settings", "settings")
        HeikaDestination.WebsiteSettings -> native("settings", "website_settings")
        HeikaDestination.Membership -> native("membership", "membership")
        HeikaDestination.About -> DestinationTarget.Native("about", "about")
        HeikaDestination.Feedback -> native("feedback", "feedback")
        HeikaDestination.Notifications -> DestinationTarget.Native("notifications", "notifications")
    }

    private fun native(route: String, type: String) = DestinationTarget.Native(route, type)
    private fun invalid(message: String) = DestinationTarget.Invalid(message)

    private fun isUuid(value: String): Boolean = runCatching {
        UUID.fromString(value).toString().equals(value, ignoreCase = true)
    }.getOrDefault(false)
}
