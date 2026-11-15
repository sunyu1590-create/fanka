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
    suspend fun clearRecentSearches() { dataStore.edit { it.remove(searchHistoryKey) } }
    suspend fun hasSeenNetworkNotice(version: String): Boolean =
        dataStore.data.map { it[networkNoticeVersionKey] == version }.first()
    suspend fun markNetworkNoticeSeen(version: String) {
        dataStore.edit { it[networkNoticeVersionKey] = version }
    }

}
