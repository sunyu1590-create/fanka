package com.heika.nativeapp.data

import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.ui.NativePreferences
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

/**
 * 账号级装扮同步。
 *
 * 规则与网页一致：
 * - 装扮属于账号设置，走 `/api/v1/decor/settings`；
 * - 同步失败时保留上次成功的结果，绝不清空用户已选的装扮；
 * - 每次回到前台检查一次，只有配置真的变了才更新原生渲染。
 */
@Singleton
class DecorRepository @Inject constructor(
    private val api: HeikaApi,
    private val auth: AuthRepository,
    private val prefs: NativePreferences,
) {
    private val _config = MutableStateFlow(DecorConfig.DEFAULT)
    val config: StateFlow<DecorConfig> = _config.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    private var restored = false
    private var lastSyncedAt = 0L

    /** 冷启动先读缓存，保证首帧就是用户上次的装扮，不会闪回默认。 */
    suspend fun restore() {
        if (restored) return
        restored = true
        prefs.decorJson()?.let { raw ->
            runCatching { DecorConfig.fromSettings(JSONObject(raw)) }
                .onSuccess { _config.value = it }
        }
    }

    /**
     * 拉取账号当前装扮。`force = false` 时 30 秒内不重复请求，
     * 避免每次返回前台都打一次网络。
     */
    suspend fun refresh(force: Boolean = false): Boolean {
        val now = System.currentTimeMillis()
        if (!force && now - lastSyncedAt < 30_000L) return true
        return try {
            val token = auth.currentToken()
            val response = api.get(BuildConfig.API_BASE_URL + "/api/v1/decor/settings", token)
            if (!response.isSuccessful) {
                response.errorBody()?.close()
                _lastError.value = "装扮同步失败（HTTP ${response.code()}）"
                return false
            }
            val raw = response.body()?.use { it.string() }.orEmpty()
            if (raw.isBlank()) return false
            val parsed = DecorConfig.fromSettings(JSONObject(raw))
            prefs.setDecorJson(raw)
            _config.value = parsed
            _lastError.value = null
            lastSyncedAt = now
            true
        } catch (cause: IOException) {
            _lastError.value = cause.message ?: "装扮同步失败"
            false
        } catch (cause: Exception) {
            _lastError.value = cause.message ?: "装扮同步失败"
            false
        }
    }

    /** 退出登录回到默认，避免下一位用户看到上一位的装扮。 */
    suspend fun reset() {
        _config.value = DecorConfig.DEFAULT
        prefs.setDecorJson(null)
        lastSyncedAt = 0L
    }

    fun invalidate() {
        lastSyncedAt = 0L
    }
}
