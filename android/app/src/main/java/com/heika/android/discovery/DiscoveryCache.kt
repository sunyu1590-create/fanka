package com.heika.android.discovery

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

internal data class CachedDiscovery(
    val items: List<DiscoveryPost>,
    val cursor: DiscoveryCursor?,
    val page: Int,
    val hasMore: Boolean,
    val savedAt: Long,
)

/** Private, account-scoped first-party feed snapshots. Images stay in Glide's bounded disk cache. */
internal class DiscoveryCache(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    "heika-discovery-v1.db",
    null,
    1,
) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE feed_snapshots (cache_key TEXT PRIMARY KEY NOT NULL, user_scope TEXT NOT NULL, saved_at INTEGER NOT NULL, payload TEXT NOT NULL)")
        db.execSQL("CREATE INDEX feed_snapshots_saved_at ON feed_snapshots(saved_at DESC)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun read(key: String, channel: DiscoveryChannel, now: Long = System.currentTimeMillis()): CachedDiscovery? {
        readableDatabase.query(
            "feed_snapshots", arrayOf("saved_at", "payload"), "cache_key=?", arrayOf(key), null, null, null,
        ).use { cursor ->
            if (!cursor.moveToFirst()) return null
            val savedAt = cursor.getLong(0)
            if (now - savedAt > MAX_AGE_MS || savedAt > now + CLOCK_SKEW_MS) {
                writableDatabase.delete("feed_snapshots", "cache_key=?", arrayOf(key))
                return null
            }
            return runCatching {
                val payload = JSONObject(cursor.getString(1))
                val next = payload.optJSONObject("cursor")
                CachedDiscovery(
                    items = DiscoveryJson.decodePosts(payload.optString("items", "[]"), channel),
                    cursor = next?.let { DiscoveryCursor(it.optString("createdAt"), it.optString("postId")) },
                    page = payload.optInt("page", 0),
                    hasMore = payload.optBoolean("hasMore", true),
                    savedAt = savedAt,
                )
            }.getOrElse {
                writableDatabase.delete("feed_snapshots", "cache_key=?", arrayOf(key))
                null
            }
        }
    }

    fun write(key: String, userScope: String, page: DiscoveryPage, items: List<DiscoveryPost>) {
        val cursor = page.cursor?.let { JSONObject().put("createdAt", it.createdAt).put("postId", it.postId) }
        val payload = JSONObject()
            .put("items", DiscoveryJson.encodePosts(items))
            .put("cursor", cursor)
            .put("page", page.page)
            .put("hasMore", page.hasMore)
            .toString()
        writableDatabase.beginTransaction()
        try {
            writableDatabase.execSQL(
                "INSERT OR REPLACE INTO feed_snapshots(cache_key,user_scope,saved_at,payload) VALUES(?,?,?,?)",
                arrayOf(key, userScope, System.currentTimeMillis(), payload),
            )
            writableDatabase.execSQL("DELETE FROM feed_snapshots WHERE cache_key IN (SELECT cache_key FROM feed_snapshots ORDER BY saved_at DESC LIMIT -1 OFFSET $MAX_SNAPSHOTS)")
            writableDatabase.setTransactionSuccessful()
        } finally {
            writableDatabase.endTransaction()
        }
    }

    fun clearUser(userScope: String) {
        if (userScope.isNotBlank()) writableDatabase.delete("feed_snapshots", "user_scope=?", arrayOf(userScope))
    }

    companion object {
        private const val MAX_AGE_MS = 24 * 60 * 60 * 1000L
        private const val CLOCK_SKEW_MS = 5 * 60 * 1000L
        private const val MAX_SNAPSHOTS = 16
    }
}
