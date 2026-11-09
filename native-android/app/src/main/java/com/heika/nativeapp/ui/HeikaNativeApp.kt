package com.heika.nativeapp.ui

import android.net.Uri
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import coil3.ImageLoader
import com.heika.nativeapp.auth.AccountScreen
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.feature.compat.CompatWebScreen
import com.heika.nativeapp.feature.discovery.DiscoveryScreen
import com.heika.nativeapp.feature.home.HomeScreen
import com.heika.nativeapp.feature.notifications.NotificationsScreen
import com.heika.nativeapp.feature.settings.AboutScreen
import com.heika.nativeapp.feature.settings.SettingsScreen
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

@Composable
fun HeikaNativeApp(imageLoader: ImageLoader, auth: AuthRepository) {
    CompositionLocalProvider(LocalHeikaImageLoader provides imageLoader) {
        val nav = rememberNavController()
        val hazeState = rememberHazeState()
        val backStack by nav.currentBackStackEntryAsState()
        val route = backStack?.destination?.route.orEmpty()
        var homePreviewActive by remember { mutableStateOf(false) }
        val selected = when (route) {
            "discovery" -> "discovery"
            "messages" -> "messages"
            "profile" -> "profile"
            else -> "home"
        }
        val topLevelRoute = route in setOf("home", "discovery", "messages", "profile")
        val showBottomBar = topLevelRoute && !(route == "home" && homePreviewActive)
        val openCompat: (String) -> Unit = remember(nav) {
            { path -> nav.navigate("compat?url=${Uri.encode(path)}") }
        }
        Box(
            Modifier.fillMaxSize()
                .background(androidx.compose.material3.MaterialTheme.colorScheme.background)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)),
        ) {
            NavHost(
                navController = nav,
                startDestination = "home",
                modifier = Modifier.fillMaxSize()
                    .then(
                        if (topLevelRoute) Modifier
                        else Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
                    )
                    .imePadding()
                    .hazeSource(hazeState),
                enterTransition = { fadeIn(tween(190)) },
                exitTransition = { fadeOut(tween(150)) },
                popEnterTransition = { fadeIn(tween(160)) },
                popExitTransition = { fadeOut(tween(130)) },
            ) {
                composable("home") {
                    HomeScreen(
                        onSearch = { openCompat("/?nativeTab=search") },
                        onNotifications = { nav.navigate("notifications") },
                        onPost = { post -> openCompat("/?post=${post.id}") },
                        onPreviewActive = { homePreviewActive = it },
                    )
                }
                composable("discovery") {
                    DiscoveryScreen(
                        onSearch = { openCompat("/?nativeTab=search") },
                        onNotifications = { nav.navigate("notifications") },
                        onPost = { post -> openCompat("/?post=${post.id}") },
                    )
                }
                composable("messages") {
                    CompatWebScreen("/?nativeTab=messages", auth) { nav.popBackStack() }
                }
                composable("profile") {
                    CompatWebScreen("/?nativeTab=mine", auth) { nav.popBackStack() }
                }
                composable("notifications") {
                    NotificationsScreen(
                        onBack = { nav.popBackStack() },
                        onLogin = { nav.navigate("account") },
                        onContent = { id, isPost ->
                            if (isPost) openCompat("/?post=${Uri.encode(id)}") else openCompat("/?profile=${Uri.encode(id)}")
                        },
                    )
                }
                composable("settings") {
                    SettingsScreen(
                        onBack = { nav.popBackStack() },
                        onAbout = { nav.navigate("about") },
                        onAccount = { nav.navigate("account") },
                    )
                }
                composable("about") {
                    AboutScreen(onBack = { nav.popBackStack() }, onFeedback = { openCompat("/?nativeTab=feedback") })
                }
                composable("account") {
                    AccountScreen(onBack = { nav.popBackStack() }, onSignedIn = { nav.popBackStack() })
                }
                composable(
                    route = "compat?url={url}",
                    arguments = listOf(navArgument("url") { type = NavType.StringType; defaultValue = "/" }),
                ) { entry ->
                    CompatWebScreen(entry.arguments?.getString("url") ?: "/", auth) { nav.popBackStack() }
                }
            }
            if (showBottomBar) {
                GlassNavigationBar(
                    selected = selected,
                    hazeState = hazeState,
                    onSelect = { target -> navigateTopLevel(nav, target) },
                    onPublish = { openCompat("/?nativeTab=publish") },
                    modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 8.dp),
                )
            }
        }
    }
}

private fun navigateTopLevel(nav: androidx.navigation.NavHostController, target: String) {
    val destination = when (target) {
        "discovery" -> "discovery"
        "messages" -> "messages"
        "profile" -> "profile"
        else -> "home"
    }
    nav.navigate(destination) {
        popUpTo(nav.graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
