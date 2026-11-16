package com.heika.nativeapp.auth

import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.data.HeikaApi
import dagger.Lazy
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
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

/**
 * Native authentication backed by the Supabase auth endpoints exposed through
 * /api/client-config, plus the HEIKA APIs hosted on the same origin.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val store: SecureSessionStore,
    private val api: Lazy<HeikaApi>,
    private val httpClient: OkHttpClient,
) {
    private val mutex = Mutex()
    private val mutableSession = MutableStateFlow<HeikaSession?>(null)
    private var restored = false
    private var authConfig: AuthConfig? = null
    val session: StateFlow<HeikaSession?> = mutableSession.asStateFlow()

    suspend fun restore(): HeikaSession? = mutex.withLock {
        if (!restored) {
            mutableSession.value = store.read()
            restored = true
        }
        val existing = mutableSession.value ?: return@withLock null
        if (existing.expiresAtSeconds > nowSeconds() + 90) return@withLock existing
        refreshLocked(existing)
    }

    suspend fun currentToken(): String? = restore()?.accessToken

    suspend fun signIn(email: String, password: String) = withContext(Dispatchers.IO) {
        require(email.isNotBlank() && password.isNotEmpty()) { "请输入邮箱和密码" }
        val config = requireConfig()
        val body = JSONObject().put("email", email.trim().lowercase()).put("password", password)
        val json = authPost(config, "/auth/v1/token?grant_type=password", body, "邮箱或密码不正确")
        save(bootstrap(sessionFromAuth(json)))
    }

    /**
     * 当前后端（Supabase）注册无需先下发邮箱验证码，这里直接抛出可识别的
     * 状态，让界面层走"邮箱 + 密码直接建号"的分支。
     */
    suspend fun requestSignUpCode(email: String): String {
        require(email.isNotBlank()) { "请输入邮箱" }
        throw IOException("当前版本无需邮箱验证码，可直接创建账号")
    }

    suspend fun signUpWithCode(
        email: String,
        password: String,
        nickname: String,
        code: String,
        verificationId: String,
    ) = withContext(Dispatchers.IO) {
        signUpWithPasswordFallback(email, password, nickname)
    }

    suspend fun signUpWithPasswordFallback(email: String, password: String, nickname: String) = withContext(Dispatchers.IO) {
        require(email.isNotBlank()) { "请输入邮箱" }
        require(password.length >= 8) { "密码至少需要 8 位" }
        val target = email.trim().lowercase()
        val display = nickname.trim().ifBlank { target.substringBefore('@') }
        apiRequest(
            "/api/v1/auth/register",
            body = JSONObject().put("email", target).put("password", password).put("nickname", display),
        )
        signIn(target, password)
    }

    suspend fun recoverWithCode(email: String, code: String, password: String) = withContext(Dispatchers.IO) {
        require(email.isNotBlank() && code.isNotBlank()) { "请输入注册邮箱和账号恢复码" }
        require(password.length >= 8) { "新密码至少需要 8 位" }
        apiRequest(
            "/api/v1/auth/recover",
            body = JSONObject().put("email", email.trim()).put("code", code.trim()).put("password", password),
        )
        clearSession()
    }

    suspend fun signOut() = withContext(Dispatchers.IO) { clearSession() }

    suspend fun retryAfterUnauthorized(): String? = mutex.withLock {
        val existing = mutableSession.value ?: store.read() ?: return@withLock null
        refreshLocked(existing, force = true)?.accessToken
    }

    suspend fun current(): HeikaSession? = restore()

    private suspend fun refreshLocked(existing: HeikaSession, force: Boolean = false): HeikaSession? {
        if (!force && existing.expiresAtSeconds > nowSeconds() + 90) return existing
        return try {
            withContext(Dispatchers.IO) {
                val config = requireConfig()
                val body = JSONObject().put("refresh_token", existing.refreshToken)
                val refreshed = sessionFromAuth(
                    authPost(config, "/auth/v1/token?grant_type=refresh_token", body, "登录状态已失效"),
                    existing,
                ).copy(userId = existing.userId)
                save(refreshed)
            }
        } catch (error: Exception) {
            if (error is AuthHttpException && error.statusCode in setOf(400, 401, 403)) {
                clearSession()
                null
            } else {
                mutableSession.value = existing
                restored = true
                existing
            }
        }
    }

    private suspend fun bootstrap(session: HeikaSession): HeikaSession {
        val response = apiRequest("/api/v1/auth/bootstrap", token = session.accessToken, body = JSONObject()) as? JSONObject
        val uid = response?.optJSONObject("data")?.optString("uid").orEmpty()
        if (uid.isBlank()) throw IOException("账号身份同步失败，请稍后重试")
        return session.copy(userId = uid)
    }

    private suspend fun requireConfig(): AuthConfig {
        authConfig?.let { return it }
        val response = api.get().get("${BuildConfig.API_BASE_URL}/api/client-config")
        val raw = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val json = parseJson(raw)
        if (!response.isSuccessful) throw IOException(json.optString("error").ifBlank { "账号服务暂不可用" })
        val url = sequenceOf("url", "gateway").map { json.optString(it) }
            .firstOrNull { it.startsWith("https://") }
            ?.trimEnd('/')
            ?: throw IOException("账号服务地址配置无效")
        val key = json.optString("key").trim()
        if (key.isBlank()) throw IOException("账号服务密钥配置无效")
        return AuthConfig(url, key).also { authConfig = it }
    }

    private fun authPost(config: AuthConfig, path: String, body: JSONObject, fallback: String): JSONObject {
        val request = Request.Builder()
            .url("${config.url}$path")
            .header("apikey", config.key)
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .post(body.toString().toRequestBody(JSON))
            .build()
        return parseResponse(request, fallback) as? JSONObject ?: JSONObject()
    }

    private suspend fun apiRequest(path: String, token: String? = null, body: JSONObject? = null): Any? {
        val builder = Request.Builder().url("${BuildConfig.API_BASE_URL}$path").header("Accept", "application/json")
        token?.let { builder.header("Authorization", "Bearer $it") }
        if (body != null) {
            builder.header("Content-Type", "application/json")
                .post(body.toString().toRequestBody(JSON))
        } else builder.get()
        return parseResponse(builder.build(), "账号请求失败")
    }

    private fun parseResponse(request: Request, fallback: String): Any? {
        val response = httpClient.newCall(request).execute()
        val raw = response.body?.use { it.string() }.orEmpty()
        val value = parseValue(raw)
        if (!response.isSuccessful) {
            val error = value as? JSONObject ?: JSONObject()
            val message = sequenceOf("error_description", "msg", "message", "error")
                .map { error.optString(it) }.firstOrNull { it.isNotBlank() }
            throw AuthHttpException(response.code, message ?: fallback)
        }
        return value
    }

    private fun sessionFromAuth(json: JSONObject, fallback: HeikaSession? = null): HeikaSession {
        val user = json.optJSONObject("user") ?: JSONObject(fallback?.userJson ?: "{}")
        val accessToken = json.optString("access_token", fallback?.accessToken.orEmpty())
        val refreshToken = json.optString("refresh_token", fallback?.refreshToken.orEmpty())
        require(accessToken.isNotBlank() && refreshToken.isNotBlank()) { "账号会话无效，请重新登录" }
        return HeikaSession(
            userId = fallback?.userId.orEmpty(),
            email = user.optString("email", fallback?.email.orEmpty()).takeIf(String::isNotBlank),
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtSeconds = json.optLong("expires_at", nowSeconds() + json.optLong("expires_in", 3600)),
            tokenType = json.optString("token_type", fallback?.tokenType ?: "bearer"),
            userJson = user.toString(),
        )
    }

    private suspend fun save(session: HeikaSession): HeikaSession {
        store.write(session)
        restored = true
        mutableSession.value = session
        return session
    }

    private suspend fun clearSession() {
        store.clear()
        mutableSession.value = null
        restored = true
    }

    private fun parseJson(raw: String) = (parseValue(raw) as? JSONObject) ?: JSONObject()
    private fun parseValue(raw: String): Any? = if (raw.isBlank()) JSONObject() else runCatching {
        org.json.JSONTokener(raw).nextValue()
    }.getOrElse { JSONObject() }
    private fun nowSeconds() = System.currentTimeMillis() / 1000

    private data class AuthConfig(val url: String, val key: String)

    private class AuthHttpException(val statusCode: Int, message: String) : IOException(message)

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
