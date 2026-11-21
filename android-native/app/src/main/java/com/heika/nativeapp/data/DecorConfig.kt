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
            titleColor = Color(0xFFF2F0EA), bodyColor = Color(0xFFB9BCC4),
            chipBg = Color(0xFF1B1D22), chipBorder = Color(0xFF2C3036), accent = Color(0xFFC9A961),
        )
        val LIGHT_CARD = CardPalette(
            backBg = Color(0xFFEDE9E1), backImage = null, texture = "linen", pattern = "monogram",
            backBorder = Color(0xFFC9C3B6), numberColor = Color(0xFF4B463D), hintColor = Color(0xFF7A7468),
            actionBg = Color(0xFF2B2B28), actionText = Color(0xFFF7F5EF),
            contentBg = Color(0xFFFCFCFD), contentBorder = Color(0xFFE4E4E2), contentImage = null,
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
                barThemeId = data.optString("bottomBarTitle").takeIf { it.isNotBlank() && it != "null" },
                cardThemeId = data.optString("cardTitle").takeIf { it.isNotBlank() && it != "null" },
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
            val texture = node.optString("texture").takeIf { it in setOf("none", "linen", "grid", "noise") } ?: fallback.texture
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
                titleColor = parseColor(node.optString("titleColor"), fallback.titleColor),
                bodyColor = parseColor(node.optString("bodyColor"), fallback.bodyColor),
                chipBg = parseColor(node.optString("chipBg"), fallback.chipBg),
                chipBorder = parseColor(node.optString("chipBorder"), fallback.chipBorder),
                accent = parseColor(node.optString("accent"), fallback.accent),
            )
        }
    }
}
