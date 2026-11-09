package com.heika.nativeapp.ui

import android.content.Context
import androidx.compose.runtime.staticCompositionLocalOf
import coil3.ImageLoader
import coil3.disk.DiskCache
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient

val LocalHeikaImageLoader = staticCompositionLocalOf<ImageLoader> { error("HEIKA image loader is not initialized") }

@Singleton
class HeikaImageCache @Inject constructor(
    @ApplicationContext private val context: Context,
    private val client: OkHttpClient,
    private val preferences: NativePreferences,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutableLoader = MutableStateFlow(create(256))
    val loader = mutableLoader.asStateFlow()

    fun initialize() {
        scope.launch { resize(preferences.imageCacheMb.first()) }
    }

    suspend fun resize(mb: Int) {
        val capacity = if (mb >= 512) 512 else 256
        if (mutableLoader.value.diskCache?.maxSize == capacity.toLong() * 1024 * 1024) return
        val old = mutableLoader.value
        mutableLoader.value = create(capacity)
        old.shutdown()
        preferences.setImageCacheMb(capacity)
    }

    suspend fun clear() = withContext(Dispatchers.IO) {
        mutableLoader.value.diskCache?.clear()
        mutableLoader.value.memoryCache?.clear()
    }

    private fun create(mb: Int): ImageLoader = ImageLoader.Builder(context)
        .memoryCache {
            MemoryCache.Builder()
                .maxSizePercent(context, 0.18)
                .build()
        }
        .diskCache {
            DiskCache.Builder()
                .directory(File(context.cacheDir, "heika-image-cache").toPath())
                .maxSizeBytes(mb.toLong() * 1024 * 1024)
                .build()
        }
        .components { add(OkHttpNetworkFetcherFactory(callFactory = { client })) }
        .build()
}

