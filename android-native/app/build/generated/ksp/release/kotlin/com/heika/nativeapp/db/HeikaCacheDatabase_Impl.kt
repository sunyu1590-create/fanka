package com.heika.nativeapp.db

import androidx.room.InvalidationTracker
import androidx.room.RoomOpenDelegate
import androidx.room.migration.AutoMigrationSpec
import androidx.room.migration.Migration
import androidx.room.util.TableInfo
import androidx.room.util.TableInfo.Companion.read
import androidx.room.util.dropFtsSyncTriggers
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL
import javax.`annotation`.processing.Generated
import kotlin.Lazy
import kotlin.String
import kotlin.Suppress
import kotlin.collections.List
import kotlin.collections.Map
import kotlin.collections.MutableList
import kotlin.collections.MutableMap
import kotlin.collections.MutableSet
import kotlin.collections.Set
import kotlin.collections.mutableListOf
import kotlin.collections.mutableMapOf
import kotlin.collections.mutableSetOf
import kotlin.reflect.KClass

@Generated(value = ["androidx.room.RoomProcessor"])
@Suppress(names = ["UNCHECKED_CAST", "DEPRECATION", "REDUNDANT_PROJECTION", "REMOVAL"])
public class HeikaCacheDatabase_Impl : HeikaCacheDatabase() {
  private val _heikaCacheDao: Lazy<HeikaCacheDao> = lazy {
    HeikaCacheDao_Impl(this)
  }

  protected override fun createOpenDelegate(): RoomOpenDelegate {
    val _openDelegate: RoomOpenDelegate = object : RoomOpenDelegate(1,
        "b2b282fb661d87d1175c2710f9f06c86", "3dbbf435e627e54eb066e2b95a54b551") {
      public override fun createAllTables(connection: SQLiteConnection) {
        connection.execSQL("CREATE TABLE IF NOT EXISTS `feed_cache` (`cacheKey` TEXT NOT NULL, `payload` TEXT NOT NULL, `cachedAt` INTEGER NOT NULL, PRIMARY KEY(`cacheKey`))")
        connection.execSQL("CREATE TABLE IF NOT EXISTS `daily_state` (`userId` TEXT NOT NULL, `day` TEXT NOT NULL, `candidateIds` TEXT NOT NULL, `openedIds` TEXT NOT NULL, `openedPosts` TEXT NOT NULL, `allowance` INTEGER NOT NULL, `luckyBonus` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL, PRIMARY KEY(`userId`, `day`))")
        connection.execSQL("CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY,identity_hash TEXT)")
        connection.execSQL("INSERT OR REPLACE INTO room_master_table (id,identity_hash) VALUES(42, 'b2b282fb661d87d1175c2710f9f06c86')")
      }

      public override fun dropAllTables(connection: SQLiteConnection) {
        connection.execSQL("DROP TABLE IF EXISTS `feed_cache`")
        connection.execSQL("DROP TABLE IF EXISTS `daily_state`")
      }

      public override fun onCreate(connection: SQLiteConnection) {
      }

      public override fun onOpen(connection: SQLiteConnection) {
        internalInitInvalidationTracker(connection)
      }

      public override fun onPreMigrate(connection: SQLiteConnection) {
        dropFtsSyncTriggers(connection)
      }

      public override fun onPostMigrate(connection: SQLiteConnection) {
      }

      public override fun onValidateSchema(connection: SQLiteConnection):
          RoomOpenDelegate.ValidationResult {
        val _columnsFeedCache: MutableMap<String, TableInfo.Column> = mutableMapOf()
        _columnsFeedCache.put("cacheKey", TableInfo.Column("cacheKey", "TEXT", true, 1, null,
            TableInfo.CREATED_FROM_ENTITY))
        _columnsFeedCache.put("payload", TableInfo.Column("payload", "TEXT", true, 0, null,
            TableInfo.CREATED_FROM_ENTITY))
        _columnsFeedCache.put("cachedAt", TableInfo.Column("cachedAt", "INTEGER", true, 0, null,
            TableInfo.CREATED_FROM_ENTITY))
        val _foreignKeysFeedCache: MutableSet<TableInfo.ForeignKey> = mutableSetOf()
        val _indicesFeedCache: MutableSet<TableInfo.Index> = mutableSetOf()
        val _infoFeedCache: TableInfo = TableInfo("feed_cache", _columnsFeedCache,
            _foreignKeysFeedCache, _indicesFeedCache)
        val _existingFeedCache: TableInfo = read(connection, "feed_cache")
        if (!_infoFeedCache.equals(_existingFeedCache)) {
          return RoomOpenDelegate.ValidationResult(false, """
              |feed_cache(com.heika.nativeapp.db.FeedCacheEntity).
              | Expected:
              |""".trimMargin() + _infoFeedCache + """
              |
              | Found:
              |""".trimMargin() + _existingFeedCache)
        }
        val _columnsDailyState: MutableMap<String, TableInfo.Column> = mutableMapOf()
        _columnsDailyState.put("userId", TableInfo.Column("userId", "TEXT", true, 1, null,
            TableInfo.CREATED_FROM_ENTITY))
        _columnsDailyState.put("day", TableInfo.Column("day", "TEXT", true, 2, null,
            TableInfo.CREATED_FROM_ENTITY))
        _columnsDailyState.put("candidateIds", TableInfo.Column("candidateIds", "TEXT", true, 0,
            null, TableInfo.CREATED_FROM_ENTITY))
        _columnsDailyState.put("openedIds", TableInfo.Column("openedIds", "TEXT", true, 0, null,
            TableInfo.CREATED_FROM_ENTITY))
        _columnsDailyState.put("openedPosts", TableInfo.Column("openedPosts", "TEXT", true, 0, null,
            TableInfo.CREATED_FROM_ENTITY))
        _columnsDailyState.put("allowance", TableInfo.Column("allowance", "INTEGER", true, 0, null,
            TableInfo.CREATED_FROM_ENTITY))
        _columnsDailyState.put("luckyBonus", TableInfo.Column("luckyBonus", "INTEGER", true, 0,
            null, TableInfo.CREATED_FROM_ENTITY))
        _columnsDailyState.put("cachedAt", TableInfo.Column("cachedAt", "INTEGER", true, 0, null,
            TableInfo.CREATED_FROM_ENTITY))
        val _foreignKeysDailyState: MutableSet<TableInfo.ForeignKey> = mutableSetOf()
        val _indicesDailyState: MutableSet<TableInfo.Index> = mutableSetOf()
        val _infoDailyState: TableInfo = TableInfo("daily_state", _columnsDailyState,
            _foreignKeysDailyState, _indicesDailyState)
        val _existingDailyState: TableInfo = read(connection, "daily_state")
        if (!_infoDailyState.equals(_existingDailyState)) {
          return RoomOpenDelegate.ValidationResult(false, """
              |daily_state(com.heika.nativeapp.db.DailyStateEntity).
              | Expected:
              |""".trimMargin() + _infoDailyState + """
              |
              | Found:
              |""".trimMargin() + _existingDailyState)
        }
        return RoomOpenDelegate.ValidationResult(true, null)
      }
    }
    return _openDelegate
  }

  protected override fun createInvalidationTracker(): InvalidationTracker {
    val _shadowTablesMap: MutableMap<String, String> = mutableMapOf()
    val _viewTables: MutableMap<String, Set<String>> = mutableMapOf()
    return InvalidationTracker(this, _shadowTablesMap, _viewTables, "feed_cache", "daily_state")
  }

  public override fun clearAllTables() {
    super.performClear(false, "feed_cache", "daily_state")
  }

  protected override fun getRequiredTypeConverterClasses(): Map<KClass<*>, List<KClass<*>>> {
    val _typeConvertersMap: MutableMap<KClass<*>, List<KClass<*>>> = mutableMapOf()
    _typeConvertersMap.put(HeikaCacheDao::class, HeikaCacheDao_Impl.getRequiredConverters())
    return _typeConvertersMap
  }

  public override fun getRequiredAutoMigrationSpecClasses(): Set<KClass<out AutoMigrationSpec>> {
    val _autoMigrationSpecsSet: MutableSet<KClass<out AutoMigrationSpec>> = mutableSetOf()
    return _autoMigrationSpecsSet
  }

  public override
      fun createAutoMigrations(autoMigrationSpecs: Map<KClass<out AutoMigrationSpec>, AutoMigrationSpec>):
      List<Migration> {
    val _autoMigrations: MutableList<Migration> = mutableListOf()
    return _autoMigrations
  }

  public override fun cacheDao(): HeikaCacheDao = _heikaCacheDao.value
}
