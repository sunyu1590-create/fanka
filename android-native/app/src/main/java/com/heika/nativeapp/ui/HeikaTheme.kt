package com.heika.nativeapp.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontWeight
import com.heika.nativeapp.R

object HeikaRadii {
    /** 2026-11-21：与网页端统一——内容卡 16dp、设置分组 18dp、分类与按钮 11dp。 */
    val feedCard = 16.dp
    val dailyCard = 16.dp
    val categoryTag = 8.dp
    val ratingTag = 9.dp
    val control = 11.dp
    val surface = 16.dp
    val group = 18.dp
    val chip = 11.dp
    val collectionCard = 16.dp
    val dialog = 18.dp
}

/** Shared material and motion values for transient HEIKA solid-glass surfaces. */
object HeikaGlassTokens {
    val dialogRadius = 16.dp
    val menuRadius = 14.dp
    val capsuleRadius = 26.dp
    val borderWidth = .5.dp
    val dialogBlurRadius = 24.dp
    val menuBlurRadius = 22.dp
    /**
     * 2026-11-20 视觉修正：固态玻璃不是高不透明深黑面板。
     * 降低材质自身不透明度，让底层颜色真正透出；亮度由白色 tint 提上来。
     */
    const val darkDialogTintAlpha = .58f
    const val lightDialogTintAlpha = .62f
    const val backdropDimAmount = .16f
    const val glassBorderAlphaDark = .13f
    const val glassBorderAlphaLight = .12f
}

private val HeikaShapes = Shapes(
    small = RoundedCornerShape(HeikaRadii.control),
    medium = RoundedCornerShape(HeikaRadii.surface),
    large = RoundedCornerShape(HeikaRadii.dialog),
)

object HeikaSpacing {
    val pageHorizontal = 18.dp
    val compactHorizontal = 16.dp
    val sectionGap = 20.dp
    val rowGap = 12.dp
    val headerHeight = 58.dp
}

object HeikaType {
    /** 顶栏品牌字级，与网页端 19px / 9px 对应。 */
    val brand = 19.sp
    val brandLatin = 9.sp
    /** 二级页标题：比品牌小一档，保证顶栏只有一个视觉重心。 */
    val headerTitle = 16.sp
    val pageTitle = 22.sp
    val sectionTitle = 18.sp
    val body = 14.sp
    val secondary = 12.sp
    val caption = 10.sp
}

object HeikaPalette {
    val Gold = Color(0xFFD0B571)
    val LightAccent = Color(0xFFA98C51)
    val DailyCardStart = Color(0xFF28343A)
    val DailyCardMiddle = Color(0xFF141B20)
    val DailyCardEnd = Color(0xFF202A2F)
    val DailyCardRim = Color(0xFF9BA9AD)
    val DailyCardMuted = Color(0xFFC1CBCD)
    val DarkBackground = Color(0xFF101114)
    val DarkSurface = Color(0xFF1C1D21)
    val DarkRaised = Color(0xFF25262B)
    val DarkLine = Color(0xFF303137)
    val LightBackground = Color(0xFFF8F7F4)
    val LightSurface = Color(0xFFFFFFFF)
    val LightRaised = Color(0xFFF0EEEA)
    val LightInk = Color(0xFF222326)
    val LightMuted = Color(0xFF77787D)
    val LightLine = Color(0xFFE5E2DC)
    val Ink = Color(0xFFF1F0ED)
    val Muted = Color(0xFFAAA9AD)
    val Line = DarkLine
}

object HeikaMotion {
    const val quick = 150
    const val control = 220
    const val transition = 280
    const val spatial = 380
    /** 卡片 -> 详情的共享元素迁移时长。比页面淡入长，飞行过程才是主体。 */
    const val morph = 420
    const val rating = 320
    val standard = FastOutSlowInEasing
    val spatialEasing = CubicBezierEasing(0.22f, 0.78f, 0.18f, 1f)

    /**
     * 非线性曲线：与网页端 --ease-open / --ease-close / --ease-expand 取同一组参数，
     * 让两端的手感一致。只用于新增动效与非共享元素的组件过渡；
     * 卡片连续开关的 morph 仍走原有 spatialEasing，不在这里改。
     *
     * 开启：起步跟手，尾段减速落位；
     * 关闭：立即响应，回收时略微加速，末尾不拖泥带水；
     * 展开：中段最舒展，适合高度/透明度协同的折叠组件。
     */
    val openEasing = CubicBezierEasing(0.20f, 0.75f, 0.25f, 1f)
    val closeEasing = CubicBezierEasing(0.32f, 0.72f, 0.20f, 1f)
    val expandEasing = CubicBezierEasing(0.25f, 0.80f, 0.25f, 1f)
}

val LocalHeikaDark = staticCompositionLocalOf { true }

/** Fonts are bundled locally; selectable families are restricted to packaged resources. */
object HeikaFontCatalog {
    val availableChoices = setOf("system", "oppo_sans")
    private val families = mapOf(
        "system" to FontFamily.Default,
        "oppo_sans" to FontFamily(Font(R.font.oppo_sans_4_0, FontWeight.Normal)),
    )
    fun normalize(choice: String): String = choice.takeIf { it in availableChoices } ?: "oppo_sans"
    fun resolve(choice: String): FontFamily = families[normalize(choice)] ?: FontFamily.Default
}

object HeikaPageTransitions {
    val choices = setOf("lift", "crossfade", "shared")

    /** 默认走连续转场：卡片点开就是同一张图长成详情页，不是换一页。 */
    fun normalize(value: String): String = value.takeIf { it in choices } ?: "shared"
}

object HeikaReadingSizes {
    private val choices = setOf("standard", "slightly-large", "large")
    fun normalize(value: String): String = value.takeIf { it in choices } ?: "standard"
    fun titleScale(value: String): Float = when (normalize(value)) {
        "slightly-large" -> 1.12f
        "large" -> 1.24f
        else -> 1f
    }
    fun bodyScale(value: String): Float = when (normalize(value)) {
        "slightly-large" -> 1.14f
        "large" -> 1.29f
        else -> 1f
    }
}

val LocalHeikaBodyTextScale = staticCompositionLocalOf { 1f }
val LocalHeikaTitleTextScale = staticCompositionLocalOf { 1f }

@Composable
fun HeikaTheme(
    theme: String,
    fontChoice: String = "oppo_sans",
    bodyTextSize: String = "standard",
    titleTextSize: String = "standard",
    content: @Composable () -> Unit,
) {
    val dark = when (theme) {
        "light" -> false
        "system" -> isSystemInDarkTheme()
        else -> true
    }
    val targetScheme = if (dark) darkColorScheme(
        primary = HeikaPalette.Gold,
        onPrimary = Color(0xFF18150D),
        background = HeikaPalette.DarkBackground,
        onBackground = HeikaPalette.Ink,
        surface = HeikaPalette.DarkSurface,
        onSurface = HeikaPalette.Ink,
        surfaceVariant = HeikaPalette.DarkRaised,
        onSurfaceVariant = HeikaPalette.Muted,
        outline = HeikaPalette.Line,
        secondary = Color(0xFFB6B9C1),
    ) else lightColorScheme(
        primary = HeikaPalette.LightAccent,
        onPrimary = Color.White,
        background = HeikaPalette.LightBackground,
        onBackground = HeikaPalette.LightInk,
        surface = HeikaPalette.LightSurface,
        onSurface = HeikaPalette.LightInk,
        surfaceVariant = HeikaPalette.LightRaised,
        onSurfaceVariant = HeikaPalette.LightMuted,
        outline = HeikaPalette.LightLine,
        secondary = Color(0xFF66675F),
    )
    val scheme = targetScheme.copy(
        primary = animateColorAsState(targetScheme.primary, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-primary").value,
        background = animateColorAsState(targetScheme.background, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-background").value,
        onBackground = animateColorAsState(targetScheme.onBackground, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-ink").value,
        surface = animateColorAsState(targetScheme.surface, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-surface").value,
        onSurface = animateColorAsState(targetScheme.onSurface, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-on-surface").value,
        surfaceVariant = animateColorAsState(targetScheme.surfaceVariant, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-raised").value,
        onSurfaceVariant = animateColorAsState(targetScheme.onSurfaceVariant, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-muted").value,
        outline = animateColorAsState(targetScheme.outline, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-outline").value,
    )
    CompositionLocalProvider(
        LocalHeikaDark provides dark,
        LocalHeikaBodyTextScale provides HeikaReadingSizes.bodyScale(bodyTextSize),
        LocalHeikaTitleTextScale provides HeikaReadingSizes.titleScale(titleTextSize),
    ) {
        val family = HeikaFontCatalog.resolve(fontChoice)
        val base = Typography()
        val typography = base.copy(
            displayLarge = base.displayLarge.copy(fontFamily = family),
            displayMedium = base.displayMedium.copy(fontFamily = family),
            displaySmall = base.displaySmall.copy(fontFamily = family),
            headlineLarge = base.headlineLarge.copy(fontFamily = family),
            headlineMedium = base.headlineMedium.copy(fontFamily = family),
            headlineSmall = base.headlineSmall.copy(fontFamily = family),
            titleLarge = base.titleLarge.copy(fontFamily = family),
            titleMedium = base.titleMedium.copy(fontFamily = family),
            titleSmall = base.titleSmall.copy(fontFamily = family),
            bodyLarge = base.bodyLarge.copy(fontFamily = family),
            bodyMedium = base.bodyMedium.copy(fontFamily = family),
            bodySmall = base.bodySmall.copy(fontFamily = family),
            labelLarge = base.labelLarge.copy(fontFamily = family),
            labelMedium = base.labelMedium.copy(fontFamily = family),
            labelSmall = base.labelSmall.copy(fontFamily = family),
        )
        MaterialTheme(colorScheme = scheme, shapes = HeikaShapes, typography = typography, content = content)
    }
}
