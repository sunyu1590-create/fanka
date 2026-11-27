package com.heika.nativeapp.data

object NativeCacheKeys {
    fun profile(userId: String) = "native-profile:$userId"
    fun messages(userId: String) = "native-messages:$userId"
    fun notifications(userId: String) = "native-notifications:$userId"
    fun postDetail(accountId: String, postKey: String) = "native-detail:$accountId:${postKey.removePrefix("client-")}"
    fun aiVersions(accountId: String, postId: String) = "native-ai-versions:$accountId:$postId"
    fun exploration(section: String, userId: String) = "native-exploration:$section:$userId"

    // Chat 2.0 caches always end with userId so the existing clearUserCache() query
    // (cacheKey LIKE '%userId') removes every account-specific entry on logout/switch.
    fun conversation(userId: String, conversationId: String) = "native-chat:$conversationId:$userId"
    fun conversationSettings(userId: String, conversationId: String) = "native-chat-settings:$conversationId:$userId"
}
