package com.heika.nativeapp.feature.home

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Uri
import android.provider.Settings
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.R
import com.heika.nativeapp.data.HeikaBanner
import com.heika.nativeapp.data.HeikaBannerFeed
import com.heika.nativeapp.ui.HeikaBannerMediaCache
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 首页推荐位（方案 A：沉浸式单媒体轮播）。
 *
 * 关键约束：
 * - 容器高度只由服务端配置决定，不跟随媒体原始比例，卡池因此不会上下跳；
 * - 同一时刻只有一个播放器实例，切页即释放；
 * - 页面不可见 / 应用进入后台立刻暂停，回到前台再恢复；
 * - 图片与视频共用一条时间线：视频播完（或到达上限）自动切下一条，
 *   视频若迟迟不就绪还有兜底计时器，轮播不会被卡住；
 * - 视频走 SimpleCache 磁盘缓存：重复播放与来回切换不重复下载；
 * - 停留位置与播放进度写入本地，进程被回收后回到原来的那一条。
 */
@Composable
fun HomeBannerPager(
    feed: HeikaBannerFeed,
    onOpenPost: (String) -> Unit,
    onOpenSeries: (String) -> Unit,
    modifier: Modifier = Modifier,
    mediaCache: HeikaBannerMediaCache? = null,
    onTrack: (bannerId: String, event: String) -> Unit = { _, _ -> },
) {
    val settings = feed.settings
    val items = feed.items
    if (!settings.enabled || items.isEmpty()) return

    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var resumed by remember {
        mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED))
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> resumed = true
                Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP -> resumed = false
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // 系统「减少动态效果」：关掉自动轮播与视频自动播放，只保留手动滑动。
    val reduceMotion = remember {
        runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
    }
    // 省流量模式：按后台配置把视频降级成静态封面，不消耗流量也不空转解码。
    val dataSaver = remember {
        runCatching {
            val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            manager.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
        }.getOrDefault(false)
    }
    val videoPlayable = settings.videoAutoplay && !reduceMotion && !(dataSaver && settings.dataSaverFallback)
    val cacheFactory: CacheDataSource.Factory? = remember(mediaCache) { mediaCache?.dataSourceFactory() }
    val imageLoader = LocalHeikaImageLoader.current

    // 上次停留位置：只在同一份轮播内容里生效，内容换版就回到第一条。
    val saved = remember(feed.version) { BannerSessionStore.load(context) }
    val savedIndex = remember(feed.version, items.size, saved?.bannerId) {
        saved?.let { session -> items.indexOfFirst { it.id == session.bannerId } }?.takeIf { it >= 0 } ?: 0
    }
    val basePage = Int.MAX_VALUE / 2
    val initialPage = basePage - (basePage % items.size) + savedIndex
    val pagerState = rememberPagerState(initialPage = initialPage) { Int.MAX_VALUE }
    val index = ((pagerState.currentPage % items.size) + items.size) % items.size
    val item = items[index]
    var paused by remember { mutableStateOf(false) }
    var muted by remember { mutableStateOf(settings.videoMuted) }
    var videoFailed by remember(item.id) { mutableStateOf(false) }
    var progress by remember(item.id) { mutableFloatStateOf(0f) }
    var positionMs by remember(item.id) { mutableLongStateOf(0L) }

    val currentItem by rememberUpdatedState(item)
    val currentIndex by rememberUpdatedState(index)
    val currentPosition by rememberUpdatedState(positionMs)

    val advance: () -> Unit = {
        if (items.size > 1) {
            scope.launch {
                val next = pagerState.currentPage + 1
                runCatching {
                    if (reduceMotion) pagerState.scrollToPage(next) else pagerState.animateScrollToPage(next)
                }
            }
        }
    }

    LaunchedEffect(item.id) {
        videoFailed = false
        progress = 0f
        positionMs = if (saved?.bannerId == item.id) saved.positionMs else 0L
        onTrack(item.id, "impression")
    }

    // 停留位置与进度落盘：切条、退到后台、离开首页都会保存。
    LaunchedEffect(index, item.id) {
        BannerSessionStore.save(context, item.id, index, currentPosition)
    }
    LaunchedEffect(item.id) {
        while (true) {
            delay(5000)
            BannerSessionStore.save(context, currentItem.id, currentIndex, currentPosition)
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            BannerSessionStore.save(context, currentItem.id, currentIndex, currentPosition)
            mediaCache?.cancelAllPreloads()
        }
    }

    // 图片（以及被降级的视频）自动切换。
    LaunchedEffect(index, paused, resumed, reduceMotion, item.id, videoPlayable) {
        if (!settings.autoplay || paused || !resumed || reduceMotion) return@LaunchedEffect
        if (items.size < 2) return@LaunchedEffect
        if (item.isVideo && videoPlayable && !videoFailed) return@LaunchedEffect
        val duration = (item.displayMs ?: settings.imageDurationMs).coerceIn(1500, 20000)
        delay(duration.toLong())
        advance()
    }

    // 兜底：视频即使一直缓冲不上来，也不会把轮播钉在原地。
    LaunchedEffect(index, paused, resumed, item.id, videoPlayable) {
        if (!settings.autoplay || paused || !resumed) return@LaunchedEffect
        if (!item.isVideo || !videoPlayable || videoFailed) return@LaunchedEffect
        if (items.size < 2) return@LaunchedEffect
        val cap = videoLimitMs(settings.videoPlayMode, settings.videoMaxMs, item)
        delay(cap + 2500L)
        advance()
    }

    // 智能预加载：下一条的封面/图片先进 Coil 磁盘缓存；
    // 视频只在 Wi-Fi、非省流量时预取，移动网络不偷偷下载。
    LaunchedEffect(index, feed.version, settings.preloadMode) {
        if (settings.preloadMode == "off" || items.size < 2) return@LaunchedEffect
        val lookahead = if (settings.preloadMode == "adjacent") 2 else 1
        for (step in 1..lookahead) {
            val entry = items[(index + step) % items.size]
            val urls = listOfNotNull(entry.posterUrl, entry.imageUrl).distinct()
            urls.forEach { url ->
                runCatching {
                    imageLoader.enqueue(ImageRequest.Builder(context).data(url).build())
                }
            }
            if (step == 1 && entry.isVideo && videoPlayable) {
                val wifi = mediaCache?.isWifi() ?: false
                if (wifi && !dataSaver) entry.videoUrl?.let { mediaCache?.preload(it) }
            }
        }
    }

    val radius = settings.radius.dp
    Column(modifier.fillMaxWidth()) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val bannerHeight = if (settings.sizeMode == "fixed") {
                settings.appHeight.dp
            } else {
                (maxWidth / settings.ratio).coerceIn(80.dp, 320.dp)
            }

            Box(
                Modifier.fillMaxWidth().height(bannerHeight).clip(RoundedCornerShape(radius))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier.fillMaxSize(),
                    pageSpacing = 0.dp,
                    beyondViewportPageCount = 1,
                    userScrollEnabled = items.size > 1,
                ) { page ->
                    val entry = items[((page % items.size) + items.size) % items.size]
                    val alignment = when (entry.focus) {
                        "top" -> BiasAlignment(0f, -1f)
                        "bottom" -> BiasAlignment(0f, 1f)
                        else -> BiasAlignment(0f, 0f)
                    }
                    val playVideo = entry.isVideo && videoPlayable && page == pagerState.currentPage &&
                        !videoFailed && !entry.videoUrl.isNullOrBlank()
                    val fitMode = entry.fitMode ?: settings.fitMode
                    val posterFit = if (entry.isVideo) entry.posterFit else fitMode

                    Box(
                        Modifier.fillMaxSize().clickable(enabled = entry.hasTarget) {
                            onTrack(entry.id, "click")
                            if (entry.targetType == "external") {
                                val raw = entry.externalUrl ?: return@clickable
                                // 站内路径补全域名；绝对地址原样交给系统浏览器。
                                val url = if (raw.startsWith("http")) raw else BuildConfig.API_BASE_URL + raw
                                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                                return@clickable
                            }
                            val target = entry.targetId ?: return@clickable
                            if (entry.targetType == "series") onOpenSeries(target) else onOpenPost(target)
                        },
                    ) {
                        // 封面永远先画：视频首帧就绪前不会露黑，加载失败也还有静态图。
                        val poster = entry.posterUrl ?: entry.imageUrl
                        if (poster != null) {
                            AsyncImage(
                                model = poster,
                                contentDescription = entry.alt.ifBlank { entry.title.ifBlank { null } },
                                imageLoader = LocalHeikaImageLoader.current,
                                contentScale = if (posterFit == "contain") ContentScale.Fit else ContentScale.Crop,
                                alignment = alignment,
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                        if (playVideo) {
                            val resumeAt = if (entry.id == saved?.bannerId && page == pagerState.currentPage) {
                                saved.positionMs
                            } else 0L
                            BannerVideo(
                                url = entry.videoUrl.orEmpty(),
                                muted = muted,
                                maxMs = videoLimitMs(settings.videoPlayMode, settings.videoMaxMs, entry),
                                loop = settings.videoLoop && settings.videoPlayMode == "full",
                                startPositionMs = resumeAt,
                                active = resumed && !paused,
                                fitMode = fitMode,
                                cacheFactory = cacheFactory,
                                onProgress = { fraction, ms ->
                                    progress = fraction
                                    positionMs = ms
                                },
                                onCompleted = {
                                    progress = 1f
                                    onTrack(entry.id, "video_complete")
                                    advance()
                                },
                                onStarted = { onTrack(entry.id, "video_start") },
                                onFailed = { videoFailed = true },
                            )
                        } else if (poster == null) {
                            Box(Modifier.fillMaxSize())
                        }

                        // 文字层：全局开关 + 单条开关共同决定，标题缺失时自动省略该行。
                        val showCopy = settings.showText && entry.showText &&
                            (entry.title.isNotBlank() || entry.subtitle.isNotBlank() || entry.description.isNotBlank())
                        if (showCopy) {
                            Column(
                                Modifier.align(Alignment.BottomStart).fillMaxWidth()
                                    .background(
                                        Brush.verticalGradient(
                                            listOf(Color.Transparent, Color.Black.copy(alpha = .62f)),
                                        ),
                                    )
                                    .padding(start = 12.dp, end = 12.dp, top = 24.dp, bottom = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                if (entry.title.isNotBlank()) {
                                    Text(
                                        entry.title,
                                        color = Color.White,
                                        fontSize = 13.5.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                if (entry.subtitle.isNotBlank()) {
                                    Text(
                                        entry.subtitle,
                                        color = Color.White.copy(alpha = .9f),
                                        fontSize = 11.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                if (entry.description.isNotBlank()) {
                                    Text(
                                        entry.description,
                                        color = Color.White.copy(alpha = .78f),
                                        fontSize = 10.5.sp,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }

                // 视频：静音切换，点击按钮只切静音、不触发跳转。
                if (item.isVideo && !videoFailed && videoPlayable && settings.allowUnmute) {
                    Box(
                        Modifier.align(Alignment.BottomEnd).padding(8.dp).size(28.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = .42f))
                            .clickable { muted = !muted },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = if (muted) HeikaIcons.VolumeOff else HeikaIcons.VolumeOn,
                            contentDescription = if (muted) "取消静音" else "静音",
                            tint = Color.White,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }
                // 暂停 / 继续：与网页端一致，暂停时给出明确状态。
                if (settings.autoplay && items.size > 1) {
                    Box(
                        Modifier.align(Alignment.TopStart).padding(8.dp)
                            .clip(CircleShape).background(Color.Black.copy(alpha = .34f))
                            .clickable { paused = !paused }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Text(
                            if (paused) "已暂停 · 点按继续" else "自动轮播中",
                            color = Color.White.copy(alpha = .9f),
                            fontSize = 9.5.sp,
                        )
                    }
                }
                // 底部细进度线：只在视频真正播放时出现，图片没有进度概念。
                if (item.isVideo && !videoFailed && videoPlayable) {
                    Box(
                        Modifier.align(Alignment.BottomStart).fillMaxWidth().height(2.dp)
                            .background(Color.White.copy(alpha = .22f)),
                    ) {
                        Box(
                            Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).height(2.dp)
                                .background(Color.White.copy(alpha = .92f)),
                        )
                    }
                }
            }
        }

        // 只有一项时不显示指示器；指示器占位固定，避免出现/消失时列表抖动。
        if (settings.showIndicator && items.size > 1) {
            Row(
                Modifier.fillMaxWidth().padding(top = 8.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                items.forEachIndexed { position, entry ->
                    val active = position == index
                    val dotWidth by animateFloatAsState(
                        targetValue = if (active) 16f else 5f,
                        animationSpec = tween(220),
                        label = "banner-dot-${entry.id}",
                    )
                    Box(
                        Modifier.padding(horizontal = 3.dp)
                            .width(dotWidth.dp)
                            .height(5.dp)
                            .clip(CircleShape)
                            .background(
                                if (active) MaterialTheme.colorScheme.onBackground.copy(alpha = .82f)
                                else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .34f),
                            ),
                    )
                }
            }
        }
    }
}

/** 视频切换上限：完整播放取视频时长，定时模式取条目/全局设定，均不超过全局上限。 */
private fun videoLimitMs(playMode: String, maxMs: Int, entry: HeikaBanner): Long {
    val byItem = (entry.displayMs ?: maxMs).toLong()
    return if (playMode == "timed") {
        byItem.coerceAtMost(maxMs.toLong()).coerceAtLeast(1200L)
    } else {
        ((entry.videoDurationMs ?: maxMs).toLong()).coerceAtMost(maxMs.toLong()).coerceAtLeast(1200L)
    }
}

@Composable
private fun BannerVideo(
    url: String,
    muted: Boolean,
    maxMs: Long,
    loop: Boolean,
    startPositionMs: Long,
    active: Boolean,
    fitMode: String,
    cacheFactory: CacheDataSource.Factory?,
    onProgress: (Float, Long) -> Unit,
    onCompleted: () -> Unit,
    onStarted: () -> Unit,
    onFailed: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val player = remember(url, cacheFactory) {
        runCatching {
            val builder = ExoPlayer.Builder(context)
            if (cacheFactory != null) builder.setMediaSourceFactory(DefaultMediaSourceFactory(cacheFactory))
            builder.build().apply {
                setMediaItem(MediaItem.fromUri(url))
                repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
                playWhenReady = false
                if (startPositionMs > 0L) seekTo(startPositionMs)
                prepare()
            }
        }.getOrNull()
    }

    DisposableEffect(player) {
        if (player == null) {
            onFailed()
            return@DisposableEffect onDispose { }
        }
        val listener = object : Player.Listener {
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                onFailed()
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) onCompleted()
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) onStarted()
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }

    LaunchedEffect(player, active, muted) {
        if (player == null) return@LaunchedEffect
        player.volume = if (muted) 0f else 1f
        if (active) {
            runCatching { player.play() }.onFailure { onFailed() }
        } else {
            player.pause()
        }
    }

    // 生命周期：进入后台立刻暂停，避免后台解码与耗电。
    DisposableEffect(lifecycleOwner, player) {
        if (player == null) return@DisposableEffect onDispose { }
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP -> player.pause()
                Lifecycle.Event.ON_RESUME -> if (active) runCatching { player.play() }.onFailure { onFailed() }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // 进度与播放上限：到点即暂停并通知切换，避免一条长视频卡住整个轮播。
    LaunchedEffect(player, maxMs) {
        if (player == null) return@LaunchedEffect
        while (true) {
            val duration = runCatching { player.duration }.getOrDefault(0L)
            val position = runCatching { player.currentPosition }.getOrDefault(0L)
            if (duration > 0L) {
                onProgress(
                    (position.toFloat() / minOf(duration, maxMs).toFloat()).coerceIn(0f, 1f),
                    position,
                )
            }
            // 循环播放时播放器不会进入 ENDED，这里按上限统一触发切换。
            if (position >= maxMs && player.isPlaying) {
                player.pause()
                onProgress(1f, position)
                onCompleted()
            }
            delay(120)
        }
    }

    if (player == null) return
    AndroidView(
        factory = { ctx ->
            val view = android.view.LayoutInflater.from(ctx)
                .inflate(R.layout.view_banner_player, null) as PlayerView
            view.useController = false
            view.setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
            view.resizeMode = if (fitMode == "contain") {
                AspectRatioFrameLayout.RESIZE_MODE_FIT
            } else {
                AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            }
            view.player = player
            view
        },
        update = { view ->
            view.player = player
            view.resizeMode = if (fitMode == "contain") {
                AspectRatioFrameLayout.RESIZE_MODE_FIT
            } else {
                AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            }
        },
        modifier = Modifier.fillMaxSize(),
    )
}
