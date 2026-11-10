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

    /** Calls Supabase's existing Data API with the user's JWT, preserving RLS. */
    suspend fun dataApi(path: String, method: String = "GET", body: JSONObject? = null, prefer: String? = null): Any? = withContext(Dispatchers.IO) {
        require(path.startsWith("/") && !path.startsWith("//")) { "请求地址无效" }
        val session = restore() ?: throw IOException("请先登录后继续")
        val config = getConfig()
        val builder = Request.Builder().url("${config.url}/rest/v1$path")
            .header("apikey", config.key)
            .header("Authorization", "Bearer ${session.accessToken}")
            .header("Accept", "application/json")
            .method(method, if (method == "GET" || method == "HEAD") null else (body ?: JSONObject()).toString().toRequestBody(JSON))
        prefer?.let { builder.header("Prefer", it) }
        val request = builder.build()
        val response = httpClient.newCall(request).execute()
        val raw = response.body?.use { it.string() }.orEmpty()
        val value = if (raw.isBlank()) JSONObject() else runCatching { org.json.JSONTokener(raw).nextValue() }.getOrElse { JSONObject() }
        if (!response.isSuccessful) {
            val error = value as? JSONObject ?: JSONObject()
            val message = sequenceOf("message", "details", "hint")
                .map { error.optString(it) }
                .firstOrNull { it.isNotBlank() }
            val code = error.optString("code").takeIf(String::isNotBlank)
            val endpoint = path.substringBefore('?')
            val diagnostic = buildString {
                append("Supabase Data API ").append(method).append(" /rest/v1").append(endpoint)
                append(" 返回 HTTP ").append(response.code)
                code?.let { append(" [").append(it).append(']') }
                message?.let { append("：").append(it) }
            }
            throw SupabaseHttpException(response.code, diagnostic)
        }
        value
    }

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

    suspend fun signUp(email: String, password: String, nickname: String): Boolean = withContext(Dispatchers.IO) {
        require(password.length >= 8) { "密码至少需要 8 位" }
        require(nickname.trim().length in 2..24) { "昵称请填写 2–24 个字" }
        val config = getConfig()
        val body = JSONObject().put("email", email.trim()).put("password", password)
            .put("data", JSONObject().put("nickname", nickname.trim()))
        val json = execute(authRequest(config, "/auth/v1/signup", body, redirect = "${BuildConfig.API_BASE_URL}/"), "注册失败")
        val accessToken = json.optString("access_token")
        if (accessToken.isBlank()) return@withContext false
        val session = sessionFromSupabase(json)
        store.write(session)
        restored = true
        mutableSession.value = session
        true
    }

    suspend fun requestPasswordOtp(email: String) = withContext(Dispatchers.IO) {
        require(email.isNotBlank()) { "请输入邮箱" }
        val config = getConfig()
        execute(
            authRequest(config, "/auth/v1/recover", JSONObject().put("email", email.trim()), redirect = "${BuildConfig.API_BASE_URL}/?auth=reset"),
            "验证码发送失败",
        )
    }

    suspend fun verifyPasswordOtp(email: String, token: String) = withContext(Dispatchers.IO) {
        require(email.isNotBlank() && token.isNotBlank()) { "请输入邮箱验证码" }
        val config = getConfig()
        val json = execute(authRequest(config, "/auth/v1/verify", JSONObject().put("email", email.trim()).put("token", token.trim()).put("type", "recovery")), "邮箱验证失败")
        val session = sessionFromSupabase(json)
        store.write(session)
        restored = true
        mutableSession.value = session
        session
    }

    suspend fun updatePassword(password: String) = withContext(Dispatchers.IO) {
        require(password.length >= 8) { "新密码至少需要 8 位" }
        val session = restore() ?: throw IOException("验证状态已失效，请重新申请验证码")
        val config = getConfig()
        val request = Request.Builder()
            .url("${config.url}/auth/v1/user")
            .header("apikey", config.key)
            .header("Authorization", "Bearer ${session.accessToken}")
            .put(JSONObject().put("password", password).toString().toRequestBody(JSON))
            .build()
        execute(request, "密码更新失败")
        signOut()
    }

    suspend fun recoverWithCode(email: String, code: String, password: String) = withContext(Dispatchers.IO) {
        require(password.length >= 8) { "新密码至少需要 8 位" }
        val response = api.get().post(
            "${BuildConfig.API_BASE_URL}/api/v1/auth/recover",
            null,
            JSONObject().put("email", email.trim()).put("code", code.trim()).put("password", password).toString().toRequestBody(JSON),
        )
        val raw = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (raw.isBlank()) JSONObject() else JSONObject(raw)
        if (!response.isSuccessful) throw IOException(root.optString("error").ifBlank { "恢复码验证失败" })
        store.clear()
        mutableSession.value = null
        restored = true
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

    private fun authRequest(config: SupabasePublicConfig, path: String, body: JSONObject, redirect: String? = null): Request {
        val redirectQuery = redirect?.let {
            "?redirect_to=${java.net.URLEncoder.encode(it, Charsets.UTF_8.name())}"
        }.orEmpty()
        val builder = Request.Builder()
            .url("${config.url}$path$redirectQuery")
            .header("apikey", config.key)
            .post(body.toString().toRequestBody(JSON))
        return builder.build()
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
