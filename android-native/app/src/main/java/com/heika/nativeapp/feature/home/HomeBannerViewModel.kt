package com.heika.nativeapp.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaBannerFeed
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.ui.HeikaBannerMediaCache
import com.heika.nativeapp.ui.HeikaCoroutineGuard
import com.heika.nativeapp.ui.NativePreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * 首页推荐位。
 *
 * 独立于翻卡 ViewModel：轮播刷新不应触发卡池重算，卡池操作也不该让轮播闪烁。
 * 首帧用本地缓存立即出图，网络回来后再比对 version 决定是否替换；
 * 本地缓存超过服务端下发的 ttl 就不再使用，避免长期展示已下架内容。
 */
@HiltViewModel
class HomeBannerViewModel @Inject constructor(
    private val repository: HeikaRepository,
    private val prefs: NativePreferences,
    val mediaCache: HeikaBannerMediaCache,
) : ViewModel() {

    data class State(
        val feed: HeikaBannerFeed? = null,
        val loading: Boolean = true,
    )

    private val mutableState = MutableStateFlow(State())
    val state = mutableState.asStateFlow()

    @Volatile
    private var lastFetchAt: Long = 0L

    init { load() }

    fun load() {
        viewModelScope.launch(HeikaCoroutineGuard) {
            // 1) 本地缓存先渲染，避免首帧空白把卡池顶上去。
            if (mutableState.value.feed == null) {
                val cached = runCatching { prefs.homeBanners.first() }.getOrNull()
                val savedAt = runCatching { prefs.homeBannersSavedAt.first() }.getOrDefault(0L)
                val parsed = cached?.takeIf { it.isNotBlank() }?.let { raw ->
                    runCatching { HeikaBannerFeed.from(JSONObject(raw)) }.getOrNull()
                }
                val ttlMs = (parsed?.settings?.cacheTtlHours ?: 72) * 3_600_000L
                val expired = savedAt > 0L && System.currentTimeMillis() - savedAt > ttlMs
                if (parsed != null && !expired) {
                    mutableState.update { it.copy(feed = parsed, loading = false) }
                }
            }
            // 2) 网络结果覆盖缓存；版本没变就只更新内存，不重复写盘。
            val previous = mutableState.value.feed
            val fresh = repository.homeBanners()
            lastFetchAt = System.currentTimeMillis()
            if (fresh != null) {
                mutableState.update { it.copy(feed = fresh, loading = false) }
                if (previous?.version != fresh.version && fresh.raw.isNotBlank()) {
                    runCatching { prefs.saveHomeBanners(fresh.raw) }
                }
            } else {
                mutableState.update { it.copy(loading = false) }
            }
        }
    }

    /** 页面回到前台时调用：只在配置可能过期时才真的打网络。 */
    fun refreshIfStale(maxAgeMs: Long = 10 * 60 * 1000L) {
        val fetchedAt = lastFetchAt
        if (fetchedAt > 0L && System.currentTimeMillis() - fetchedAt < maxAgeMs) return
        load()
    }

    /**
     * 运营埋点。会话标识按进程生成，服务端还会叠加 30 秒去重窗口，
     * 因此重复组合、快速滑动都不会把曝光数打高。
     */
    fun track(bannerId: String, event: String, durationMs: Long? = null) {
        if (bannerId.isBlank()) return
        viewModelScope.launch(HeikaCoroutineGuard) {
            repository.trackBannerEvent(bannerId, event, sessionKey, durationMs)
        }
    }

    override fun onCleared() {
        mediaCache.cancelAllPreloads()
        super.onCleared()
    }

    private val sessionKey: String = "app" + java.util.UUID.randomUUID().toString().replace("-", "").take(18)
}
