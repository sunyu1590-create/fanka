package com.heika.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.ui.HeikaImageCache
import com.heika.nativeapp.ui.HeikaNativeApp
import com.heika.nativeapp.ui.HeikaTheme
import com.heika.nativeapp.ui.NativePreferences
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var authRepository: AuthRepository
    @Inject lateinit var imageCache: HeikaImageCache
    @Inject lateinit var preferences: NativePreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // Native 3.0 draws edge-to-edge and applies safe drawing insets once at
        // the Compose root. This keeps page content below status icons/cutouts.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            val theme by preferences.theme.collectAsState(initial = "dark")
            val loader by imageCache.loader.collectAsState()
            val systemDark = isSystemInDarkTheme()
            val lightSystemBars = theme == "light" || (theme == "system" && !systemDark)
            HeikaTheme(theme) {
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
                HeikaNativeApp(
                    imageLoader = loader,
                    auth = authRepository,
                )
            }
        }
    }
}
