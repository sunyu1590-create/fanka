package com.heika.nativeapp.auth

import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.data.HeikaApi
import dagger.Lazy
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import kotlinx.coroutines.Dispatchers

@Singleton
class AuthRepository @Inject constructor(
    private val store: SecureSessionStore,
    private val api: Lazy<HeikaApi>,
    private val httpClient: OkHttpClient,
) {
    private val mutex = Mutex()
    private val mutableSession = MutableStateFlow<HeikaSession?>(null)
    private var restored = false
    private var authConfig: SupabasePublicConfig? = null
    val session: StateFlow<HeikaSession?> = mutableSession.asStateFlow()

    suspend fun restore(): HeikaSession? = mutex.withLock {
        if (!restored) {
            mutableSession.value = store.read()
            restored = true
        }
        val existing = mutableSession.value ?: return@withLock null
        if (existing.expiresAtSeconds > System.currentTimeMillis() / 1000 + 90) return@withLock existing
        refreshLocked(existing)
    }

    suspend fun currentToken(): String? = restore()?.accessToken

    suspend fun signIn(email: String, password: String) = withContext(Dispatchers.IO) {
        require(email.isNotBlank() && password.isNotEmpty()) { "请输入邮箱和密码" }
        val config = getConfig()
        val body = JSONObject().put("email", email.trim()).put("password", password)
        val request = Request.Builder()
            .url("${config.url}/auth/v1/token?grant_type=password")
            .header("apikey", config.key)
            .post(body.toString().toRequestBody(JSON))
            .build()
        val json = execute(request, "登录失败")
        val session = sessionFromSupabase(json)
        store.write(session)
        restored = true
        mutableSession.value = session
        session
    }

    suspend fun signOut() = withContext(Dispatchers.IO) {
        val existing = restore()
        try {
            if (existing != null) {
                val config = getConfig()
                val request = Request.Builder()
                    .url("${config.url}/auth/v1/logout")
                    .header("apikey", config.key)
                    .header("Authorization", "Bearer ${existing.accessToken}")
                    .post("".toRequestBody(JSON))
                    .build()
                httpClient.newCall(request).execute().close()
            }
        } finally {
            store.clear()
            mutableSession.value = null
            restored = true
        }
    }

    suspend fun retryAfterUnauthorized(): String? = mutex.withLock {
        val existing = mutableSession.value ?: store.read() ?: return@withLock null
        refreshLocked(existing, force = true)?.accessToken
    }

    suspend fun current(): HeikaSession? = restore()

    suspend fun compatBootstrap(): Pair<String, String>? {
        val session = restore() ?: return null
        val key = compatStorageKey()
        val value = JSONObject()
            .put("access_token", session.accessToken)
            .put("token_type", session.tokenType)
            .put("expires_in", (session.expiresAtSeconds - System.currentTimeMillis() / 1000).coerceAtLeast(0))
            .put("expires_at", session.expiresAtSeconds)
            .put("refresh_token", session.refreshToken)
            .put("user", JSONObject(session.userJson))
            .toString()
        return key to value
    }

    suspend fun compatStorageKey(): String {
        val config = getConfig()
        val projectRef = config.url.removePrefix("https://").substringBefore('/').substringBefore('.')
        require(projectRef.isNotBlank()) { "账号服务配置无效" }
        return "sb-$projectRef-auth-token"
    }

    /** Accept only a session read back from the allow-listed first-party WebView. */
    suspend fun importCompatSession(sessionJson: String) = withContext(Dispatchers.IO) {
        if (sessionJson.isBlank() || sessionJson == "null") {
            if (mutableSession.value != null) {
                store.clear()
                mutableSession.value = null
                restored = true
            }
            return@withContext
        }
        val incoming = runCatching { sessionFromSupabase(JSONObject(sessionJson)) }.getOrNull() ?: return@withContext
        val existing = mutableSession.value ?: store.read()
        if (existing != null && existing.userId == incoming.userId && incoming.expiresAtSeconds < existing.expiresAtSeconds) return@withContext
        store.write(incoming)
        restored = true
        mutableSession.value = incoming
    }

    private suspend fun refreshLocked(existing: HeikaSession, force: Boolean = false): HeikaSession? {
        if (!force && existing.expiresAtSeconds > System.currentTimeMillis() / 1000 + 90) return existing
        return try {
            withContext(Dispatchers.IO) {
                val config = getConfig()
                val body = JSONObject().put("refresh_token", existing.refreshToken)
                val request = Request.Builder()
                    .url("${config.url}/auth/v1/token?grant_type=refresh_token")
                    .header("apikey", config.key)
                    .post(body.toString().toRequestBody(JSON))
                    .build()
                val refreshed = sessionFromSupabase(execute(request, "登录状态已失效"), fallback = existing)
                store.write(refreshed)
                mutableSession.value = refreshed
                restored = true
                refreshed
            }
        } catch (error: Exception) {
            // Keep a valid refresh credential across transient network failures. Only
            // definitive Supabase auth responses should turn the local session into logout.
            if (error is SupabaseHttpException && error.statusCode in setOf(400, 401, 403)) {
                store.clear()
                mutableSession.value = null
                restored = true
                null
            } else {
                mutableSession.value = existing
                restored = true
                existing
            }
        }
    }

    private suspend fun getConfig(): SupabasePublicConfig {
        authConfig?.let { return it }
        val response = api.get().get("${BuildConfig.API_BASE_URL}/api/client-config")
        val json = response.body()?.use { JSONObject(it.string()) } ?: JSONObject()
        if (!response.isSuccessful) throw IOException(json.optString("error", "账号服务暂不可用"))
        val url = json.optString("url").trimEnd('/')
        val key = json.optString("key")
        require(url.startsWith("https://") && key.isNotBlank() && !key.startsWith("sb_secret_")) {
            "账号服务配置无效"
        }
        return SupabasePublicConfig(url, key).also { authConfig = it }
    }

    private fun execute(request: Request, fallback: String): JSONObject {
        val response = httpClient.newCall(request).execute()
        val json = response.body?.use { JSONObject(it.string()) } ?: JSONObject()
        if (!response.isSuccessful) {
            val message = sequenceOf("msg", "message", "error_description", "error")
                .map { json.optString(it) }
                .firstOrNull { it.isNotBlank() }
            throw SupabaseHttpException(response.code, message ?: fallback)
        }
        return json
    }

    private fun sessionFromSupabase(json: JSONObject, fallback: HeikaSession? = null): HeikaSession {
        val user = json.optJSONObject("user") ?: JSONObject(fallback?.userJson ?: "{}")
        val expiresIn = json.optLong("expires_in", 3600)
        return HeikaSession(
            userId = user.optString("id", fallback?.userId ?: ""),
            email = user.optString("email", fallback?.email.orEmpty()).takeIf(String::isNotBlank),
            accessToken = json.optString("access_token", fallback?.accessToken.orEmpty()),
            refreshToken = json.optString("refresh_token", fallback?.refreshToken.orEmpty()),
            expiresAtSeconds = json.optLong("expires_at", System.currentTimeMillis() / 1000 + expiresIn),
            tokenType = json.optString("token_type", fallback?.tokenType ?: "bearer"),
            userJson = user.toString(),
        ).also { require(it.userId.isNotBlank() && it.accessToken.isNotBlank() && it.refreshToken.isNotBlank()) { "账号会话无效" } }
    }

    private data class SupabasePublicConfig(val url: String, val key: String)

    private class SupabaseHttpException(val statusCode: Int, message: String) : IOException(message)

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
