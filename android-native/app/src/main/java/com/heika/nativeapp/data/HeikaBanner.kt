package com.heika.nativeapp.data

import org.json.JSONObject

/** 首页推荐位配置：高度、播放与降级策略全部来自服务端，客户端不写死任何尺寸。 */
data class HeikaBannerSettings(
    val enabled: Boolean,
    val autoplay: Boolean,
    val imageDurationMs: Int,
    val transitionMs: Int,
    val videoAutoplay: Boolean,
    val videoMuted: Boolean,
    val allowUnmute: Boolean,
    val dataSaverFallback: Boolean,
    val videoMaxMs: Int,
    val videoPlayMode: String,
    val videoLoop: Boolean,
    val preloadMode: String,
    val showText: Boolean,
    val cacheTtlHours: Int,
    val sizeMode: String,
    val coverRatio: String,
    val appHeight: Int,
    val radius: Int,
    val fitMode: String,
    val focus: String,
    val showIndicator: Boolean,
    val version: Int,
) {
    /** 宽高比数值：解析失败时退回 3:1，与后台默认值一致。 */
    val ratio: Float
        get() {
            val parts = coverRatio.split(":", "/")
            if (parts.size != 2) return 3f
            val width = parts[0].trim().toFloatOrNull() ?: return 3f
            val height = parts[1].trim().toFloatOrNull() ?: return 3f
            if (width <= 0f || height <= 0f) return 3f
            return (width / height).coerceIn(0.8f, 8f)
        }

    companion object {
        fun from(json: JSONObject): HeikaBannerSettings = HeikaBannerSettings(
            enabled = json.optBoolean("enabled", true),
            autoplay = json.optBoolean("autoplay", true),
            imageDurationMs = json.optInt("imageDurationMs", 5000).coerceIn(1500, 20000),
            transitionMs = json.optInt("transitionMs", 450).coerceIn(120, 1500),
            videoAutoplay = json.optBoolean("videoAutoplay", true),
            videoMuted = json.optBoolean("videoMuted", true),
            allowUnmute = json.optBoolean("allowUnmute", true),
            dataSaverFallback = json.optBoolean("dataSaverFallback", true),
            videoMaxMs = json.optInt("videoMaxMs", 30000).coerceIn(3000, 120000),
            videoPlayMode = json.optString("videoPlayMode", "full"),
            videoLoop = json.optBoolean("videoLoop", false),
            preloadMode = json.optString("preloadMode", "next"),
            showText = json.optBoolean("showText", true),
            cacheTtlHours = json.optInt("cacheTtlHours", 72).coerceIn(1, 720),
            sizeMode = json.optString("sizeMode", "ratio"),
            coverRatio = json.optString("coverRatio", "3:1"),
            appHeight = json.optJSONObject("heights")?.optInt("app", 120) ?: 120,
            radius = json.optInt("radius", 12).coerceIn(0, 28),
            fitMode = json.optString("fitMode", "cover"),
            focus = json.optString("focus", "center"),
            showIndicator = json.optBoolean("showIndicator", true),
            version = json.optInt("version", 1),
        )
    }
}

/** 单条轮播内容：图片与视频共用同一结构，只用 mediaType 区分。 */
data class HeikaBanner(
    val id: String,
    val mediaType: String,
    val imageUrl: String?,
    val videoUrl: String?,
    val posterUrl: String?,
    val videoDurationMs: Int?,
    val displayMs: Int?,
    val targetType: String,
    val targetId: String?,
    val externalUrl: String?,
    val targetValid: Boolean,
    val focus: String,
    val alt: String,
    val title: String,
    val subtitle: String,
    val description: String,
    val showText: Boolean,
    val fitMode: String?,
    val posterFit: String,
) {
    val isVideo: Boolean get() = mediaType == "video" && !videoUrl.isNullOrBlank()
    val hasTarget: Boolean
        get() = targetValid && when (targetType) {
            "none" -> false
            "external" -> !externalUrl.isNullOrBlank()
            else -> !targetId.isNullOrBlank()
        }

    companion object {
        private fun url(value: String?): String? {
            val text = value?.trim().orEmpty()
            if (text.isEmpty()) return null
            return if (text.startsWith("http")) text else text.toWebUrl()
        }

        fun from(json: JSONObject): HeikaBanner = HeikaBanner(
            id = json.optString("id"),
            mediaType = json.optString("mediaType", "image"),
            imageUrl = url(json.optString("imageUrl")),
            videoUrl = url(json.optString("videoUrl")),
            posterUrl = url(json.optString("posterUrl")),
            videoDurationMs = json.optInt("videoDurationMs").takeIf { it > 0 },
            displayMs = json.optInt("displayMs").takeIf { it > 0 },
            targetType = json.optString("targetType", "none"),
            targetId = json.optString("targetId").takeIf { it.isNotBlank() && it != "null" },
            externalUrl = json.optString("targetUrl").takeIf { it.isNotBlank() && it != "null" },
            targetValid = json.optBoolean("targetValid", true),
            focus = json.optString("focus", "center"),
            alt = json.optString("alt"),
            title = json.optString("title"),
            subtitle = json.optString("subtitle"),
            description = json.optString("description"),
            showText = json.optBoolean("showText", true),
            fitMode = json.optString("fitMode").takeIf { it == "cover" || it == "contain" },
            posterFit = if (json.optString("posterFit") == "contain") "contain" else "cover",
        )
    }
}

data class HeikaBannerFeed(
    val settings: HeikaBannerSettings,
    val items: List<HeikaBanner>,
    val version: String,
    /** 原始响应：用于本地缓存，避免重新拼装造成字段丢失。 */
    val raw: String = "",
) {
    companion object {
        fun from(json: JSONObject): HeikaBannerFeed {
            val settings = json.optJSONObject("settings")?.let(HeikaBannerSettings::from) ?: HeikaBannerSettings(
                enabled = false, autoplay = false, imageDurationMs = 5000, transitionMs = 450,
                videoAutoplay = false, videoMuted = true, allowUnmute = false, dataSaverFallback = true,
                videoMaxMs = 30000, videoPlayMode = "full", videoLoop = false, preloadMode = "next",
                showText = true, cacheTtlHours = 72, sizeMode = "ratio", coverRatio = "3:1", appHeight = 120,
                radius = 12, fitMode = "cover", focus = "center", showIndicator = true, version = 0,
            )
            val items = json.optJSONArray("items").jsonObjects().map(HeikaBanner::from).filter { it.id.isNotBlank() }
            return HeikaBannerFeed(settings, items, json.optString("version"), json.toString())
        }
    }
}
