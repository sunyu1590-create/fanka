package com.heika.nativeapp.auth

import org.json.JSONObject

data class HeikaSession(
    val userId: String,
    val email: String?,
    val accessToken: String,
    val refreshToken: String,
    val expiresAtSeconds: Long,
    val tokenType: String = "bearer",
    val userJson: String = "{}",
) {
    fun toJson(): String = JSONObject()
        .put("userId", userId)
        .put("email", email)
        .put("accessToken", accessToken)
        .put("refreshToken", refreshToken)
        .put("expiresAtSeconds", expiresAtSeconds)
        .put("tokenType", tokenType)
        .put("userJson", userJson)
        .toString()

    companion object {
        fun fromJson(value: String): HeikaSession {
            val json = JSONObject(value)
            return HeikaSession(
                userId = json.getString("userId"),
                email = json.optString("email").takeIf(String::isNotBlank),
                accessToken = json.getString("accessToken"),
                refreshToken = json.getString("refreshToken"),
                expiresAtSeconds = json.getLong("expiresAtSeconds"),
                tokenType = json.optString("tokenType", "bearer"),
                userJson = json.optString("userJson", "{}"),
            )
        }
    }
}
