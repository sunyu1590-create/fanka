package com.heika.lite

import android.app.ActivityManager
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 三种正式运行模式。AUTO 只表示由本机推荐值决定，对网页暴露时永远解析为具体模式。 */
enum class PerformanceMode(val wire: String) {
    AUTO("auto"),
    ULTRA_LIGHT("ultra-light"),
    BALANCED("balanced"),
    FULL("full");

    companion object {
        fun fromWire(value: String?): PerformanceMode? =
            entries.firstOrNull { it.wire.equals(value, ignoreCase = true) }
    }
}

enum class ThemeMode(val wire: String) {
    SYSTEM("system"),
    LIGHT("light"),
    DARK("dark");

    companion object {
        fun fromWire(value: String?): ThemeMode? =
            entries.firstOrNull { it.wire.equals(value, ignoreCase = true) }
    }
}

class LitePrefs(context: Context) {
    private val sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    var performanceMode: PerformanceMode
        get() = PerformanceMode.entries.firstOrNull { it.name == sp.getString(K_PERF, null) }
            ?: PerformanceMode.AUTO
        set(value) = sp.edit().putString(K_PERF, value.name).apply()

    var themeMode: ThemeMode
        get() = ThemeMode.entries.firstOrNull { it.name == sp.getString(K_THEME, null) }
            ?: ThemeMode.SYSTEM
        set(value) = sp.edit().putString(K_THEME, value.name).apply()

    var autoDegrade: Boolean
        get() = sp.getBoolean(K_AUTO_DEGRADE, true)
        set(value) = sp.edit().putBoolean(K_AUTO_DEGRADE, value).apply()

    var cacheBudgetMb: Int
        get() = sp.getInt(K_CACHE_MB, 256).coerceIn(64, 2048)
        set(value) = sp.edit().putInt(K_CACHE_MB, value.coerceIn(64, 2048)).apply()

    /** 最近登录的账号标识，仅用于本地草稿与缓存分区，不作为任何鉴权依据。 */
    var lastAccountKey: String?
        get() = sp.getString(K_ACCOUNT, null)
        set(value) = sp.edit().putString(K_ACCOUNT, value).apply()

    var lastSafeRoute: String?
        get() = sp.getString(K_ROUTE, null)
        set(value) = sp.edit().putString(K_ROUTE, value).apply()

    private companion object {
        const val PREFS = "heika_lite_prefs"
        const val K_PERF = "performance_mode"
        const val K_THEME = "theme_mode"
        const val K_AUTO_DEGRADE = "auto_degrade"
        const val K_CACHE_MB = "cache_budget_mb"
        const val K_ACCOUNT = "last_account"
        const val K_ROUTE = "last_route"
    }
}

/** 非敏感设备运行指标，全部来自系统 API，不做估算。 */
object DeviceProfile {

    fun recommendedMode(context: Context): PerformanceMode {
        val am = context.getSystemService(ActivityManager::class.java)
        val mi = ActivityManager.MemoryInfo()
        am?.getMemoryInfo(mi)
        val totalMb = (mi.totalMem / (1024L * 1024L)).toInt()
        val lowRam = am?.isLowRamDevice == true
        val availRatio = if (mi.totalMem > 0) mi.availMem.toDouble() / mi.totalMem else 1.0
        val base = when {
            lowRam || totalMb <= 2048 -> PerformanceMode.ULTRA_LIGHT
            totalMb <= 4096 -> PerformanceMode.BALANCED
            else -> PerformanceMode.FULL
        }
        return if (availRatio < 0.15) {
            when (base) {
                PerformanceMode.FULL -> PerformanceMode.BALANCED
                PerformanceMode.BALANCED -> PerformanceMode.ULTRA_LIGHT
                else -> PerformanceMode.ULTRA_LIGHT
            }
        } else base
    }

    fun webViewVersion(): String {
        val pkg = runCatching { WebView.getCurrentWebViewPackage() }.getOrNull() ?: return "unknown"
        return pkg.packageName + " " + (pkg.versionName ?: "unknown")
    }

    fun powerSave(context: Context): Boolean =
        context.getSystemService(PowerManager::class.java)?.isPowerSaveMode ?: false

    fun snapshot(
        context: Context,
        windowWidthDp: Int,
        windowHeightDp: Int,
        density: Float
    ): JSONObject {
        val am = context.getSystemService(ActivityManager::class.java)
        val mi = ActivityManager.MemoryInfo()
        am?.getMemoryInfo(mi)
        return JSONObject()
            .put("totalMemMb", (mi.totalMem / (1024L * 1024L)).toInt())
            .put("availMemMb", (mi.availMem / (1024L * 1024L)).toInt())
            .put("lowRamDevice", am?.isLowRamDevice == true)
            .put("cores", Runtime.getRuntime().availableProcessors())
            .put("sdkInt", Build.VERSION.SDK_INT)
            .put("androidRelease", Build.VERSION.RELEASE)
            .put("manufacturer", Build.MANUFACTURER)
            .put("model", Build.MODEL)
            .put("webViewVersion", webViewVersion())
            .put("windowWidthDp", windowWidthDp)
            .put("windowHeightDp", windowHeightDp)
            .put("density", density.toDouble())
            .put("powerSave", powerSave(context))
            .put("recommendedMode", recommendedMode(context).wire)
            .put("clientVersion", BuildInfo.VERSION_NAME)
            .put("clientVersionCode", BuildInfo.VERSION_CODE.toLong())
            .put("protocolVersion", BuildInfo.PROTOCOL_VERSION.toLong())
    }
}

/** 本地诊断事件，仅写应用私有目录，不上传。 */
class LiteDiagnostics(private val context: Context) {

    private val dir = File(context.filesDir, "diagnostics").apply { mkdirs() }
    private val eventFile = File(dir, "events.log")
    private val stamp = SimpleDateFormat("MM-dd HH:mm:ss", Locale.US)
    private val lock = Any()

    fun record(event: String, value: Long? = null) {
        synchronized(lock) {
            runCatching {
                val sb = StringBuilder(stamp.format(Date())).append(' ').append(event)
                if (value != null) sb.append('=').append(value)
                sb.append('\n')
                eventFile.appendText(sb.toString())
                if (eventFile.length() > MAX_LOG_BYTES) {
                    val tail = eventFile.readLines().takeLast(200)
                    eventFile.writeText(tail.joinToString("\n", postfix = "\n"))
                }
            }
        }
    }

    fun recordPreviousExitReason() {
        val previous = context.getSharedPreferences("heika_lite_exit", Context.MODE_PRIVATE)
        val reason = previous.getInt("reason", 0)
        if (reason != 0) {
            record("previous_exit", reason.toLong())
            previous.edit().putInt("reason", 0).apply()
        }
    }

    fun saveExitReason(reason: Int) {
        context.getSharedPreferences("heika_lite_exit", Context.MODE_PRIVATE)
            .edit().putInt("reason", reason).apply()
    }

    fun recent(limit: Int): JSONArray {
        val list = JSONArray()
        runCatching { eventFile.readLines() }.getOrDefault(emptyList())
            .takeLast(limit)
            .forEach { list.put(it) }
        return list
    }

    fun clear() {
        synchronized(lock) { runCatching { eventFile.delete() } }
    }

    private companion object {
        const val MAX_LOG_BYTES = 131072L
    }
}

class HeikaLiteApp : Application() {

    lateinit var prefs: LitePrefs
        private set

    lateinit var diagnostics: LiteDiagnostics
        private set

    override fun onCreate() {
        super.onCreate()
        prefs = LitePrefs(this)
        diagnostics = LiteDiagnostics(this)
        diagnostics.recordPreviousExitReason()
        diagnostics.record("app_create")
        createChannels()
    }

    private fun createChannels() {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        listOf(
            CHANNEL_MESSAGE to "私信消息",
            CHANNEL_COMMENT to "评论与回复",
            CHANNEL_PUBLISH to "发布结果",
            CHANNEL_SYSTEM to "系统通知"
        ).forEach { pair ->
            val channel = NotificationChannel(pair.first, pair.second, NotificationManager.IMPORTANCE_DEFAULT)
            channel.setShowBadge(true)
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_MESSAGE = "heika_lite_message"
        const val CHANNEL_COMMENT = "heika_lite_comment"
        const val CHANNEL_PUBLISH = "heika_lite_publish"
        const val CHANNEL_SYSTEM = "heika_lite_system"
    }
}
