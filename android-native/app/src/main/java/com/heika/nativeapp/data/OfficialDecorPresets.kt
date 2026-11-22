package com.heika.nativeapp.data

import org.json.JSONObject

/**
 * 官方预设装扮配置（与网页 lib/decor/official.ts 一一对应）。
 *
 * 内置到 APP 保证：
 * - 离线时仍可预览与应用官方主题；
 * - DB 中只存 `{"preset":"slug"}` 标识的主题也能正确解析为完整配置；
 * - 不依赖服务端 presetConfig() 解析，减少网络往返。
 */
object OfficialDecorPresets {

    /** 按 slug 返回完整配置 JSON（bottomBar + card），可直接喂给 [DecorConfig.fromSettings]。 */
    fun resolveToJson(slug: String?): JSONObject? = slug?.let { PRESETS[it] }

    /** 按 slug 返回解析好的 DecorConfig。 */
    fun resolve(slug: String?): DecorConfig? = slug?.let { PRESETS[it] }?.let { DecorConfig.fromSettings(it) }

    /* ---------- 构建辅助 ---------- */

    private fun bp(vararg pairs: Pair<String, Any>): JSONObject = JSONObject().apply { pairs.forEach { (k, v) -> put(k, v) } }

    private fun icons(pack: String): JSONObject = JSONObject().apply {
        for (slot in listOf("home", "discover", "messages", "mine")) {
            put(slot, JSONObject()
                .put("normal", "/decor/$pack/$slot.png")
                .put("active", "/decor/$pack/$slot-active.png")
                .put("tint", true).put("scale", 1.0).put("fit", "contain"))
        }
    }

    private fun bar(dark: JSONObject, light: JSONObject, iconPack: String? = null): JSONObject = JSONObject()
        .put("mode", "split")
        .put("dark", dark).put("light", light)
        .put("icons", iconPack?.let { icons(it) } ?: JSONObject())

    private fun card(dark: JSONObject, light: JSONObject): JSONObject = JSONObject()
        .put("mode", "split")
        .put("dark", dark).put("light", light)

    /* ---------- 七套官方预设 ---------- */

    private val PRESETS: Map<String, JSONObject> = mapOf(

        // A 黑曜原生 — Lucide 线性，黑曜底栏与淡金选中
        "obsidian-native" to JSONObject()
            .put("bottomBar", bar(
                bp("bg" to "#171A1E", "bgOpacity" to 0.94, "border" to "#5A6068", "borderOpacity" to 0.32,
                    "icon" to "#A7ADB4", "activeIcon" to "#D8C28D", "label" to "#A7ADB4", "activeLabel" to "#E9D9AE",
                    "activePill" to "#D8C28D", "activePillOpacity" to 0.12),
                bp("bg" to "#F4F4F1", "bgOpacity" to 0.95, "border" to "#5A6068", "borderOpacity" to 0.22,
                    "icon" to "#6B7178", "activeIcon" to "#8A6E28", "label" to "#6B7178", "activeLabel" to "#6B5416",
                    "activePill" to "#C9A961", "activePillOpacity" to 0.14),
                "obsidian"))
            .put("card", card(
                bp("backBg" to "#1C2227", "backBorder" to "#5A6068", "numberColor" to "#C9D5DA", "hintColor" to "#A5ADB3",
                    "actionBg" to "#D8C28D", "actionText" to "#242016", "contentBg" to "#171B20", "contentBorder" to "#2C3238",
                    "titleColor" to "#F2F1EB", "bodyColor" to "#A5ADB3", "chipBg" to "#1F252B", "chipBorder" to "#2C3238",
                    "accent" to "#D8C28D", "texture" to "linen", "pattern" to "monogram"),
                bp("backBg" to "#EDEBE4", "backBorder" to "#A8A395", "numberColor" to "#4B463D", "hintColor" to "#7A7468",
                    "actionBg" to "#242016", "actionText" to "#F2F1EB", "contentBg" to "#FBFAF7", "contentBorder" to "#E0DCD2",
                    "titleColor" to "#242220", "bodyColor" to "#5C5F66", "chipBg" to "#F2F0EA", "chipBorder" to "#E0DCD2",
                    "accent" to "#8A6E28", "texture" to "linen", "pattern" to "monogram"))),

        // B 雾松漫游 — Tabler 线性/填充，松绿磨砂
        "mist-pine" to JSONObject()
            .put("bottomBar", bar(
                bp("bg" to "#18231F", "bgOpacity" to 0.92, "border" to "#6E8879", "borderOpacity" to 0.34,
                    "icon" to "#A4B9AD", "activeIcon" to "#C4DEC9", "label" to "#A4B9AD", "activeLabel" to "#E6F3EC",
                    "activePill" to "#C4DEC9", "activePillOpacity" to 0.12),
                bp("bg" to "#F0F5F1", "bgOpacity" to 0.95, "border" to "#6E8879", "borderOpacity" to 0.22,
                    "icon" to "#5F7568", "activeIcon" to "#2F5443", "label" to "#5F7568", "activeLabel" to "#27493A",
                    "activePill" to "#6E9A85", "activePillOpacity" to 0.14),
                "ramble"))
            .put("card", card(
                bp("backBg" to "#23392D", "backBorder" to "#6E8879", "numberColor" to "#C4DEC9", "hintColor" to "#A8BAAC",
                    "actionBg" to "#C4DEC9", "actionText" to "#203126", "contentBg" to "#192820", "contentBorder" to "#2E4A3E",
                    "titleColor" to "#EDF3E9", "bodyColor" to "#A8BAAC", "chipBg" to "#1E3227", "chipBorder" to "#2E4A3E",
                    "accent" to "#C4DEC9", "texture" to "noise", "pattern" to "frame"),
                bp("backBg" to "#DCE7DF", "backBorder" to "#9DB5A8", "numberColor" to "#2E4A3E", "hintColor" to "#67796E",
                    "actionBg" to "#203126", "actionText" to "#EDF3E9", "contentBg" to "#F4F8F4", "contentBorder" to "#D3E0D7",
                    "titleColor" to "#203126", "bodyColor" to "#5C6E63", "chipBg" to "#EAF1EC", "chipBorder" to "#D3E0D7",
                    "accent" to "#3D6B52", "texture" to "noise", "pattern" to "frame"))),

        // C 银白档案 — 浅绿灰档案感
        "silver-archive" to JSONObject()
            .put("bottomBar", bar(
                bp("bg" to "#171B19", "bgOpacity" to 0.93, "border" to "#48574E", "borderOpacity" to 0.3,
                    "icon" to "#93A39A", "activeIcon" to "#C8D8CE", "label" to "#93A39A", "activeLabel" to "#E4EDE7",
                    "activePill" to "#355A45", "activePillOpacity" to 0.34),
                bp("bg" to "#F0F3EE", "bgOpacity" to 0.96, "border" to "#B5C0B7", "borderOpacity" to 0.5,
                    "icon" to "#65746B", "activeIcon" to "#2D5140", "label" to "#65746B", "activeLabel" to "#2D5140",
                    "activePill" to "#355A45", "activePillOpacity" to 0.12)))
            .put("card", card(
                bp("backBg" to "#1B211E", "backBorder" to "#48574E", "numberColor" to "#C8D8CE", "hintColor" to "#8FA097",
                    "actionBg" to "#C8D8CE", "actionText" to "#1A221D", "contentBg" to "#171C19", "contentBorder" to "#2A332E",
                    "titleColor" to "#E8EFEA", "bodyColor" to "#A7B5AC", "chipBg" to "#1F2723", "chipBorder" to "#2A332E",
                    "accent" to "#8FB39F", "texture" to "grid", "pattern" to "frame"),
                bp("backBg" to "#DCE4DB", "backBorder" to "#B5C0B7", "numberColor" to "#2D5140", "hintColor" to "#66766B",
                    "actionBg" to "#355A45", "actionText" to "#FFFFFF", "contentBg" to "#F8FAF5", "contentBorder" to "#D8E0D7",
                    "titleColor" to "#25352B", "bodyColor" to "#66766B", "chipBg" to "#EDF2EA", "chipBorder" to "#D8E0D7",
                    "accent" to "#355A45", "texture" to "grid", "pattern" to "frame"))),

        // D 月下电台 — 靛蓝与月光紫
        "moon-radio" to JSONObject()
            .put("bottomBar", bar(
                bp("bg" to "#202235", "bgOpacity" to 0.93, "border" to "#747995", "borderOpacity" to 0.32,
                    "icon" to "#A9AEC8", "activeIcon" to "#D4CFF0", "label" to "#A9AEC8", "activeLabel" to "#EDEBFA",
                    "activePill" to "#D4CFF0", "activePillOpacity" to 0.12),
                bp("bg" to "#F2F2F8", "bgOpacity" to 0.95, "border" to "#747995", "borderOpacity" to 0.22,
                    "icon" to "#6B7090", "activeIcon" to "#4B4E86", "label" to "#6B7090", "activeLabel" to "#3A3D6B",
                    "activePill" to "#747995", "activePillOpacity" to 0.14)))
            .put("card", card(
                bp("backBg" to "#292D46", "backBorder" to "#747995", "numberColor" to "#D4CFF0", "hintColor" to "#ADB1CA",
                    "actionBg" to "#D4CFF0", "actionText" to "#28283B", "contentBg" to "#1C2031", "contentBorder" to "#3A3F5C",
                    "titleColor" to "#F0EFF8", "bodyColor" to "#ADB1CA", "chipBg" to "#242840", "chipBorder" to "#3A3F5C",
                    "accent" to "#D4CFF0", "texture" to "rings", "pattern" to "none"),
                bp("backBg" to "#DCDAEE", "backBorder" to "#A9A8C9", "numberColor" to "#3A3D6B", "hintColor" to "#737795",
                    "actionBg" to "#28283B", "actionText" to "#F0EFF8", "contentBg" to "#F7F6FC", "contentBorder" to "#E2E0F0",
                    "titleColor" to "#28283B", "bodyColor" to "#666A8A", "chipBg" to "#EDEBF7", "chipBorder" to "#E2E0F0",
                    "accent" to "#4B4E86", "texture" to "rings", "pattern" to "none"))),

        // E 山野来信 — 苔绿与米白
        "letter-from-hills" to JSONObject()
            .put("bottomBar", bar(
                bp("bg" to "#12160F", "bgOpacity" to 0.9, "border" to "#B8C9A0", "borderOpacity" to 0.16,
                    "icon" to "#8E9A80", "activeIcon" to "#D8C68A", "label" to "#8E9A80", "activeLabel" to "#EFE3B8",
                    "activePill" to "#7C8F5A", "activePillOpacity" to 0.22),
                bp("bg" to "#F6F5EC", "bgOpacity" to 0.95, "border" to "#3E4A32", "borderOpacity" to 0.12,
                    "icon" to "#6C7562", "activeIcon" to "#4C5F34", "label" to "#6C7562", "activeLabel" to "#3F5029",
                    "activePill" to "#7C8F5A", "activePillOpacity" to 0.14)))
            .put("card", card(
                bp("backBg" to "#151A12", "backBorder" to "#3B4632", "numberColor" to "#D5DFC2", "hintColor" to "#939C86",
                    "actionBg" to "#C6D3A9", "actionText" to "#1A2114", "contentBg" to "#171C14", "contentBorder" to "#333D2B",
                    "titleColor" to "#F0F1E4", "bodyColor" to "#BCC3AF", "chipBg" to "#1F261A", "chipBorder" to "#3A4630",
                    "accent" to "#B9C98F", "texture" to "noise", "pattern" to "frame"),
                bp("backBg" to "#EDEBDD", "backBorder" to "#C4BFA6", "numberColor" to "#4A4B3A", "hintColor" to "#7C7B65",
                    "actionBg" to "#3A442C", "actionText" to "#F6F5EA", "contentBg" to "#FBFBF4", "contentBorder" to "#E2E0CE",
                    "titleColor" to "#23261B", "bodyColor" to "#5C5F4E", "chipBg" to "#F0EFE0", "chipBorder" to "#DDDBC6",
                    "accent" to "#6C7C46", "texture" to "noise", "pattern" to "frame"))),

        // F 像素工作台 — 八位机像素风
        "pixel-desk" to JSONObject()
            .put("bottomBar", bar(
                bp("bg" to "#0B0E14", "bgOpacity" to 0.94, "border" to "#7FD4C1", "borderOpacity" to 0.2,
                    "icon" to "#7FA0A8", "activeIcon" to "#7FD4C1", "label" to "#7FA0A8", "activeLabel" to "#B6F2E4",
                    "activePill" to "#2A4A46", "activePillOpacity" to 0.6),
                bp("bg" to "#F4F1E8", "bgOpacity" to 0.97, "border" to "#1E2A2A", "borderOpacity" to 0.14,
                    "icon" to "#5C6B6B", "activeIcon" to "#1F5C52", "label" to "#5C6B6B", "activeLabel" to "#194A42",
                    "activePill" to "#9FD8C8", "activePillOpacity" to 0.35),
                "pixel"))
            .put("card", card(
                bp("backBg" to "#0D1218", "backBorder" to "#3E5A5A", "numberColor" to "#8FE3D0", "hintColor" to "#6E8A88",
                    "actionBg" to "#8FE3D0", "actionText" to "#0B1418", "contentBg" to "#101820", "contentBorder" to "#2C4444",
                    "titleColor" to "#EAF6F2", "bodyColor" to "#A9C2BE", "chipBg" to "#142428", "chipBorder" to "#2F4A46",
                    "accent" to "#8FE3D0", "texture" to "grid", "pattern" to "diamond"),
                bp("backBg" to "#EFEBDE", "backBorder" to "#A9B5AC", "numberColor" to "#2C3A36", "hintColor" to "#6B7A74",
                    "actionBg" to "#2C4A42", "actionText" to "#F2F7F3", "contentBg" to "#FBF9F1", "contentBorder" to "#DDD8C8",
                    "titleColor" to "#1E2A26", "bodyColor" to "#54615B", "chipBg" to "#F1EDE0", "chipBorder" to "#D8D2C0",
                    "accent" to "#2F6F5F", "texture" to "grid", "pattern" to "diamond"))),

        // G 手绘便签 — 便签纸与手写线条
        "paper-notes" to JSONObject()
            .put("bottomBar", bar(
                bp("bg" to "#1A1512", "bgOpacity" to 0.92, "border" to "#E0C9A6", "borderOpacity" to 0.18,
                    "icon" to "#A89484", "activeIcon" to "#F0D9B5", "label" to "#A89484", "activeLabel" to "#FBEED8",
                    "activePill" to "#C9A961", "activePillOpacity" to 0.2),
                bp("bg" to "#FBF4E6", "bgOpacity" to 0.97, "border" to "#4A3B2A", "borderOpacity" to 0.1,
                    "icon" to "#7A6A56", "activeIcon" to "#6B4B1F", "label" to "#7A6A56", "activeLabel" to "#5C3F16",
                    "activePill" to "#C08A3E", "activePillOpacity" to 0.18),
                "paper"))
            .put("card", card(
                bp("backBg" to "#211A14", "backBorder" to "#5C4A38", "numberColor" to "#EBD6B4", "hintColor" to "#A08D76",
                    "actionBg" to "#E7CFA6", "actionText" to "#241B12", "contentBg" to "#221B15", "contentBorder" to "#403327",
                    "titleColor" to "#F7EFE1", "bodyColor" to "#C9BBA7", "chipBg" to "#2A2119", "chipBorder" to "#453728",
                    "accent" to "#D9B679", "texture" to "linen", "pattern" to "none"),
                bp("backBg" to "#F7EEDC", "backBorder" to "#D8C6A6", "numberColor" to "#5B4732", "hintColor" to "#8B7862",
                    "actionBg" to "#3B2D20", "actionText" to "#FBF4E7", "contentBg" to "#FDF8ED", "contentBorder" to "#E8DAC2",
                    "titleColor" to "#2A2118", "bodyColor" to "#655744", "chipBg" to "#F6EEDF", "chipBorder" to "#E4D5BB",
                    "accent" to "#9A6B2F", "texture" to "linen", "pattern" to "none"))),
    )
}
