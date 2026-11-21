package com.heika.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.hilt.navigation.compose.hiltViewModel
import com.heika.nativeapp.ui.DecorViewModel
import com.heika.nativeapp.ui.HeikaImageCache
import com.heika.nativeapp.ui.HeikaNativeApp
import com.heika.nativeapp.ui.LocalDecor
import com.heika.nativeapp.ui.HeikaTheme
import com.heika.nativeapp.ui.NativePreferences
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var imageCache: HeikaImageCache
    @Inject lateinit var preferences: NativePreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // Native 3.0 draws edge-to-edge and applies safe drawing insets once at
        // the Compose root. This keeps page content below status icons/cutouts.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            val theme by preferences.theme.collectAsState(initial = "system")
            val pageTransition by preferences.pageTransition.collectAsState(initial = "shared")
            val fontChoice by preferences.fontChoice.collectAsState(initial = "oppo_sans")
            val bodyTextSize by preferences.bodyTextSize.collectAsState(initial = "standard")
            val titleTextSize by preferences.titleTextSize.collectAsState(initial = "standard")
            val loader by imageCache.loader.collectAsState()
            val systemDark = isSystemInDarkTheme()
            val lightSystemBars = theme == "light" || (theme == "system" && !systemDark)
            HeikaTheme(theme, fontChoice, bodyTextSize, titleTextSize) {
                SideEffect {
                    window.statusBarColor = android.graphics.Color.TRANSPARENT
                    window.navigationBarColor = android.graphics.Color.TRANSPARENT
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                        window.isStatusBarContrastEnforced = false
                        window.isNavigationBarContrastEnforced = false
                    }
                    val controller = WindowCompat.getInsetsController(window, window.decorView)
                    controller.isAppearanceLightStatusBars = lightSystemBars
                    controller.isAppearanceLightNavigationBars = lightSystemBars
                }
                // 装扮属于账号设置：冷启动先读缓存，再回前台时静默对齐一次，
                // 这样网页端应用的新主题能在 App 里自然生效，而不会闪回默认。
                val decorViewModel: DecorViewModel = hiltViewModel()
                val decor by decorViewModel.config.collectAsState()
                LaunchedEffect(decorViewModel) { decorViewModel.start() }
                val lifecycleOwner = LocalLifecycleOwner.current
                DisposableEffect(lifecycleOwner) {
                    val observer = LifecycleEventObserver { _, event ->
                        if (event == Lifecycle.Event.ON_RESUME) decorViewModel.refresh()
                    }
                    lifecycleOwner.lifecycle.addObserver(observer)
                    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
                }
                CompositionLocalProvider(LocalDecor provides decor) {
                    HeikaNativeApp(imageLoader = loader, pageTransition = pageTransition)
                }
            }
        }
    }
}
