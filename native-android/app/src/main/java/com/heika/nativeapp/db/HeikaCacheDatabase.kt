package com.heika.nativeapp.db

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import javax.inject.Inject
import javax.inject.Singleton

@Entity(tableName = "feed_cache")
data class FeedCacheEntity(
    @PrimaryKey val cacheKey: String,
    val payload: String,
    val cachedAt: Long,
)

@Entity(tableName = "daily_state", primaryKeys = ["userId", "day"])
data class DailyStateEntity(
    val userId: String,
    val day: String,
    val candidateIds: String,
    val openedIds: String,
    val openedPosts: String,
    val allowance: Int,
    val luckyBonus: Int = 0,
    val cachedAt: Long,
)

@Dao
interface HeikaCacheDao {
    @Query("SELECT * FROM feed_cache WHERE cacheKey = :key LIMIT 1")
    suspend fun feed(key: String): FeedCacheEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putFeed(value: FeedCacheEntity)

    @Query("DELETE FROM feed_cache WHERE cachedAt < :before AND cacheKey NOT LIKE 'native-publish:%'")
    suspend fun expireFeeds(before: Long)

    @Query("DELETE FROM feed_cache WHERE cacheKey = (SELECT cacheKey FROM feed_cache WHERE cacheKey NOT LIKE 'native-profile:%' AND cacheKey NOT LIKE 'native-publish:%' ORDER BY cachedAt ASC LIMIT 1)")
    suspend fun removeOldestFeed()

    @Query("DELETE FROM feed_cache WHERE cacheKey LIKE '%' || :userId AND cacheKey NOT LIKE 'native-publish:%'")
    suspend fun clearFeedForUser(userId: String)

    @Query("SELECT COUNT(*) FROM feed_cache WHERE cacheKey NOT LIKE 'native-profile:%' AND cacheKey NOT LIKE 'native-publish:%'")
    suspend fun feedCount(): Int

    @Query("SELECT * FROM feed_cache WHERE cacheKey = :key LIMIT 1")
    suspend fun publishSnapshot(key: String): FeedCacheEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putPublishSnapshot(value: FeedCacheEntity)

    @Query("DELETE FROM feed_cache WHERE cacheKey = :key")
    suspend fun clearPublishSnapshot(key: String)

    @Query("SELECT * FROM daily_state WHERE userId = :userId AND day = :day LIMIT 1")
    suspend fun daily(userId: String, day: String): DailyStateEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putDaily(value: DailyStateEntity)

    @Query("DELETE FROM daily_state WHERE userId = :userId")
    suspend fun clearDailyForUser(userId: String)
}

@Database(entities = [FeedCacheEntity::class, DailyStateEntity::class], version = 1, exportSchema = true)
abstract class HeikaCacheDatabase : RoomDatabase() {
    abstract fun cacheDao(): HeikaCacheDao
}

@Singleton
class FeedCache @Inject constructor(private val dao: HeikaCacheDao) {
    suspend fun get(key: String): String? = dao.feed(key)?.takeIf {
        System.currentTimeMillis() - it.cachedAt <= MAX_AGE_MS
    }?.payload

    suspend fun put(key: String, payload: String) {
        dao.putFeed(FeedCacheEntity(key, payload, System.currentTimeMillis()))
        dao.expireFeeds(System.currentTimeMillis() - MAX_AGE_MS)
        repeat((dao.feedCount() - MAX_FEEDS).coerceAtLeast(0)) { dao.removeOldestFeed() }
    }

    // Feed cache is intentionally bounded and never shares account-specific endpoints.
    private companion object {
        const val MAX_AGE_MS = 24L * 60 * 60 * 1000
        const val MAX_FEEDS = 40
    }
}
