package com.heika.nativeapp.db

import androidx.room.EntityInsertAdapter
import androidx.room.RoomDatabase
import androidx.room.util.getColumnIndexOrThrow
import androidx.room.util.performSuspending
import androidx.sqlite.SQLiteStatement
import javax.`annotation`.processing.Generated
import kotlin.Int
import kotlin.Long
import kotlin.String
import kotlin.Suppress
import kotlin.Unit
import kotlin.collections.List
import kotlin.reflect.KClass

@Generated(value = ["androidx.room.RoomProcessor"])
@Suppress(names = ["UNCHECKED_CAST", "DEPRECATION", "REDUNDANT_PROJECTION", "REMOVAL"])
public class HeikaCacheDao_Impl(
  __db: RoomDatabase,
) : HeikaCacheDao {
  private val __db: RoomDatabase

  private val __insertAdapterOfFeedCacheEntity: EntityInsertAdapter<FeedCacheEntity>

  private val __insertAdapterOfDailyStateEntity: EntityInsertAdapter<DailyStateEntity>
  init {
    this.__db = __db
    this.__insertAdapterOfFeedCacheEntity = object : EntityInsertAdapter<FeedCacheEntity>() {
      protected override fun createQuery(): String =
          "INSERT OR REPLACE INTO `feed_cache` (`cacheKey`,`payload`,`cachedAt`) VALUES (?,?,?)"

      protected override fun bind(statement: SQLiteStatement, entity: FeedCacheEntity) {
        statement.bindText(1, entity.cacheKey)
        statement.bindText(2, entity.payload)
        statement.bindLong(3, entity.cachedAt)
      }
    }
    this.__insertAdapterOfDailyStateEntity = object : EntityInsertAdapter<DailyStateEntity>() {
      protected override fun createQuery(): String =
          "INSERT OR REPLACE INTO `daily_state` (`userId`,`day`,`candidateIds`,`openedIds`,`openedPosts`,`allowance`,`luckyBonus`,`cachedAt`) VALUES (?,?,?,?,?,?,?,?)"

      protected override fun bind(statement: SQLiteStatement, entity: DailyStateEntity) {
        statement.bindText(1, entity.userId)
        statement.bindText(2, entity.day)
        statement.bindText(3, entity.candidateIds)
        statement.bindText(4, entity.openedIds)
        statement.bindText(5, entity.openedPosts)
        statement.bindLong(6, entity.allowance.toLong())
        statement.bindLong(7, entity.luckyBonus.toLong())
        statement.bindLong(8, entity.cachedAt)
      }
    }
  }

  public override suspend fun putFeed(`value`: FeedCacheEntity): Unit = performSuspending(__db,
      false, true) { _connection ->
    __insertAdapterOfFeedCacheEntity.insert(_connection, value)
  }

  public override suspend fun putPublishSnapshot(`value`: FeedCacheEntity): Unit =
      performSuspending(__db, false, true) { _connection ->
    __insertAdapterOfFeedCacheEntity.insert(_connection, value)
  }

  public override suspend fun putDaily(`value`: DailyStateEntity): Unit = performSuspending(__db,
      false, true) { _connection ->
    __insertAdapterOfDailyStateEntity.insert(_connection, value)
  }

  public override suspend fun feed(key: String): FeedCacheEntity? {
    val _sql: String = "SELECT * FROM feed_cache WHERE cacheKey = ? LIMIT 1"
    return performSuspending(__db, true, false) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, key)
        val _columnIndexOfCacheKey: Int = getColumnIndexOrThrow(_stmt, "cacheKey")
        val _columnIndexOfPayload: Int = getColumnIndexOrThrow(_stmt, "payload")
        val _columnIndexOfCachedAt: Int = getColumnIndexOrThrow(_stmt, "cachedAt")
        val _result: FeedCacheEntity?
        if (_stmt.step()) {
          val _tmpCacheKey: String
          _tmpCacheKey = _stmt.getText(_columnIndexOfCacheKey)
          val _tmpPayload: String
          _tmpPayload = _stmt.getText(_columnIndexOfPayload)
          val _tmpCachedAt: Long
          _tmpCachedAt = _stmt.getLong(_columnIndexOfCachedAt)
          _result = FeedCacheEntity(_tmpCacheKey,_tmpPayload,_tmpCachedAt)
        } else {
          _result = null
        }
        _result
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun feedCount(): Int {
    val _sql: String =
        "SELECT COUNT(*) FROM feed_cache WHERE cacheKey NOT LIKE 'native-profile:%' AND cacheKey NOT LIKE 'native-publish:%'"
    return performSuspending(__db, true, false) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        val _result: Int
        if (_stmt.step()) {
          val _tmp: Int
          _tmp = _stmt.getLong(0).toInt()
          _result = _tmp
        } else {
          _result = 0
        }
        _result
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun publishSnapshot(key: String): FeedCacheEntity? {
    val _sql: String = "SELECT * FROM feed_cache WHERE cacheKey = ? LIMIT 1"
    return performSuspending(__db, true, false) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, key)
        val _columnIndexOfCacheKey: Int = getColumnIndexOrThrow(_stmt, "cacheKey")
        val _columnIndexOfPayload: Int = getColumnIndexOrThrow(_stmt, "payload")
        val _columnIndexOfCachedAt: Int = getColumnIndexOrThrow(_stmt, "cachedAt")
        val _result: FeedCacheEntity?
        if (_stmt.step()) {
          val _tmpCacheKey: String
          _tmpCacheKey = _stmt.getText(_columnIndexOfCacheKey)
          val _tmpPayload: String
          _tmpPayload = _stmt.getText(_columnIndexOfPayload)
          val _tmpCachedAt: Long
          _tmpCachedAt = _stmt.getLong(_columnIndexOfCachedAt)
          _result = FeedCacheEntity(_tmpCacheKey,_tmpPayload,_tmpCachedAt)
        } else {
          _result = null
        }
        _result
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun daily(userId: String, day: String): DailyStateEntity? {
    val _sql: String = "SELECT * FROM daily_state WHERE userId = ? AND day = ? LIMIT 1"
    return performSuspending(__db, true, false) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, userId)
        _argIndex = 2
        _stmt.bindText(_argIndex, day)
        val _columnIndexOfUserId: Int = getColumnIndexOrThrow(_stmt, "userId")
        val _columnIndexOfDay: Int = getColumnIndexOrThrow(_stmt, "day")
        val _columnIndexOfCandidateIds: Int = getColumnIndexOrThrow(_stmt, "candidateIds")
        val _columnIndexOfOpenedIds: Int = getColumnIndexOrThrow(_stmt, "openedIds")
        val _columnIndexOfOpenedPosts: Int = getColumnIndexOrThrow(_stmt, "openedPosts")
        val _columnIndexOfAllowance: Int = getColumnIndexOrThrow(_stmt, "allowance")
        val _columnIndexOfLuckyBonus: Int = getColumnIndexOrThrow(_stmt, "luckyBonus")
        val _columnIndexOfCachedAt: Int = getColumnIndexOrThrow(_stmt, "cachedAt")
        val _result: DailyStateEntity?
        if (_stmt.step()) {
          val _tmpUserId: String
          _tmpUserId = _stmt.getText(_columnIndexOfUserId)
          val _tmpDay: String
          _tmpDay = _stmt.getText(_columnIndexOfDay)
          val _tmpCandidateIds: String
          _tmpCandidateIds = _stmt.getText(_columnIndexOfCandidateIds)
          val _tmpOpenedIds: String
          _tmpOpenedIds = _stmt.getText(_columnIndexOfOpenedIds)
          val _tmpOpenedPosts: String
          _tmpOpenedPosts = _stmt.getText(_columnIndexOfOpenedPosts)
          val _tmpAllowance: Int
          _tmpAllowance = _stmt.getLong(_columnIndexOfAllowance).toInt()
          val _tmpLuckyBonus: Int
          _tmpLuckyBonus = _stmt.getLong(_columnIndexOfLuckyBonus).toInt()
          val _tmpCachedAt: Long
          _tmpCachedAt = _stmt.getLong(_columnIndexOfCachedAt)
          _result =
              DailyStateEntity(_tmpUserId,_tmpDay,_tmpCandidateIds,_tmpOpenedIds,_tmpOpenedPosts,_tmpAllowance,_tmpLuckyBonus,_tmpCachedAt)
        } else {
          _result = null
        }
        _result
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun expireFeeds(before: Long) {
    val _sql: String =
        "DELETE FROM feed_cache WHERE cachedAt < ? AND cacheKey NOT LIKE 'native-publish:%'"
    return performSuspending(__db, false, true) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindLong(_argIndex, before)
        _stmt.step()
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun removeOldestFeed() {
    val _sql: String =
        "DELETE FROM feed_cache WHERE cacheKey = (SELECT cacheKey FROM feed_cache WHERE cacheKey NOT LIKE 'native-profile:%' AND cacheKey NOT LIKE 'native-publish:%' ORDER BY cachedAt ASC LIMIT 1)"
    return performSuspending(__db, false, true) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        _stmt.step()
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun clearFeedForUser(userId: String) {
    val _sql: String =
        "DELETE FROM feed_cache WHERE cacheKey LIKE '%' || ? AND cacheKey NOT LIKE 'native-publish:%'"
    return performSuspending(__db, false, true) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, userId)
        _stmt.step()
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun clearPublishSnapshot(key: String) {
    val _sql: String = "DELETE FROM feed_cache WHERE cacheKey = ?"
    return performSuspending(__db, false, true) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, key)
        _stmt.step()
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun clearDailyForUser(userId: String) {
    val _sql: String = "DELETE FROM daily_state WHERE userId = ?"
    return performSuspending(__db, false, true) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, userId)
        _stmt.step()
      } finally {
        _stmt.close()
      }
    }
  }

  public companion object {
    public fun getRequiredConverters(): List<KClass<*>> = emptyList()
  }
}
