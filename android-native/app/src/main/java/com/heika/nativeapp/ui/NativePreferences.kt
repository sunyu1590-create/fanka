package com.heika.nativeapp.ui

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import org.json.JSONObject

private val Context.userPrefs by preferencesDataStore("heika_native_preferences")

@Singleton
class NativePreferences @Inject constructor(@ApplicationContext context: Context) {
    private val dataStore = context.userPrefs
    private val themeKey = stringPreferencesKey("theme")
    private val imageCacheKey = intPreferencesKey("image_cache_mb")
    private val feedLayoutKey = stringPreferencesKey("feed_layout")
    private val readingModeKey = stringPreferencesKey("reading_mode")
    private val pageTransitionKey = stringPreferencesKey("page_transition")
    private val fontChoiceKey = stringPreferencesKey("font_choice")
    private val bodyTextSizeKey = stringPreferencesKey("body_text_size")
    private val titleTextSizeKey = stringPreferencesKey("title_text_size")
    private val searchHistoryKey = stringPreferencesKey("search_history")
    private val networkNoticeVersionKey = stringPreferencesKey("network_notice_seen_version")
    private val skippedUpdateCodeKey = intPreferencesKey("skipped_update_code")
    private val decorKey = stringPreferencesKey("decor_config")
    private val decorDraftKey = stringPreferencesKey("decor_working_draft")
    private val homeBannersKey = stringPreferencesKey("home_banners_payload")
    /** 阅读进度：{ "postId": {"u": userId, "f": 0.42, "t": 时间戳} }，按用户隔离。 */
    private val readingProgressKey = stringPreferencesKey("reading_progress")

    val theme: Flow<String> = dataStore.data.map { it[themeKey] ?: "system" }
    val imageCacheMb: Flow<Int> = dataStore.data.map { it[imageCacheKey] ?: 256 }
    val feedLayout: Flow<String> = dataStore.data.map { it[feedLayoutKey] ?: "waterfall" }
    val readingMode: Flow<String> = dataStore.data.map { it[readingModeKey] ?: "standard" }
    val pageTransition: Flow<String> = dataStore.data.map { value ->
        HeikaPageTransitions.normalize(value[pageTransitionKey].orEmpty())
    }
    /** Only fonts present in the APK may appear as choices. */
    val fontChoice: Flow<String> = dataStore.data.map { value ->
        HeikaFontCatalog.normalize(value[fontChoiceKey].orEmpty())
    }
    val bodyTextSize: Flow<String> = dataStore.data.map { value ->
        HeikaReadingSizes.normalize(value[bodyTextSizeKey].orEmpty())
    }
    val titleTextSize: Flow<String> = dataStore.data.map { value ->
        HeikaReadingSizes.normalize(value[titleTextSizeKey].orEmpty())
    }
    val searchHistory: Flow<List<String>> = dataStore.data.map { values ->
        runCatching {
            val saved = JSONArray(values[searchHistoryKey].orEmpty())
            buildList { for (index in 0 until saved.length()) add(saved.optString(index)) }
                .filter(String::isNotBlank).distinct().take(8)
        }.getOrDefault(emptyList())
    }

    suspend fun setTheme(theme: String) { dataStore.edit { it[themeKey] = theme } }
    suspend fun setImageCacheMb(value: Int) { dataStore.edit { it[imageCacheKey] = value.coerceIn(256, 512) } }

    /** 上次成功同步到的装扮配置，冷启动时先读它，避免底栏闪回默认样式。 */
    suspend fun decorJson(): String? = dataStore.data.map { it[decorKey] }.first()

    suspend fun setDecorJson(value: String?) {
        dataStore.edit { prefs ->
            if (value.isNullOrBlank()) prefs.remove(decorKey) else prefs[decorKey] = value
        }
    }

    /** 装扮工作室里「还没点应用」的编辑态：退出页面不该丢，下次进来接着改。 */
    suspend fun decorDraftJson(): String? = dataStore.data.map { it[decorDraftKey] }.first()

    suspend fun setDecorDraftJson(value: String?) {
        dataStore.edit { prefs ->
            if (value.isNullOrBlank()) prefs.remove(decorDraftKey) else prefs[decorDraftKey] = value
        }
    }
    suspend fun setFeedLayout(value: String) { dataStore.edit { it[feedLayoutKey] = if (value == "single") "single" else "waterfall" } }
    suspend fun setReadingMode(value: String) { dataStore.edit { it[readingModeKey] = value.takeIf { it in setOf("standard", "focus", "night") } ?: "standard" } }
    suspend fun setPageTransition(value: String) { dataStore.edit { it[pageTransitionKey] = HeikaPageTransitions.normalize(value) } }
    suspend fun setFontChoice(value: String) { dataStore.edit { it[fontChoiceKey] = HeikaFontCatalog.normalize(value) } }
    suspend fun setBodyTextSize(value: String) { dataStore.edit { it[bodyTextSizeKey] = HeikaReadingSizes.normalize(value) } }
    suspend fun setTitleTextSize(value: String) { dataStore.edit { it[titleTextSizeKey] = HeikaReadingSizes.normalize(value) } }
    suspend fun addRecentSearch(value: String) {
        val term = value.trim().take(60)
        if (term.isBlank()) return
        dataStore.edit { values ->
            val previous = runCatching {
                val saved = JSONArray(values[searchHistoryKey].orEmpty())
                buildList { for (index in 0 until saved.length()) add(saved.optString(index)) }
            }.getOrDefault(emptyList())
            values[searchHistoryKey] = JSONArray((listOf(term) + previous.filterNot { it.equals(term, ignoreCase = true) }).take(8)).toString()
        }
    }
    /** 删除单条搜索历史：只影响这一条，其余顺序保持不变。 */
    suspend fun removeRecentSearch(value: String) {
        val term = value.trim()
        if (term.isBlank()) return
        dataStore.edit { values ->
            val previous = runCatching {
                val saved = JSONArray(values[searchHistoryKey].orEmpty())
                buildList { for (index in 0 until saved.length()) add(saved.optString(index)) }
            }.getOrDefault(emptyList())
            values[searchHistoryKey] = JSONArray(previous.filterNot { it.equals(term, ignoreCase = true) }).toString()
        }
    }
    suspend fun clearRecentSearches() { dataStore.edit { it.remove(searchHistoryKey) } }
    suspend fun hasSeenNetworkNotice(version: String): Boolean =
        dataStore.data.map { it[networkNoticeVersionKey] == version }.first()
    suspend fun markNetworkNoticeSeen(version: String) {
        dataStore.edit { it[networkNoticeVersionKey] = version }
    }

    /** 用户点过「稍后」的版本号，避免同一版本反复提示。 */
    suspend fun skippedUpdateCode(): Int = dataStore.data.map { it[skippedUpdateCodeKey] ?: 0 }.first()
    suspend fun markUpdateSkipped(code: Int) {
        dataStore.edit { it[skippedUpdateCodeKey] = code }
    }


    /** 首页推荐位的最近一次有效配置：网络异常时用它兜底，避免首页出现空洞。 */
    val homeBanners: Flow<String?> = dataStore.data.map { it[homeBannersKey] }

    suspend fun saveHomeBanners(payload: String) {
        dataStore.edit { it[homeBannersKey] = payload }
    }

    /**
     * 读取上一篇作品的进度。账号不同就当作没有记录，避免换号后跳到别人的位置。
     * 只存相对进度（0–1），正文改版导致长度变化时仍然落在合理位置。
     */
    suspend fun readingProgress(postId: String, userId: String?): Float? {
        val raw = dataStore.data.map { it[readingProgressKey] }.first() ?: return null
        val entry = runCatching { JSONObject(raw).optJSONObject(postId) }.getOrNull() ?: return null
        if (entry.optString("u") != (userId ?: "")) return null
        val fraction = entry.optDouble("f", -1.0)
        return fraction.takeIf { it in 0.02..0.985 }?.toFloat()
    }

    /** 写入阅读进度：节流由调用方负责，这里只做容量控制，避免无限增长。 */
    suspend fun saveReadingProgress(postId: String, userId: String?, fraction: Float) {
        if (postId.isBlank()) return
        dataStore.edit { prefs ->
            val root = runCatching { JSONObject(prefs[readingProgressKey].orEmpty()) }.getOrDefault(JSONObject())
            root.put(postId, JSONObject().put("u", userId ?: "").put("f", fraction.toDouble()).put("t", System.currentTimeMillis()))
            if (root.length() > 200) {
                val keep = root.keys().asSequence().sortedByDescending { root.optJSONObject(it)?.optLong("t") ?: 0L }.take(120).toList()
                val trimmed = JSONObject()
                keep.forEach { key -> root.optJSONObject(key)?.let { trimmed.put(key, it) } }
                prefs[readingProgressKey] = trimmed.toString()
            } else {
                prefs[readingProgressKey] = root.toString()
            }
        }
    }

}
