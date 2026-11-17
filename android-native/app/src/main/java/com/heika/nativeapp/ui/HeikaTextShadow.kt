package com.heika.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

/**
 * 图片上叠文字用的阴影。
 *
 * 卡片原先靠一层底部黑色渐变保证可读性，代价是整段画面被压暗，
 * 图片本身的信息被吃掉。改成只给文字加暗影：需要辨认的只有字，
 * 不该为它牺牲整张图。
 */
@Composable
fun heikaPhotoTextShadow(alpha: Float = 0.68f, blur: Float = 7f, offsetY: Float = 1.5f): Shadow {
    val density = LocalDensity.current
    return remember(density, alpha, blur, offsetY) {
        Shadow(
            color = Color.Black.copy(alpha = alpha),
            offset = with(density) { Offset(0f, offsetY.dp.toPx()) },
            blurRadius = with(density) { blur.dp.toPx() },
        )
    }
}
