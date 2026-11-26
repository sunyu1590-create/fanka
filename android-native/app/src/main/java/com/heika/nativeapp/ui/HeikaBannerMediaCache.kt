package com.heika.nativeapp.ui

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.media3.common.MediaItem
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.database.StandaloneDatabaseProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 首页轮播视频的磁盘缓存。
 *
 * 用 media3 的 SimpleCache 做「按需 + 分段」缓存：播放时读到哪里缓存到哪里，
 * 重复播放与来回切换不重复下载；容量由 LRU 淘汰，不会无限增长。
 * 与图片缓存分开计费，避免一段视频把封面挤掉。
 */
@Singleton
class HeikaBannerMediaCache @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        /** 与网页端视频预算保持同一量级（96MB），按平台略有差异。 */
        private const val MAX_BYTES = 96L * 1024 * 1024
        private const val DIR = "heika-banner-media"
    }

    private val lock = Any()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val preloadJobs = mutableMapOf<String, Job>()

    @Volatile
    private var simpleCache: SimpleCache? = null

    @Volatile
    private var database: StandaloneDatabaseProvider? = null

    private fun cache(): SimpleCache? = synchronized(lock) {
        simpleCache ?: runCatching {
            val provider = database ?: StandaloneDatabaseProvider(context).also { database = it }
            SimpleCache(
                File(context.cacheDir, DIR),
                LeastRecentlyUsedCacheEvictor(MAX_BYTES),
                provider,
            ).also { simpleCache = it }
        }.getOrNull()
    }

    /** 播放器与预加载共用同一个缓存工厂，保证「预加载过的片段播放时直接命中」。 */
    fun dataSourceFactory(): CacheDataSource.Factory? {
        val cache = cache() ?: return null
        return CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(
                DefaultHttpDataSource.Factory()
                    .setAllowCrossProtocolRedirects(true)
                    .setConnectTimeoutMs(12_000)
                    .setReadTimeoutMs(12_000),
            )
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

    /**
     * 预取指定视频。CacheWriter 自身会跳过已缓存的区间，重复调用不会重复下载。
     * 返回的 Job 可由调用方在离开首页时取消。
     */
    fun preload(url: String): Job? {
        if (url.isBlank()) return null
        synchronized(lock) {
            preloadJobs[url]?.takeIf { it.isActive }?.let { return it }
        }
        val factory = dataSourceFactory() ?: return null
        val job = scope.launch(HeikaCoroutineGuard) {
            runCatching {
                CacheWriter(factory.createDataSource(), MediaItem.fromUri(url), null).cache()
            }
        }
        synchronized(lock) { preloadJobs[url] = job }
        job.invokeOnCompletion { synchronized(lock) { preloadJobs.remove(url) } }
        return job
    }

    fun cancelPreload(url: String) {
        synchronized(lock) { preloadJobs.remove(url)?.cancel() }
    }

    fun cancelAllPreloads() {
        synchronized(lock) {
            preloadJobs.values.forEach { it.cancel() }
            preloadJobs.clear()
        }
    }

    suspend fun sizeBytes(): Long = withContext(Dispatchers.IO) {
        dirSize(File(context.cacheDir, DIR))
    }

    /** 只清缓存内容，不释放实例：正在播放的会话不会被突然打断。 */
    suspend fun clear() = withContext(Dispatchers.IO) {
        runCatching {
            val cache = cache() ?: return@withContext
            cache.keys.toList().forEach { key -> runCatching { cache.removeResource(key) } }
        }
    }

    private fun dirSize(dir: File): Long {
        if (!dir.exists()) return 0
        return dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
    }

    fun isWifi(): Boolean = runCatching {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        val caps = manager.getNetworkCapabilities(network) ?: return false
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }.getOrDefault(false)

    fun isMetered(): Boolean = runCatching {
        ConnectivityManager.isActiveNetworkMetered(context)
    }.getOrDefault(true)
}
