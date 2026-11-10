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
    private val searchHistoryKey = stringPreferencesKey("search_history")

    val theme: Flow<String> = dataStore.data.map { it[themeKey] ?: "dark" }
    val imageCacheMb: Flow<Int> = dataStore.data.map { it[imageCacheKey] ?: 256 }
    val feedLayout: Flow<String> = dataStore.data.map { it[feedLayoutKey] ?: "waterfall" }
    val readingMode: Flow<String> = dataStore.data.map { it[readingModeKey] ?: "standard" }
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
}
