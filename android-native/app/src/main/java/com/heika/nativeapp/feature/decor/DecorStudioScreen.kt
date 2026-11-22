package com.heika.nativeapp.feature.decor

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.heika.nativeapp.data.DecorConfig
import com.heika.nativeapp.data.toJson

private val TEXTURES = listOf(
    "none" to "无", "linen" to "细斜线", "dots" to "稀疏点阵", "grid" to "精细方格",
    "paper" to "纸张颗粒", "noise" to "磨砂噪点", "rings" to "同心圆", "diamonds" to "几何菱形",
)
private val PATTERNS = listOf(
    "none" to "无", "monogram" to "字母 H", "diamond" to "菱形", "frame" to "内框",
)

/**
 * 工作室（需求 6.1 / 7.4）：底栏与卡片装扮编辑。
 * 基础设置常驻，高级选项默认折叠；预览实时跟随工作区配置；
 * 状态行明确区分「预览中」「已保存到账户」「当前客户端已应用」（6.3）。
 */
@Composable
fun DecorStudioContent(viewModel: DecorCenterViewModel, initialKind: String = "bottom") {
    val working by viewModel.working.collectAsState()
    val applied by viewModel.applied.collectAsState()
    val dirty by viewModel.dirty.collectAsState()
    val savePhase by viewModel.savePhase.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val context = LocalContext.current

    var studioKind by remember { mutableStateOf(initialKind) }
    var previewDark by remember { mutableStateOf(true) }
    var advancedOpen by remember { mutableStateOf(false) }

    // 上传目标：icon-slot / backImage / contentImage / publishIcon
    var uploadTarget by remember { mutableStateOf<String?>(null) }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        val target = uploadTarget
        uploadTarget = null
        if (uri == null || target == null) return@rememberLauncherForActivityResult
        val result = runCatching { prepareDecorImage(context, uri, target) }
        result.onSuccess { (name, mime, bytes) ->
            val kind = when {
                target.startsWith("icon:") -> "icon"
                target == "publishIcon" -> "publish-icon"
                target == "backImage" -> "card-back"
                else -> "content-image"
            }
            viewModel.uploadAsset(bytes, name, mime, kind) { url ->
                when {
                    target.startsWith("icon:") -> {
                        val (slot, state) = target.removePrefix("icon:").split(":")
                        viewModel.updateBarSkin { skin ->
                            val existing = skin.icons[slot] ?: com.heika.nativeapp.data.DecorIcon(null, null, true, 1f, false)
                            val updated = if (state == "active") existing.copy(active = url) else existing.copy(normal = url)
                            skin.copy(icons = skin.icons + (slot to updated))
                        }
                    }
                    target == "publishIcon" -> viewModel.updateBarSkin { it.copy(publishIconUrl = url) }
                    target == "backImage" -> viewModel.updateCardPalette(previewDark) { it.copy(backImage = url) }
                    target == "contentImage" -> viewModel.updateCardPalette(previewDark) { it.copy(contentImage = url) }
                }
            }
        }.onFailure { error ->
            // 失败保留编辑内容，可直接重试（需求五原则同样适用）
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        // 预览切换：深浅色 + 底栏/卡片
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            DecorModeToggle(dark = previewDark, onChange = { previewDark = it })
            Spacer(Modifier.width(10.dp))
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                KindChip("底栏", studioKind == "bottom") { studioKind = "bottom" }
                Spacer(Modifier.width(6.dp))
                KindChip("卡片", studioKind == "card") { studioKind = "card" }
            }
        }

        Spacer(Modifier.height(12.dp))

        // 实时预览
        if (studioKind == "bottom") {
            DecorBarPreview(working, previewDark, Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)))
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                DecorCardBackPreview(working, previewDark, Modifier.weight(1f))
                DecorCardContentPreview(working, previewDark, Modifier.weight(1f))
            }
        }

        // 状态区分（6.3）：预览中 / 已保存 / 失败
        Spacer(Modifier.height(10.dp))
        val statusText = when {
            savePhase == DecorSavePhase.Error -> "保存失败 · 预览内容已保留，可重试"
            savePhase == DecorSavePhase.Success -> "已保存到账户 · 当前客户端已应用"
            savePhase == DecorSavePhase.Loading -> "正在保存到账户…"
            dirty -> "预览中（未保存）· 点击「应用装扮」后才会同步到账号"
            else -> "已保存到账户 · 当前客户端已应用（与网页同一账号配置）"
        }
        val statusColor = when {
            savePhase == DecorSavePhase.Error -> Color(0xFFE08A72)
            savePhase == DecorSavePhase.Success -> Color(0xFF7FC79A)
            dirty -> Color(0xFFE9D9AE)
            else -> Color(0xFF8E9099)
        }
        Text(statusText, color = statusColor, fontSize = 11.sp, fontWeight = FontWeight.Medium)

        if (working.syncVersion.isNotBlank() && applied.syncVersion == working.syncVersion) {
            DecorSectionHint("当前账号配置版本 ${applied.syncVersion}，网页与本机一致", Modifier.padding(top = 2.dp))
        }

        Spacer(Modifier.height(8.dp))

        if (studioKind == "bottom") {
            BarEditor(
                working = working,
                darkSide = previewDark,
                viewModel = viewModel,
                advancedOpen = advancedOpen,
                onAdvancedToggle = { advancedOpen = it },
                onPickImage = { target -> uploadTarget = target; imagePicker.launch("image/*") },
            )
        } else {
            CardEditor(
                working = working,
                darkSide = previewDark,
                viewModel = viewModel,
                advancedOpen = advancedOpen,
                onAdvancedToggle = { advancedOpen = it },
                onPickImage = { target -> uploadTarget = target; imagePicker.launch("image/*") },
            )
        }

        Spacer(Modifier.height(18.dp))

        // 应用按钮（六态，与网页一致）：防重复提交、成功依真实结果
        val saveLabel = when (savePhase) {
            DecorSavePhase.Loading -> "正在保存…"
            DecorSavePhase.Success -> "已应用 ✓"
            DecorSavePhase.Error -> "保存失败，点击重试"
            DecorSavePhase.Idle -> if (dirty) "应用装扮（保存并同步）" else "应用装扮"
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(46.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(
                    when (savePhase) {
                        DecorSavePhase.Success -> Color(0xFF2F7D4F)
                        DecorSavePhase.Error -> Color(0xFFA4432F)
                        else -> Color(0xFFC9A961)
                    },
                )
                .clickable(enabled = !busy && savePhase != DecorSavePhase.Loading) { viewModel.saveWorking() },
            contentAlignment = Alignment.Center,
        ) {
            if (savePhase == DecorSavePhase.Loading && busy) {
                CircularProgressIndicator(Modifier.width(18.dp).height(18.dp), color = Color(0xFF17130A), strokeWidth = 2.dp)
            } else {
                Text(saveLabel, color = if (savePhase == DecorSavePhase.Idle || savePhase == DecorSavePhase.Loading) Color(0xFF17130A) else Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        Spacer(Modifier.height(10.dp))
    }
}

@Composable
private fun KindChip(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (active) Color(0xFFC9A961) else Color(0x14FFFFFF))
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 6.dp),
    ) {
        Text(label, color = if (active) Color(0xFF17130A) else Color(0xFFB9BCC4), fontSize = 11.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
    }
}

@Composable
private fun AdvancedToggle(open: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0x0FFFFFFF))
            .clickable(onClick = onToggle)
            .padding(horizontal = 12.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("高级选项", color = Color(0xFFF2E7C8), fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Text(if (open) "收起" else "展开", color = Color(0xFFC9A961), fontSize = 11.sp)
    }
}

/* ================= 底栏编辑 ================= */

@Composable
private fun BarEditor(
    working: DecorConfig,
    darkSide: Boolean,
    viewModel: DecorCenterViewModel,
    advancedOpen: Boolean,
    onAdvancedToggle: () -> Unit,
    onPickImage: (String) -> Unit,
) {
    val skin = working.bar
    val palette = if (darkSide) skin.dark else skin.light
    val defaults = if (darkSide) DecorConfig.DARK_BAR else DecorConfig.LIGHT_BAR
    val update: ((com.heika.nativeapp.data.BarPalette) -> com.heika.nativeapp.data.BarPalette) -> Unit =
        { transform -> viewModel.updateBarPalette(darkSide, transform) }

    DecorGroupTitle("基础设置", "点选即套用到预览，确认后点击「应用装扮」")
    ColorEditRow("背景色", palette.bg, { update { p -> p.copy(bg = it) } }, onReset = { update { p -> p.copy(bg = defaults.bg) } })
    OpacityEditRow("背景透明度", palette.bgOpacity, { update { p -> p.copy(bgOpacity = it) } }, onReset = { update { p -> p.copy(bgOpacity = defaults.bgOpacity) } })
    ColorEditRow("图标色", palette.icon, { update { p -> p.copy(icon = it) } }, onReset = { update { p -> p.copy(icon = defaults.icon) } })
    ColorEditRow("选中图标色", palette.activeIcon, { update { p -> p.copy(activeIcon = it) } }, onReset = { update { p -> p.copy(activeIcon = defaults.activeIcon) } })
    ColorEditRow("选中底色", palette.activePill, { update { p -> p.copy(activePill = it) } }, onReset = { update { p -> p.copy(activePill = defaults.activePill) } })

    AdvancedToggle(advancedOpen, onAdvancedToggle)
    if (advancedOpen) {
        ColorEditRow("边框色", palette.border, { update { p -> p.copy(border = it) } }, onReset = { update { p -> p.copy(border = defaults.border) } })
        OpacityEditRow("边框透明度", palette.borderOpacity, { update { p -> p.copy(borderOpacity = it) } }, onReset = { update { p -> p.copy(borderOpacity = defaults.borderOpacity) } })
        ColorEditRow("标签色", palette.label, { update { p -> p.copy(label = it) } }, onReset = { update { p -> p.copy(label = defaults.label) } })
        ColorEditRow("选中标签色", palette.activeLabel, { update { p -> p.copy(activeLabel = it) } }, onReset = { update { p -> p.copy(activeLabel = defaults.activeLabel) } })
        OpacityEditRow("选中底色透明度", palette.activePillOpacity, { update { p -> p.copy(activePillOpacity = it) } }, onReset = { update { p -> p.copy(activePillOpacity = defaults.activePillOpacity) } })

        DecorGroupTitle("发布按钮")
        ColorEditRow("按钮背景", skin.publishBg, { viewModel.updateBarSkin { s -> s.copy(publishBg = it) } })
        ColorEditRow("按钮图标", skin.publishIcon, { viewModel.updateBarSkin { s -> s.copy(publishIcon = it) } })
        ImageEditRow("按钮图标图片", skin.publishIconUrl, onPick = { onPickImage("publishIcon") }, onRemove = { viewModel.updateBarSkin { s -> s.copy(publishIconUrl = null) } })

        DecorGroupTitle("自定义图标", "每个位置可分别替换普通态与选中态")
        listOf("home" to "首页", "discover" to "发现", "messages" to "消息", "mine" to "我的").forEach { (slot, slotLabel) ->
            val icon = skin.icons[slot]
            Text("$slotLabel · 普通态", color = Color(0xFFE8E6E0), fontSize = 11.5.sp, modifier = Modifier.padding(top = 8.dp))
            ImageEditRow(
                label = "$slotLabel 图标",
                url = icon?.normal,
                onPick = { onPickImage("icon:$slot:normal") },
                onRemove = icon?.normal?.let {
                    { viewModel.updateBarSkin { s -> s.copy(icons = s.icons + (slot to (s.icons[slot]!!.copy(normal = null)))) } }
                },
            )
            ImageEditRow(
                label = "$slotLabel 选中态",
                url = icon?.active,
                onPick = { onPickImage("icon:$slot:active") },
                onRemove = icon?.active?.let {
                    { viewModel.updateBarSkin { s -> s.copy(icons = s.icons + (slot to (s.icons[slot]!!.copy(active = null)))) } }
                },
                hint = "只上传一张时，选中态用颜色与轻微缩放区分",
            )
        }

        DecorGroupTitle("深浅分色")
        SelectEditRow(
            "配色模式",
            listOf("follow" to "统一一套", "split" to "深浅分色"),
            if (skin.split) "split" else "follow",
        ) { value ->
            viewModel.updateBarSkin { s ->
                if (value == "split") {
                    // 开启分色时把当前深色套复制到浅色，避免浅色闪回默认
                    if (!s.split) s.copy(split = true, light = s.dark) else s.copy(split = true)
                } else {
                    s.copy(split = false)
                }
            }
        }
        if (skin.split) {
            DecorSectionHint("当前正在编辑${if (darkSide) "深色" else "浅色"}套；切换上方预览可编辑另一套。", Modifier.padding(bottom = 6.dp))
        }

        TextButton(onClick = {
            viewModel.updateBarSkin { skin.copy(dark = DecorConfig.DARK_BAR, light = DecorConfig.LIGHT_BAR, icons = emptyMap(), publishBg = DecorConfig.DEFAULT.bar.publishBg, publishIcon = DecorConfig.DEFAULT.bar.publishIcon, publishIconUrl = null, publishTinted = false, showLabel = true) }
        }) {
            Text("恢复底栏全部默认（预览中，点击应用后保存）", color = Color(0xFFE08A72), fontSize = 11.sp)
        }
    }
}

/* ================= 卡片编辑 ================= */

@Composable
private fun CardEditor(
    working: DecorConfig,
    darkSide: Boolean,
    viewModel: DecorCenterViewModel,
    advancedOpen: Boolean,
    onAdvancedToggle: () -> Unit,
    onPickImage: (String) -> Unit,
) {
    val skin = working.card
    val palette = if (darkSide) skin.dark else skin.light
    val defaults = if (darkSide) DecorConfig.DARK_CARD else DecorConfig.LIGHT_CARD
    val update: ((com.heika.nativeapp.data.CardPalette) -> com.heika.nativeapp.data.CardPalette) -> Unit =
        { transform -> viewModel.updateCardPalette(darkSide, transform) }

    DecorGroupTitle("基础设置", "自定义底图属于装扮，不会替换作者作品封面")
    ColorEditRow("卡背背景色", palette.backBg, { update { p -> p.copy(backBg = it) } }, onReset = { update { p -> p.copy(backBg = defaults.backBg) } })
    SelectEditRow("卡背图案", PATTERNS, palette.pattern) { value -> update { p -> p.copy(pattern = value) } }
    ColorEditRow("内容背景色", palette.contentBg, { update { p -> p.copy(contentBg = it) } }, onReset = { update { p -> p.copy(contentBg = defaults.contentBg) } })
    ColorEditRow("标题色", palette.titleColor, { update { p -> p.copy(titleColor = it) } }, onReset = { update { p -> p.copy(titleColor = defaults.titleColor) } })
    ColorEditRow("正文色", palette.bodyColor, { update { p -> p.copy(bodyColor = it) } }, onReset = { update { p -> p.copy(bodyColor = defaults.bodyColor) } })
    ColorEditRow("强调色", palette.accent, { update { p -> p.copy(accent = it) } }, onReset = { update { p -> p.copy(accent = defaults.accent) } })

    AdvancedToggle(advancedOpen, onAdvancedToggle)
    if (advancedOpen) {
        DecorGroupTitle("卡背", "图片 + 背景色 + 纹理可叠加")
        ImageEditRow("卡背背景图", palette.backImage, onPick = { onPickImage("backImage") }, onRemove = { update { p -> p.copy(backImage = null) } }, hint = "上传自动压缩；复杂图案建议搭配描边与遮罩")
        SelectEditRow("卡背纹理", TEXTURES, palette.texture) { value -> update { p -> p.copy(texture = value) } }
        ColorEditRow("卡背描边", palette.backBorder, { update { p -> p.copy(backBorder = it) } }, onReset = { update { p -> p.copy(backBorder = defaults.backBorder) } })
        ColorEditRow("编号色", palette.numberColor, { update { p -> p.copy(numberColor = it) } }, onReset = { update { p -> p.copy(numberColor = defaults.numberColor) } })
        ColorEditRow("提示色", palette.hintColor, { update { p -> p.copy(hintColor = it) } }, onReset = { update { p -> p.copy(hintColor = defaults.hintColor) } })
        ColorEditRow("按钮背景", palette.actionBg, { update { p -> p.copy(actionBg = it) } }, onReset = { update { p -> p.copy(actionBg = defaults.actionBg) } })
        ColorEditRow("按钮文字", palette.actionText, { update { p -> p.copy(actionText = it) } }, onReset = { update { p -> p.copy(actionText = defaults.actionText) } })
        TextButton(onClick = { viewModel.restoreCardPart(DecorCenterViewModel.CardPart.Back, darkSide) }) {
            Text("恢复卡背默认", color = Color(0xFFE08A72), fontSize = 11.sp)
        }

        DecorGroupTitle("内容面", "底图放装扮层，标题摘要按钮保持可读")
        ImageEditRow("内容面背景图", palette.contentImage, onPick = { onPickImage("contentImage") }, onRemove = { update { p -> p.copy(contentImage = null) } })
        SelectEditRow("内容面纹理", TEXTURES, palette.contentTexture) { value -> update { p -> p.copy(contentTexture = value) } }
        OpacityEditRow("内容区域遮罩", palette.contentScrim, { update { p -> p.copy(contentScrim = it.coerceIn(0f, 0.6f)) } }, onReset = { update { p -> p.copy(contentScrim = defaults.contentScrim) } })
        DecorSectionHint("遮罩（0–60%）只压暗装饰底图，不遮盖作者封面与文字")
        ColorEditRow("内容描边", palette.contentBorder, { update { p -> p.copy(contentBorder = it) } }, onReset = { update { p -> p.copy(contentBorder = defaults.contentBorder) } })
        ColorEditRow("分类标签背景", palette.chipBg, { update { p -> p.copy(chipBg = it) } }, onReset = { update { p -> p.copy(chipBg = defaults.chipBg) } })
        ColorEditRow("分类标签描边", palette.chipBorder, { update { p -> p.copy(chipBorder = it) } }, onReset = { update { p -> p.copy(chipBorder = defaults.chipBorder) } })
        TextButton(onClick = { viewModel.restoreCardPart(DecorCenterViewModel.CardPart.Content, darkSide) }) {
            Text("恢复内容面默认", color = Color(0xFFE08A72), fontSize = 11.sp)
        }

        DecorGroupTitle("深浅分色")
        SelectEditRow(
            "配色模式",
            listOf("follow" to "统一一套", "split" to "深浅分色"),
            if (skin.split) "split" else "follow",
        ) { value ->
            viewModel.updateCardSkin { s ->
                if (value == "split") {
                    if (!s.split) s.copy(split = true, light = s.dark) else s.copy(split = true)
                } else {
                    s.copy(split = false)
                }
            }
        }

        TextButton(onClick = { viewModel.restoreCardPart(DecorCenterViewModel.CardPart.All, darkSide) }) {
            Text("恢复卡片全部默认（预览中，点击应用后保存）", color = Color(0xFFE08A72), fontSize = 11.sp)
        }
    }
}

/** 无自定义图标时使用内置占位（与列表/详情预览一致）。 */
internal fun decorIconPlaceholder(slot: String): String = when (slot) {
    "home" -> "首页"
    "discover" -> "发现"
    "messages" -> "消息"
    "mine" -> "我的"
    else -> slot
}

/**
 * 读取并压缩待上传图片（需求 7.4「上传资源自动压缩，保留必要透明度和方向」）：
 * - 图标：保留透明度，输出 PNG，最长边 256；
 * - 底图：最长边 1280，JPEG 85（含透明通道时输出 PNG）。
 */
private fun prepareDecorImage(context: android.content.Context, uri: Uri, target: String): Triple<String, String, ByteArray> {
    val resolver = context.contentResolver
    val mime = resolver.getType(uri) ?: "image/jpeg"
    require(mime in setOf("image/jpeg", "image/png", "image/webp")) { "仅支持 JPG、PNG、WebP 图片" }
    val isIcon = target.startsWith("icon:") || target == "publishIcon"

    // EXIF 方向修正：解码后按旋转角转正，避免上传后倒置。
    val rotation = runCatching {
        val exif = androidx.exifinterface.media.ExifInterface(resolver.openInputStream(uri)!!)
        when (exif.getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL)) {
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
    }.getOrDefault(0f)

    val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, bounds) }
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "图片无法解码，请换一张试试" }
    val maxSide = if (isIcon) 256 else 1280
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxSide * 2) sample *= 2
    val decoded = resolver.openInputStream(uri)?.use {
        android.graphics.BitmapFactory.decodeStream(it, null, android.graphics.BitmapFactory.Options().apply { inSampleSize = sample })
    } ?: error("图片无法解码")

    val scaled = runCatching {
        val w = decoded.width.toFloat()
        val h = decoded.height.toFloat()
        val scale = minOf(maxSide / maxOf(w, h), 1f)
        val matrix = android.graphics.Matrix().apply {
            postScale(scale, scale)
            if (rotation != 0f) postRotate(rotation)
        }
        android.graphics.Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    }.getOrElse { decoded }
    if (scaled !== decoded) decoded.recycle()

    val output = java.io.ByteArrayOutputStream()
    val hasAlpha = scaled.hasAlpha()
    return try {
        if (isIcon || hasAlpha) {
            scaled.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output)
            Triple("decor-icon.png", "image/png", output.toByteArray())
        } else {
            var bytes = ByteArray(0)
            for (quality in listOf(85, 78, 70)) {
                output.reset()
                scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, quality, output)
                bytes = output.toByteArray()
                if (bytes.size <= 3_500_000) break
            }
            require(bytes.size <= 4 * 1024 * 1024) { "图片压缩后仍超过 4 MB，请选择较小的图片" }
            Triple("decor-backdrop.jpg", "image/jpeg", bytes)
        }
    } finally {
        scaled.recycle()
    }
}
