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

/** Native authentication backed by the CloudBase auth gateway and HEIKA APIs. */
@Singleton
class AuthRepository @Inject constructor(
    private val store: SecureSessionStore,
    private val api: Lazy<HeikaApi>,
    private val httpClient: OkHttpClient,
) {
    private val mutex = Mutex()
    private val mutableSession = MutableStateFlow<HeikaSession?>(null)
    private var restored = false
    private var cloudBaseGateway: String? = null
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
        val body = JSONObject().put("username", email.trim()).put("password", password)
        val json = execute(
            Request.Builder().url("${getCloudBaseGateway()}/auth/v1/signin")
                .post(body.toString().toRequestBody(JSON)).build(),
            "邮箱或密码不正确",
        )
        save(bootstrap(sessionFromCloudBase(json)))
    }

    suspend fun requestSignUpCode(email: String): String = withContext(Dispatchers.IO) {
        require(email.isNotBlank()) { "请输入邮箱" }
        val response = parseResponse(
            Request.Builder().url("${getCloudBaseGateway()}/auth/v1/verification")
                .post(JSONObject().put("email", email.trim()).toString().toRequestBody(JSON)).build(),
            "验证码发送失败，请稍后重试",
        ) as? JSONObject ?: JSONObject()
        response.optString("verification_id").takeIf(String::isNotBlank)
            ?: throw IOException(cloudBaseError(response, "验证码发送失败，请稍后重试"))
    }

    suspend fun signUpWithCode(
        email: String,
        password: String,
        nickname: String,
        code: String,
        verificationId: String,
    ) = withContext(Dispatchers.IO) {
        require(email.isNotBlank() && code.isNotBlank() && verificationId.isNotBlank()) { "请输入邮箱验证码" }
        val verified = execute(
            Request.Builder().url("${getCloudBaseGateway()}/auth/v1/verification/verify")
                .post(JSONObject().put("verification_id", verificationId).put("verification_code", code.trim())
                    .toString().toRequestBody(JSON)).build(),
            "验证码不正确或已过期，请重新获取",
        )
        val verificationToken = verified.optString("verification_token")
        if (verificationToken.isBlank()) throw IOException(cloudBaseError(verified, "验证码不正确或已过期，请重新获取"))

        val created = execute(
            Request.Builder().url("${getCloudBaseGateway()}/auth/v1/signup")
                .post(JSONObject()
                    .put("email", email.trim())
                    .put("password", password)
                    .put("username", email.trim())
                    .put("name", nickname.trim().ifBlank { email.substringBefore('@') })
                    .put("verification_code", code.trim())
                    .put("verification_token", verificationToken)
                    .toString().toRequestBody(JSON)).build(),
            "注册失败，请稍后重试",
        )
        val accessToken = created.optString("access_token")
        val refreshToken = created.optString("refresh_token")
        val session = if (accessToken.isNotBlank() && refreshToken.isNotBlank()) {
            sessionFromCloudBase(created)
        } else {
            val signedIn = execute(
                Request.Builder().url("${getCloudBaseGateway()}/auth/v1/signin")
                    .post(JSONObject().put("username", email.trim()).put("password", password)
                        .toString().toRequestBody(JSON)).build(),
                "账号已创建，请使用邮箱和密码登录",
            )
            sessionFromCloudBase(signedIn)
        }
        save(bootstrap(session.copy(userJson = session.userJson)))
    }

    suspend fun signUpWithPasswordFallback(email: String, password: String, nickname: String) = withContext(Dispatchers.IO) {
        require(email.isNotBlank()) { "请输入邮箱" }
        apiRequest(
            "/api/v1/auth/register",
            body = JSONObject().put("email", email.trim()).put("password", password).put("nickname", nickname.trim()),
        )
        signIn(email, password)
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
                val request = Request.Builder()
                    .url("${getCloudBaseGateway()}/auth/v1/token?grant_type=refresh_token")
                    .post(JSONObject().put("refresh_token", existing.refreshToken).toString().toRequestBody(JSON))
                    .build()
                val refreshed = sessionFromCloudBase(execute(request, "登录状态已失效"), existing)
                    .copy(userId = existing.userId)
                save(refreshed)
            }
        } catch (error: Exception) {
            if (error is CloudBaseHttpException && error.statusCode in setOf(400, 401, 403)) {
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

    private suspend fun getCloudBaseGateway(): String {
        cloudBaseGateway?.let { return it }
        val response = api.get().get("${BuildConfig.API_BASE_URL}/api/client-config")
        val raw = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val json = parseJson(raw)
        if (!response.isSuccessful) throw IOException(json.optString("error").ifBlank { "账号服务暂不可用" })
        val gateway = json.optString("gateway").trimEnd('/')
        require(gateway.startsWith("https://")) { "云开发网关配置无效" }
        return gateway.also { cloudBaseGateway = it }
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

    private fun execute(request: Request, fallback: String): JSONObject =
        parseResponse(request, fallback) as? JSONObject ?: JSONObject()

    private fun parseResponse(request: Request, fallback: String): Any? {
        val response = httpClient.newCall(request).execute()
        val raw = response.body?.use { it.string() }.orEmpty()
        val value = parseValue(raw)
        if (!response.isSuccessful) {
            val error = value as? JSONObject ?: JSONObject()
            val message = sequenceOf("error_description", "message", "msg", "error")
                .map { error.optString(it) }.firstOrNull { it.isNotBlank() }
            throw CloudBaseHttpException(response.code, message ?: fallback)
        }
        return value
    }

    private fun sessionFromCloudBase(json: JSONObject, fallback: HeikaSession? = null): HeikaSession {
        val user = json.optJSONObject("user") ?: JSONObject(fallback?.userJson ?: "{}")
        val accessToken = json.optString("access_token", fallback?.accessToken.orEmpty())
        val refreshToken = json.optString("refresh_token", fallback?.refreshToken.orEmpty())
        require(accessToken.isNotBlank() && refreshToken.isNotBlank()) { "云开发账号会话无效" }
        return HeikaSession(
            userId = fallback?.userId.orEmpty(),
            email = user.optString("email", fallback?.email.orEmpty()).takeIf(String::isNotBlank),
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtSeconds = json.optLong("expires_at", nowSeconds() + json.optLong("expires_in", 7200)),
            tokenType = json.optString("token_type", fallback?.tokenType ?: "bearer"),
            userJson = user.toString(),
        )
    }

    private fun cloudBaseError(json: JSONObject, fallback: String): String =
        sequenceOf("error_description", "error", "message", "code")
            .map { json.optString(it) }.firstOrNull(String::isNotBlank) ?: fallback

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

    private class CloudBaseHttpException(val statusCode: Int, message: String) : IOException(message)

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
