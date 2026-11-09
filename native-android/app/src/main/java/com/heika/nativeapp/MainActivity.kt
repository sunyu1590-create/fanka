package com.heika.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.toArgb
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
        WindowCompat.setDecorFitsSystemWindows(window, true)
        setContent {
            val theme by preferences.theme.collectAsState(initial = "dark")
            val loader by imageCache.loader.collectAsState()
            HeikaTheme(theme) {
                val systemBarColor = androidx.compose.material3.MaterialTheme.colorScheme.background
                SideEffect {
                    window.statusBarColor = systemBarColor.toArgb()
                    window.navigationBarColor = systemBarColor.toArgb()
                    val controller = WindowCompat.getInsetsController(window, window.decorView)
                    controller.isAppearanceLightStatusBars = theme == "light"
                    controller.isAppearanceLightNavigationBars = theme == "light"
                }
                HeikaNativeApp(
                    imageLoader = loader,
                    auth = authRepository,
                )
            }
        }
    }
}
