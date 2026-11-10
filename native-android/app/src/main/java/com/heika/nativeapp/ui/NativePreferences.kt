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

private val Context.userPrefs by preferencesDataStore("heika_native_preferences")

@Singleton
class NativePreferences @Inject constructor(@ApplicationContext context: Context) {
    private val dataStore = context.userPrefs
    private val themeKey = stringPreferencesKey("theme")
    private val imageCacheKey = intPreferencesKey("image_cache_mb")
    private val feedLayoutKey = stringPreferencesKey("feed_layout")
    private val readingModeKey = stringPreferencesKey("reading_mode")

    val theme: Flow<String> = dataStore.data.map { it[themeKey] ?: "dark" }
    val imageCacheMb: Flow<Int> = dataStore.data.map { it[imageCacheKey] ?: 256 }
    val feedLayout: Flow<String> = dataStore.data.map { it[feedLayoutKey] ?: "waterfall" }
    val readingMode: Flow<String> = dataStore.data.map { it[readingModeKey] ?: "standard" }

    suspend fun setTheme(theme: String) { dataStore.edit { it[themeKey] = theme } }
    suspend fun setImageCacheMb(value: Int) { dataStore.edit { it[imageCacheKey] = value.coerceIn(256, 512) } }
    suspend fun setFeedLayout(value: String) { dataStore.edit { it[feedLayoutKey] = if (value == "single") "single" else "waterfall" } }
    suspend fun setReadingMode(value: String) { dataStore.edit { it[readingModeKey] = value.takeIf { it in setOf("standard", "focus", "night") } ?: "standard" } }
}
