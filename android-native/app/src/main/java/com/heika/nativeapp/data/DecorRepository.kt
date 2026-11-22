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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/** 玩家工坊 / 我的投稿里的主题条目（服务端 decor_themes 契约）。 */
data class DecorThemeItem(
    val id: String,
    val title: String,
    val description: String,
    val origin: String,
    val kind: String,
    val authorName: String,
    val status: String,
    val tags: List<String>,
    /** 完整装扮配置 { bottomBar, card }，作者看最新稿、其他人看线上版。 */
    val config: JSONObject,
    val reviewNote: String?,
    val favorite: Boolean,
    val favoriteCount: Int,
    val installCount: Int,
    val mine: Boolean,
    val hasLiveVersion: Boolean,
)

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
    /** 本地有未同步到云端的修改时为 true，refresh() 不会用旧云端数据覆盖本地。 */
    private var localDirty = false

    /** 冷启动先读缓存，保证首帧就是用户上次的装扮，不会闪回默认。 */
    suspend fun restore() {
        if (restored) return
        restored = true
        prefs.decorJson()?.let { raw ->
            runCatching {
                val json = JSONObject(raw)
                // 如果上次本地修改未同步到云端，恢复 localDirty 防止旧云端数据覆盖
                localDirty = json.optBoolean("pendingSync", false)
                DecorConfig.fromSettings(json)
            }.onSuccess { _config.value = it }
        }
    }

    /**
     * 将配置立即应用到本地（持久化 + 更新渲染），不依赖网络。
     * 云端同步由 [saveSettings] 单独执行，失败不影响本地效果。
     */
    suspend fun applyLocal(config: DecorConfig) {
        _config.value = config
        localDirty = true
        val json = JSONObject()
            .put("bottomBar", config.bar.toJson())
            .put("card", config.card.toJson())
            .put("pendingSync", true)
        config.barThemeId?.let { json.put("bottomBarThemeId", it) }
        config.cardThemeId?.let { json.put("cardThemeId", it) }
        prefs.setDecorJson(json.toString())
    }

    /**
     * 拉取账号当前装扮。`force = false` 时 30 秒内不重复请求，
     * 避免每次返回前台都打一次网络。
     */
    suspend fun refresh(force: Boolean = false): Boolean {
        val now = System.currentTimeMillis()
        if (!force && now - lastSyncedAt < 30_000L) return true
        // 本地有未同步修改时不用旧云端数据覆盖本地（force 除外，如网页端强制同步）
        if (localDirty && !force) return true
        return try {
            val token = auth.currentToken()?.let { "Bearer $it" }
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
            localDirty = false
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
        localDirty = false
    }

    fun invalidate() {
        lastSyncedAt = 0L
    }

    /** 保存装扮配置到账号（与网页 saveDecor 同一契约）。成功后刷新本地渲染。 */
    suspend fun saveSettings(
        bottomBar: JSONObject? = null,
        card: JSONObject? = null,
        bottomBarThemeId: String? = null,
        cardThemeId: String? = null,
        clearBottomTheme: Boolean = false,
        clearCardTheme: Boolean = false,
    ): Boolean {
        return try {
            val token = auth.currentToken()?.let { "Bearer $it" }
            val body = JSONObject()
            bottomBar?.let { body.put("bottomBar", it) }
            card?.let { body.put("card", it) }
            if (clearBottomTheme) body.put("bottomBarThemeId", JSONObject.NULL)
            else bottomBarThemeId?.let { body.put("bottomBarThemeId", it) }
            if (clearCardTheme) body.put("cardThemeId", JSONObject.NULL)
            else cardThemeId?.let { body.put("cardThemeId", it) }
            val response = api.patch(
                BuildConfig.API_BASE_URL + "/api/v1/decor/settings",
                token,
                body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()),
            )
            if (!response.isSuccessful) {
                response.errorBody()?.close()
                _lastError.value = "装扮保存失败（HTTP ${response.code()}）"
                return false
            }
            val raw = response.body()?.use { it.string() }.orEmpty()
            if (raw.isNotBlank()) {
                prefs.setDecorJson(raw)
                _config.value = DecorConfig.fromSettings(JSONObject(raw))
                _lastError.value = null
                lastSyncedAt = System.currentTimeMillis()
                localDirty = false
            }
            true
        } catch (cause: Exception) {
            _lastError.value = cause.message ?: "装扮保存失败"
            false
        }
    }

    /** 主题列表：scope = official / community / mine / favorites（与网页一致）。 */
    suspend fun listThemes(scope: String, kind: String = "all", query: String = ""): List<DecorThemeItem> {
        val token = auth.currentToken()?.let { "Bearer $it" }
        val url = buildString {
            append(BuildConfig.API_BASE_URL).append("/api/v1/decor/themes?scope=").append(scope)
            append("&kind=").append(kind)
            if (query.isNotBlank()) append("&q=").append(java.net.URLEncoder.encode(query.trim(), "UTF-8"))
        }
        val response = api.get(url, token)
        if (!response.isSuccessful) {
            response.errorBody()?.close()
            throw IOException("主题列表加载失败（HTTP ${response.code()}）")
        }
        val raw = response.body()?.use { it.string() }.orEmpty()
        val root = JSONObject(raw)
        val items = (root.optJSONObject("data") ?: root).optJSONArray("items") ?: JSONArray()
        return (0 until items.length()).mapNotNull { index -> parseTheme(items.optJSONObject(index)) }
    }

    private fun parseTheme(node: JSONObject?): DecorThemeItem? {
        if (node == null) return null
        val tags = node.optJSONArray("tags")?.let { array -> (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) } }.orEmpty()
        // org.json 的 optString 对 JSON null 返回字符串 "null"，须显式过滤
        fun safe(key: String, fallback: String = ""): String =
            node.optString(key).takeIf { it.isNotBlank() && it != "null" } ?: fallback
        return DecorThemeItem(
            id = node.optString("id"),
            title = safe("title", "未命名主题"),
            description = safe("description"),
            origin = safe("origin"),
            kind = safe("kind", "bundle"),
            authorName = safe("authorName", "黑卡官方"),
            status = safe("status", "approved"),
            tags = tags,
            config = node.optJSONObject("config") ?: JSONObject(),
            reviewNote = safe("reviewNote").takeIf { it.isNotBlank() },
            favorite = node.optBoolean("favorite"),
            favoriteCount = node.optInt("favoriteCount"),
            installCount = node.optInt("installCount"),
            mine = node.optBoolean("mine"),
            hasLiveVersion = node.optBoolean("hasLiveVersion"),
        )
    }

    /** 收藏开关。返回最新计数；失败返回 null。 */
    suspend fun toggleFavorite(id: String, favorite: Boolean): Pair<Boolean, Int>? {
        return try {
            val token = auth.currentToken()?.let { "Bearer $it" }
            val body = JSONObject().put("favorite", favorite)
            val response = api.post(
                BuildConfig.API_BASE_URL + "/api/v1/decor/themes/$id/favorite",
                token,
                body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()),
            )
            if (!response.isSuccessful) {
                response.errorBody()?.close()
                return null
            }
            val raw = response.body()?.use { it.string() }.orEmpty()
            val root = JSONObject(raw)
            val json = root.optJSONObject("data") ?: root
            json.optBoolean("favorite", favorite) to json.optInt("favoriteCount")
        } catch (_: Exception) {
            null
        }
    }

    /** 撤回未上架的投稿。 */
    suspend fun deleteTheme(id: String): Boolean {
        return try {
            val token = auth.currentToken()?.let { "Bearer $it" }
            val response = api.delete(
                BuildConfig.API_BASE_URL + "/api/v1/decor/themes/$id",
                token,
                JSONObject().toString().toRequestBody("application/json; charset=utf-8".toMediaType()),
            )
            response.isSuccessful
        } catch (_: Exception) {
            false
        }
    }

    /** 从当前方案投稿。返回新主题条目；失败抛出带原因的异常。 */
    suspend fun submitTheme(title: String, description: String, tags: List<String>, kind: String, config: JSONObject): DecorThemeItem {
        val token = auth.currentToken()?.let { "Bearer $it" }
        val body = JSONObject()
            .put("title", title)
            .put("description", description)
            .put("tags", JSONArray(tags))
            .put("kind", kind)
            .put("config", config)
        val response = api.post(
            BuildConfig.API_BASE_URL + "/api/v1/decor/themes",
            token,
            body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()),
        )
        val raw = response.body()?.use { it.string() }.orEmpty()
        if (!response.isSuccessful) {
            response.errorBody()?.close()
            val message = runCatching { JSONObject(raw).optString("error") }.getOrNull().orEmpty()
            throw IOException(message.ifBlank { "投稿失败（HTTP ${response.code()}）" })
        }
        val root = JSONObject(raw)
        return parseTheme(root.optJSONObject("data") ?: root)
            ?: throw IOException("投稿结果无法解析")
    }

    /** 上传装扮资源（icon / card-back / content-image / publish-icon），返回公网地址。 */
    suspend fun uploadAsset(bytes: ByteArray, fileName: String, mimeType: String, kind: String): String {
        val token = auth.currentToken()?.let { "Bearer $it" }
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("kind", kind)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
            .build()
        val response = api.post(BuildConfig.API_BASE_URL + "/api/v1/decor/upload", token, body)
        val raw = response.body()?.use { it.string() }.orEmpty()
        if (!response.isSuccessful) {
            response.errorBody()?.close()
            val message = runCatching { JSONObject(raw).optString("error") }.getOrNull().orEmpty()
            throw IOException(message.ifBlank { "资源上传失败（HTTP ${response.code()}）" })
        }
        val root = JSONObject(raw)
        return (root.optJSONObject("data") ?: root).optString("url")
            .takeIf { it.isNotBlank() } ?: throw IOException("上传结果缺少资源地址")
    }
}
