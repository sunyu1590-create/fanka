package com.heika.nativeapp.feature.home

import android.content.Context

/**
 * 轮播停留位置（进程被回收后仍可恢复）。
 *
 * 只记录「哪一条、第几页、播放到第几毫秒」，不涉及任何账号隐私数据。
 * 30 分钟以外的记录视为过期，避免回到一个早已不合理的进度。
 */
object BannerSessionStore {
    private const val FILE = "heika-banner-session"
    private const val KEY_BANNER = "banner_id"
    private const val KEY_INDEX = "index"
    private const val KEY_POSITION = "position_ms"
    private const val KEY_SAVED_AT = "saved_at"
    private const val MAX_AGE_MS = 30L * 60 * 1000

    data class Session(val bannerId: String, val index: Int, val positionMs: Long)

    fun load(context: Context): Session? = runCatching {
        val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        val savedAt = prefs.getLong(KEY_SAVED_AT, 0L)
        if (savedAt <= 0L || System.currentTimeMillis() - savedAt > MAX_AGE_MS) return null
        val id = prefs.getString(KEY_BANNER, null) ?: return null
        if (id.isBlank()) return null
        Session(id, prefs.getInt(KEY_INDEX, 0).coerceAtLeast(0), prefs.getLong(KEY_POSITION, 0L).coerceAtLeast(0L))
    }.getOrNull()

    fun save(context: Context, bannerId: String, index: Int, positionMs: Long) {
        if (bannerId.isBlank()) return
        runCatching {
            context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
                .putString(KEY_BANNER, bannerId)
                .putInt(KEY_INDEX, index.coerceAtLeast(0))
                .putLong(KEY_POSITION, positionMs.coerceAtLeast(0L))
                .putLong(KEY_SAVED_AT, System.currentTimeMillis())
                .apply()
        }
    }

    fun clear(context: Context) {
        runCatching { context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().clear().apply() }
    }
}
