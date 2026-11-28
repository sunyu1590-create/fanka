package com.heika.lite

import android.content.Context
import org.json.JSONObject

/**
 * 进程级运行状态。
 *
 * 说明：偏好（用户选择）与生效模式（实际渲染质量）必须分开保存。
 * 用户选择 ULTRA_LIGHT 时生效模式恒为 ULTRA_LIGHT；选择 AUTO 时生效模式来自
 * 设备推荐值，并可在出现持续内存压力时被自动降级，但不会被静默改成更高档位。
 */
object LiteRuntimeState {

    @Volatile
    var preference: PerformanceMode = PerformanceMode.AUTO
        private set

    @Volatile
    var effectiveMode: PerformanceMode = PerformanceMode.BALANCED
        private set

    @Volatile
    var recommended: PerformanceMode = PerformanceMode.BALANCED
        private set

    @Volatile
    var autoDegrade: Boolean = true
        private set

    @Volatile
    var themePreference: ThemeMode = ThemeMode.SYSTEM
        private set

    @Volatile
    var darkActive: Boolean = false
        private set

    fun restore(context: Context) {
        val prefs = (context.applicationContext as HeikaLiteApp).prefs
        preference = prefs.performanceMode
        autoDegrade = prefs.autoDegrade
        themePreference = prefs.themeMode
        recommended = DeviceProfile.recommendedMode(context)
        effectiveMode = resolveEffective()
    }

    fun setPreference(context: Context, mode: PerformanceMode) {
        preference = mode
        (context.applicationContext as HeikaLiteApp).prefs.performanceMode = mode
        effectiveMode = resolveEffective()
    }

    fun setAutoDegrade(context: Context, enabled: Boolean) {
        autoDegrade = enabled
        (context.applicationContext as HeikaLiteApp).prefs.autoDegrade = enabled
        if (!enabled) effectiveMode = resolveEffective()
    }

    /** 自动降级只降不升；只有重新 resolve 或用户改设置才可能回到更高档位。 */
    fun applyDegrade(target: PerformanceMode) {
        if (!autoDegrade) return
        if (rank(target) < rank(effectiveMode)) effectiveMode = target
    }

    fun refreshRecommended(context: Context) {
        recommended = DeviceProfile.recommendedMode(context)
        effectiveMode = resolveEffective()
    }

    fun setTheme(context: Context, mode: ThemeMode, dark: Boolean) {
        themePreference = mode
        darkActive = dark
        (context.applicationContext as HeikaLiteApp).prefs.themeMode = mode
    }

    fun setDarkActive(dark: Boolean) {
        darkActive = dark
    }

    fun resolveEffective(): PerformanceMode =
        if (preference == PerformanceMode.AUTO) recommended else preference

    private fun rank(mode: PerformanceMode): Int = when (mode) {
        PerformanceMode.ULTRA_LIGHT -> 0
        PerformanceMode.BALANCED -> 1
        PerformanceMode.FULL -> 2
        PerformanceMode.AUTO -> 1
    }

    /** 提供给网页的统一运行环境描述，任何页面都不需要自己拼装。 */
    fun environment(context: Context, windowWidthDp: Int, windowHeightDp: Int, density: Float): JSONObject {
        val device = DeviceProfile.snapshot(context, windowWidthDp, windowHeightDp, density)
        val mode = effectiveMode
        return JSONObject()
            .put("clientType", LiteBridge.CLIENT_TYPE)
            .put("clientVersion", BuildInfo.VERSION_NAME)
            .put("clientVersionCode", BuildInfo.VERSION_CODE.toLong())
            .put("protocolVersion", BuildInfo.PROTOCOL_VERSION.toLong())
            .put("mode", mode.wire)
            .put("modePreference", preference.wire)
            .put("recommendedMode", recommended.wire)
            .put("autoDegrade", autoDegrade)
            .put("themePreference", themePreference.wire)
            .put("dark", darkActive)
            .put("windowClass", windowClass(windowWidthDp))
            .put("device", device)
    }

    /** 与 Android 窗口尺寸分级保持一致，网页据此决定导航形态。 */
    fun windowClass(widthDp: Int): String = when {
        widthDp < 600 -> "compact"
        widthDp < 840 -> "medium"
        else -> "expanded"
    }
}
