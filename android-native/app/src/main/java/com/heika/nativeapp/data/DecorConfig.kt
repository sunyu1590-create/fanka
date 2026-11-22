package com.heika.nativeapp.data

import androidx.compose.ui.graphics.Color
import org.json.JSONObject

/**
 * 装扮主题在原生端的映射。
 *
 * 与网页 `lib/decor/types.ts` 保持同一份语义：
 * - 只描述外观，不携带脚本；
 * - 颜色与透明度分开，透明度只作用于背景层；
 * - 深浅色可分别配置，`mode = follow` 时统一使用深色那套（与网页一致）。
 */
data class BarPalette(
    val bg: Color,
    val bgOpacity: Float,
    val border: Color,
    val borderOpacity: Float,
    val icon: Color,
    val activeIcon: Color,
    val label: Color,
    val activeLabel: Color,
    val activePill: Color,
    val activePillOpacity: Float,
)

data class DecorIcon(
    val normal: String?,
    val active: String?,
    val tint: Boolean,
    val scale: Float,
    val fitCover: Boolean,
) {
    fun source(activeSlot: Boolean): String? = if (activeSlot) active ?: normal else normal
    val usable: Boolean get() = !normal.isNullOrBlank() || !active.isNullOrBlank()
}

data class BarSkin(
    val split: Boolean,
    val dark: BarPalette,
    val light: BarPalette,
    val icons: Map<String, DecorIcon>,
    val publishBg: Color,
    val publishIcon: Color,
    val publishIconUrl: String?,
    val publishTinted: Boolean,
    /** 网页端底栏文字显示开关（需求十）：true=图标＋文字。原生保留并回写，避免覆盖网页设置。 */
    val showLabel: Boolean = true,
) {
    fun palette(darkMode: Boolean): BarPalette = if (split && !darkMode) light else dark
    fun icon(slot: String): DecorIcon? = icons[slot]?.takeIf { it.usable }
}

data class CardPalette(
    val backBg: Color,
    val backImage: String?,
    val texture: String,
    val pattern: String,
    val backBorder: Color,
    val numberColor: Color,
    val hintColor: Color,
    val actionBg: Color,
    val actionText: Color,
    val contentBg: Color,
    val contentBorder: Color,
    val contentImage: String?,
    /** 内容面低强度纹理（与网页 lib/decor/types.ts 同枚举） */
    val contentTexture: String,
    /** 内容区域遮罩强度（0 – 0.6），只压暗装饰底图，不影响作者封面 */
    val contentScrim: Float,
    val titleColor: Color,
    val bodyColor: Color,
    val chipBg: Color,
    val chipBorder: Color,
    val accent: Color,
)

data class CardSkin(
    val split: Boolean,
    val dark: CardPalette,
    val light: CardPalette,
) {
    fun palette(darkMode: Boolean): CardPalette = if (split && !darkMode) light else dark
}

data class DecorConfig(
    val bar: BarSkin,
    val card: CardSkin,
    /** 主题标识，用于原生侧判断是否需要刷新（主题变了才重建底栏） */
    val barThemeId: String?,
    val cardThemeId: String?,
    /** 服务端配置版本（updatedAt），用于双端确认「同一版本已渲染」。 */
    val syncVersion: String,
) {
    companion object {
        val DARK_BAR = BarPalette(
            bg = Color(0xFF0B0D0F), bgOpacity = 0.92f,
            border = Color.White, borderOpacity = 0.1f,
            icon = Color(0xFF8E9099), activeIcon = Color(0xFFE9D9AE),
            label = Color(0xFF8E9099), activeLabel = Color(0xFFF2E7C8),
            activePill = Color(0xFFC9A961), activePillOpacity = 0.12f,
        )
        val LIGHT_BAR = BarPalette(
            bg = Color(0xFFFBFBF9), bgOpacity = 0.94f,
            border = Color(0xFF1A1A1A), borderOpacity = 0.08f,
            icon = Color(0xFF6F7178), activeIcon = Color(0xFF8A6E28),
            label = Color(0xFF6F7178), activeLabel = Color(0xFF6B5416),
            activePill = Color(0xFF93762F), activePillOpacity = 0.1f,
        )
        val DARK_CARD = CardPalette(
            backBg = Color(0xFF101215), backImage = null, texture = "linen", pattern = "monogram",
            backBorder = Color(0xFF2C3238), numberColor = Color(0xFFC9D5DA), hintColor = Color(0xFF8C969C),
            actionBg = Color(0xFFC9D5DA), actionText = Color(0xFF101619),
            contentBg = Color(0xFF14161A), contentBorder = Color(0xFF262A30), contentImage = null,
            contentTexture = "none", contentScrim = 0.28f,
            titleColor = Color(0xFFF2F0EA), bodyColor = Color(0xFFB9BCC4),
            chipBg = Color(0xFF1B1D22), chipBorder = Color(0xFF2C3036), accent = Color(0xFFC9A961),
        )
        val LIGHT_CARD = CardPalette(
            backBg = Color(0xFFEDE9E1), backImage = null, texture = "linen", pattern = "monogram",
            backBorder = Color(0xFFC9C3B6), numberColor = Color(0xFF4B463D), hintColor = Color(0xFF7A7468),
            actionBg = Color(0xFF2B2B28), actionText = Color(0xFFF7F5EF),
            contentBg = Color(0xFFFCFCFD), contentBorder = Color(0xFFE4E4E2), contentImage = null,
            contentTexture = "none", contentScrim = 0.18f,
            titleColor = Color(0xFF1B1C1E), bodyColor = Color(0xFF5C5F66),
            chipBg = Color(0xFFF2F1EC), chipBorder = Color(0xFFE0DED7), accent = Color(0xFF93762F),
        )

        val DEFAULT = DecorConfig(
            bar = BarSkin(
                split = false, dark = DARK_BAR, light = LIGHT_BAR, icons = emptyMap(),
                publishBg = Color(0xFFF5F4F0), publishIcon = Color(0xFF202125), publishIconUrl = null, publishTinted = false,
            ),
            card = CardSkin(split = false, dark = DARK_CARD, light = LIGHT_CARD),
            barThemeId = null,
            cardThemeId = null,
            syncVersion = "",
        )

        private val HEX = Regex("^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
        private val REMOTE = Regex("^https://[^\\s\"'<>\\\\]+$")
        private val RELATIVE = Regex("^/[^\\s\"'<>\\\\]*$")

        fun parseColor(value: String?, fallback: Color): Color {
            val trimmed = value?.trim().orEmpty()
            if (!HEX.matches(trimmed)) return fallback
            return runCatching { Color(android.graphics.Color.parseColor(trimmed)) }.getOrDefault(fallback)
        }

        fun parseOpacity(value: Double?, fallback: Float): Float {
            if (value == null || value.isNaN()) return fallback
            return (value.coerceIn(0.0, 1.0)).toFloat()
        }

        /** 只接受本站相对路径与 https 地址，拒绝 data:/javascript: 等任何外部注入。 */
        fun parseImage(value: String?): String? {
            val trimmed = value?.trim().orEmpty()
            if (trimmed.isEmpty()) return null
            if (RELATIVE.matches(trimmed)) return trimmed
            if (!REMOTE.matches(trimmed)) return null
            if (!trimmed.startsWith("https://")) return null
            return trimmed
        }

        fun fromSettings(json: JSONObject): DecorConfig {
            val data = json.optJSONObject("data") ?: json
            val barNode = data.optJSONObject("bottomBar")
            val cardNode = data.optJSONObject("card")
            return DecorConfig(
                bar = parseBar(barNode),
                card = parseCard(cardNode),
                // 只有「从主题应用」的配置才带主题编号；工作室里手工调的配色为 null。
                barThemeId = data.optString("bottomBarThemeId").takeIf { it.isNotBlank() && it != "null" },
                cardThemeId = data.optString("cardThemeId").takeIf { it.isNotBlank() && it != "null" },
                syncVersion = data.optString("updatedAt").takeIf { it.isNotBlank() && it != "null" }.orEmpty(),
            )
        }

        private fun parseBar(node: JSONObject?): BarSkin {
            if (node == null) return DEFAULT.bar
            val iconsNode = node.optJSONObject("icons")
            val icons = buildMap {
                listOf("home", "discover", "messages", "mine").forEach { slot ->
                    val item = iconsNode?.optJSONObject(slot) ?: return@forEach
                    val icon = DecorIcon(
                        normal = parseImage(item.optString("normal")),
                        active = parseImage(item.optString("active")),
                        tint = item.optBoolean("tint", true),
                        scale = item.optDouble("scale", 1.0).toFloat().coerceIn(0.6f, 1.4f),
                        fitCover = item.optString("fit") == "cover",
                    )
                    if (icon.usable) put(slot, icon)
                }
            }
            val publish = node.optJSONObject("publish")
            return BarSkin(
                split = node.optString("mode") == "split",
                dark = parsePalette(node.optJSONObject("dark"), DARK_BAR),
                light = parsePalette(node.optJSONObject("light"), LIGHT_BAR),
                icons = icons,
                publishBg = parseColor(publish?.optString("bg"), Color(0xFFF5F4F0)),
                publishIcon = parseColor(publish?.optString("icon"), Color(0xFF202125)),
                publishIconUrl = parseImage(publish?.optString("iconUrl")),
                publishTinted = publish?.optBoolean("tinted", false) ?: false,
                showLabel = node.optBoolean("showLabel", true),
            )
        }

        private fun parsePalette(node: JSONObject?, fallback: BarPalette): BarPalette {
            if (node == null) return fallback
            return BarPalette(
                bg = parseColor(node.optString("bg"), fallback.bg),
                bgOpacity = parseOpacity(node.optDouble("bgOpacity", Double.NaN).takeUnless { it.isNaN() }, fallback.bgOpacity),
                border = parseColor(node.optString("border"), fallback.border),
                borderOpacity = parseOpacity(node.optDouble("borderOpacity", Double.NaN).takeUnless { it.isNaN() }, fallback.borderOpacity),
                icon = parseColor(node.optString("icon"), fallback.icon),
                activeIcon = parseColor(node.optString("activeIcon"), fallback.activeIcon),
                label = parseColor(node.optString("label"), fallback.label),
                activeLabel = parseColor(node.optString("activeLabel"), fallback.activeLabel),
                activePill = parseColor(node.optString("activePill"), fallback.activePill),
                activePillOpacity = parseOpacity(node.optDouble("activePillOpacity", Double.NaN).takeUnless { it.isNaN() }, fallback.activePillOpacity),
            )
        }

        private fun parseCard(node: JSONObject?): CardSkin {
            if (node == null) return DEFAULT.card
            return CardSkin(
                split = node.optString("mode") == "split",
                dark = parseCardPalette(node.optJSONObject("dark"), DARK_CARD),
                light = parseCardPalette(node.optJSONObject("light"), LIGHT_CARD),
            )
        }

        private fun parseCardPalette(node: JSONObject?, fallback: CardPalette): CardPalette {
            if (node == null) return fallback
            val textures = setOf("none", "linen", "dots", "grid", "paper", "noise", "rings", "diamonds")
            val texture = node.optString("texture").takeIf { it in textures } ?: fallback.texture
            val contentTexture = node.optString("contentTexture").takeIf { it in textures } ?: fallback.contentTexture
            val pattern = node.optString("pattern").takeIf { it in setOf("none", "monogram", "diamond", "frame") } ?: fallback.pattern
            return CardPalette(
                backBg = parseColor(node.optString("backBg"), fallback.backBg),
                backImage = parseImage(node.optString("backImage")),
                texture = texture,
                pattern = pattern,
                backBorder = parseColor(node.optString("backBorder"), fallback.backBorder),
                numberColor = parseColor(node.optString("numberColor"), fallback.numberColor),
                hintColor = parseColor(node.optString("hintColor"), fallback.hintColor),
                actionBg = parseColor(node.optString("actionBg"), fallback.actionBg),
                actionText = parseColor(node.optString("actionText"), fallback.actionText),
                contentBg = parseColor(node.optString("contentBg"), fallback.contentBg),
                contentBorder = parseColor(node.optString("contentBorder"), fallback.contentBorder),
                contentImage = parseImage(node.optString("contentImage")),
                contentTexture = contentTexture,
                contentScrim = parseOpacity(node.optDouble("contentScrim", Double.NaN).takeUnless { it.isNaN() }, fallback.contentScrim).coerceIn(0f, 0.6f),
                titleColor = parseColor(node.optString("titleColor"), fallback.titleColor),
                bodyColor = parseColor(node.optString("bodyColor"), fallback.bodyColor),
                chipBg = parseColor(node.optString("chipBg"), fallback.chipBg),
                chipBorder = parseColor(node.optString("chipBorder"), fallback.chipBorder),
                accent = parseColor(node.optString("accent"), fallback.accent),
            )
        }
    }
}

/* ------------------------------------------------------------------
 * 序列化：保存回服务端时与网页 lib/decor/types.ts 同一契约。
 * 字段名与 normalizeBottomBar / normalizeCard 的输入一致，
 * 尤其保留 showLabel 等网页专属字段，避免原生保存覆盖网页设置。
 * ------------------------------------------------------------------ */

private fun colorHex(color: Color): String {
    val r = (color.red * 255).toInt().coerceIn(0, 255)
    val g = (color.green * 255).toInt().coerceIn(0, 255)
    val b = (color.blue * 255).toInt().coerceIn(0, 255)
    return String.format("#%02X%02X%02X", r, g, b)
}

fun BarPalette.toJson(): JSONObject = JSONObject()
    .put("bg", colorHex(bg)).put("bgOpacity", bgOpacity.toDouble())
    .put("border", colorHex(border)).put("borderOpacity", borderOpacity.toDouble())
    .put("icon", colorHex(icon)).put("activeIcon", colorHex(activeIcon))
    .put("label", colorHex(label)).put("activeLabel", colorHex(activeLabel))
    .put("activePill", colorHex(activePill)).put("activePillOpacity", activePillOpacity.toDouble())

fun CardPalette.toJson(): JSONObject = JSONObject()
    .put("backBg", colorHex(backBg)).put("backImage", backImage ?: "")
    .put("texture", texture).put("pattern", pattern)
    .put("backBorder", colorHex(backBorder)).put("numberColor", colorHex(numberColor)).put("hintColor", colorHex(hintColor))
    .put("actionBg", colorHex(actionBg)).put("actionText", colorHex(actionText))
    .put("contentBg", colorHex(contentBg)).put("contentBorder", colorHex(contentBorder)).put("contentImage", contentImage ?: "")
    .put("contentTexture", contentTexture).put("contentScrim", contentScrim.toDouble())
    .put("titleColor", colorHex(titleColor)).put("bodyColor", colorHex(bodyColor))
    .put("chipBg", colorHex(chipBg)).put("chipBorder", colorHex(chipBorder)).put("accent", colorHex(accent))

fun DecorIcon.toJson(): JSONObject = JSONObject()
    .put("normal", normal ?: "").put("active", active ?: "")
    .put("tint", tint).put("scale", scale.toDouble()).put("fit", if (fitCover) "cover" else "contain")

fun BarSkin.toJson(): JSONObject {
    val iconsJson = JSONObject()
    icons.forEach { (slot, icon) -> iconsJson.put(slot, icon.toJson()) }
    return JSONObject()
        .put("mode", if (split) "split" else "follow")
        .put("dark", dark.toJson())
        .put("light", light.toJson())
        .put("icons", iconsJson)
        .put("publish", JSONObject()
            .put("bg", colorHex(publishBg))
            .put("icon", colorHex(publishIcon))
            .put("iconUrl", publishIconUrl ?: "")
            .put("tinted", publishTinted))
        .put("showLabel", showLabel)
}

fun CardSkin.toJson(): JSONObject = JSONObject()
    .put("mode", if (split) "split" else "follow")
    .put("dark", dark.toJson())
    .put("light", light.toJson())
