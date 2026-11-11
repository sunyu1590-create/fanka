package com.heika.nativeapp.data

import org.json.JSONObject

/** Native and website protocol uses the numeric posts.client_id for these routes. */
object PostInteractionProtocol {
    fun ratingPath(clientId: Int): String {
        require(clientId > 0) { "内容编号无效" }
        return "/api/v1/posts/$clientId/rating"
    }

    fun ratingStatePath(clientId: Int): String = ratingPath(clientId)

    fun libraryStateBody(clientId: Int, action: String, value: Boolean): String {
        require(clientId > 0) { "内容编号无效" }
        require(action == "like" || action == "bookmark")
        return JSONObject().put("action", action).put("id", clientId).put("value", value).toString()
    }
}
