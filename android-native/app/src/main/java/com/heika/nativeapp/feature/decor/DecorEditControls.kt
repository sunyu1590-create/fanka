package com.heika.nativeapp.feature.decor

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/* ------------------------------------------------------------------
 * 工作室编辑控件（需求 7.4：基础设置可见，高级选项折叠）。
 * ------------------------------------------------------------------ */

private val SWATCHES = listOf(
    "#0B0D0F", "#101215", "#14161A", "#1B1D22", "#2C3238",
    "#EDE9E1", "#FCFCFD", "#F2F0EA", "#C9D5DA", "#B9BCC4",
    "#C9A961", "#93762F", "#E9D9AE", "#F2E7C8", "#8E9099",
    "#FFFFFF", "#000000", "#2F7D4F", "#A4432F", "#3E6B8A",
)

fun colorToHex(color: Color): String {
    val argb = color.toArgb()
    return String.format("#%06X", argb and 0xFFFFFF)
}

private fun hexToColor(value: String): Color? {
    val trimmed = value.trim().removePrefix("#")
    if (trimmed.length != 6 || !trimmed.all { it in "0123456789abcdefABCDEF" }) return null
    return runCatching { Color(android.graphics.Color.parseColor("#$trimmed")) }.getOrNull()
}

/** 颜色行：色板快选 + 十六进制输入。 */
@Composable
fun ColorEditRow(label: String, value: Color, onChange: (Color) -> Unit, onReset: (() -> Unit)? = null) {
    var hex by remember(value) { mutableStateOf(colorToHex(value)) }
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, Modifier.weight(1f), color = Color(0xFFE8E6E0), fontSize = 12.sp, fontWeight = FontWeight.Medium)
            Box(Modifier.size(22.dp).clip(CircleShape).background(value).border(1.dp, Color(0x33FFFFFF), CircleShape))
            Spacer(Modifier.width(8.dp))
            if (onReset != null) {
                TextButton(onClick = onReset, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 6.dp)) {
                    Text("重置", color = Color(0xFFC9A961), fontSize = 10.5.sp)
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            OutlinedTextField(
                value = hex,
                onValueChange = { input ->
                    hex = input
                    hexToColor(input)?.let(onChange)
                },
                modifier = Modifier.width(108.dp).height(48.dp),
                singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 11.sp, color = Color(0xFFE8E6E0)),
            )
            Row(
                Modifier
                    .weight(1f)
                    .height(48.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .padding(2.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                SWATCHES.take(10).forEach { swatch ->
                    val swatchColor = hexToColor(swatch) ?: Color.Gray
                    Box(
                        Modifier
                            .size(20.dp)
                            .clip(CircleShape)
                            .background(swatchColor)
                            .border(1.dp, Color(0x33FFFFFF), CircleShape)
                            .clickable {
                                hex = swatch
                                onChange(swatchColor)
                            },
                    )
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            SWATCHES.drop(10).forEach { swatch ->
                val swatchColor = hexToColor(swatch) ?: Color.Gray
                Box(
                    Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(swatchColor)
                        .border(1.dp, Color(0x33FFFFFF), CircleShape)
                        .clickable {
                            hex = swatch
                            onChange(swatchColor)
                        },
                )
            }
        }
    }
}

/** 透明度滑杆（0–1，只影响背景层）。 */
@Composable
fun OpacityEditRow(label: String, value: Float, onChange: (Float) -> Unit, onReset: (() -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, Modifier.weight(1f), color = Color(0xFFE8E6E0), fontSize = 12.sp, fontWeight = FontWeight.Medium)
            Text("${(value * 100).toInt()}%", color = Color(0xFFC9A961), fontSize = 11.sp)
            if (onReset != null) {
                TextButton(onClick = onReset, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 6.dp)) {
                    Text("重置", color = Color(0xFFC9A961), fontSize = 10.5.sp)
                }
            }
        }
        Slider(value = value, onValueChange = onChange, valueRange = 0f..1f)
    }
}

/** 枚举选项行（纹理 / 图案等）。 */
@Composable
fun SelectEditRow(label: String, options: List<Pair<String, String>>, value: String, onChange: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(label, color = Color(0xFFE8E6E0), fontSize = 12.sp, fontWeight = FontWeight.Medium)
        Row(
            Modifier.fillMaxWidth().padding(top = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            options.forEach { (key, text) ->
                val active = key == value
                Box(
                    Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (active) Color(0xFFC9A961) else Color(0x14FFFFFF))
                        .clickable { onChange(key) }
                        .padding(horizontal = 11.dp, vertical = 6.dp),
                ) {
                    Text(text, color = if (active) Color(0xFF17130A) else Color(0xFFB9BCC4), fontSize = 10.5.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
                }
            }
        }
    }
}

/** 图片资源行：显示当前图与更换 / 移除。 */
@Composable
fun ImageEditRow(label: String, url: String?, onPick: () -> Unit, onRemove: (() -> Unit)? = null, hint: String = "") {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(label, color = Color(0xFFE8E6E0), fontSize = 12.sp, fontWeight = FontWeight.Medium)
        if (hint.isNotBlank()) DecorSectionHint(hint, Modifier.padding(top = 2.dp))
        Row(
            Modifier.fillMaxWidth().padding(top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0x14FFFFFF))
                    .border(1.dp, Color(0x22FFFFFF), RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                if (url != null) {
                    coil3.compose.AsyncImage(
                        model = url,
                        contentDescription = label,
                        modifier = Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)),
                    )
                } else {
                    Text("无", color = Color(0xFF8E9099), fontSize = 10.sp)
                }
            }
            TextButton(onClick = onPick) { Text(if (url == null) "上传图片" else "更换", color = Color(0xFFC9A961), fontSize = 11.5.sp) }
            if (url != null && onRemove != null) {
                TextButton(onClick = onRemove) { Text("移除", color = Color(0xFFE08A72), fontSize = 11.5.sp) }
            }
        }
    }
}

/** 分区标题。 */
@Composable
fun DecorGroupTitle(text: String, extra: String = "") {
    Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, color = Color(0xFFF2E7C8), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        if (extra.isNotBlank()) {
            Spacer(Modifier.width(8.dp))
            DecorSectionHint(extra)
        }
    }
}
