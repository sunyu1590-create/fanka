package com.heika.nativeapp.ui

import android.net.Uri
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.draw.blur
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
import com.heika.nativeapp.feature.compat.DestinationResolver
import com.heika.nativeapp.feature.compat.DestinationTarget
import com.heika.nativeapp.feature.compat.HeikaDestination
import com.heika.nativeapp.feature.discovery.DiscoveryScreen
import com.heika.nativeapp.feature.home.HomeScreen
import com.heika.nativeapp.feature.notifications.NotificationsScreen
import com.heika.nativeapp.feature.notifications.ForegroundNoticeHost
import com.heika.nativeapp.data.HeikaPost
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
        val showBottomBar = topLevelRoute
        val openDestination: (HeikaDestination) -> Unit = remember(nav) {
            { destination ->
                when (val target = DestinationResolver.resolve(destination)) {
                    is DestinationTarget.Native -> nav.navigate(target.route) { launchSingleTop = true }
                    is DestinationTarget.Compatibility -> {
                        if (nav.currentDestination?.route?.startsWith("compat?") == true) nav.popBackStack()
                        nav.navigate(
                            "compat?url=${Uri.encode(target.path)}&type=${Uri.encode(target.type)}&targetId=${Uri.encode(target.id.orEmpty())}",
                        ) { launchSingleTop = true }
                    }
                    is DestinationTarget.Invalid -> nav.navigate("destination-error?message=${Uri.encode(target.message)}")
                }
            }
        }
        Box(
            Modifier.fillMaxSize()
                .background(androidx.compose.material3.MaterialTheme.colorScheme.background)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)),
        ) {
            Box(
                Modifier.fillMaxSize().hazeSource(hazeState),
            ) {
                NavHost(
                    navController = nav,
                    startDestination = "home",
                    modifier = Modifier.fillMaxSize()
                        .then(
                            if (topLevelRoute) Modifier
                            else Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
                        )
                        .imePadding(),
                    enterTransition = { fadeIn(tween(190)) },
                    exitTransition = { fadeOut(tween(150)) },
                    popEnterTransition = { fadeIn(tween(160)) },
                    popExitTransition = { fadeOut(tween(130)) },
                ) {
                composable("home") {
                    HomeScreen(
                        onSearch = { openDestination(HeikaDestination.Search) },
                        onNotifications = { openDestination(HeikaDestination.Notifications) },
                        onPost = { post -> openDestination(post.destination()) },
                        onPreviewActive = { homePreviewActive = it },
                    )
                }
                composable("discovery") {
                    DiscoveryScreen(
                        onSearch = { openDestination(HeikaDestination.Search) },
                        onNotifications = { openDestination(HeikaDestination.Notifications) },
                        onPost = { post -> openDestination(post.destination()) },
                    )
                }
                composable("messages") {
                    CompatWebScreen("/?nativeTab=messages&nativeBottomBar=1", "messages", "", auth, { nav.popBackStack() }, { openDestination(HeikaDestination.About) })
                }
                composable("profile") {
                    CompatWebScreen("/?nativeTab=mine&nativeBottomBar=1", "my_page", "", auth, { nav.popBackStack() }, { openDestination(HeikaDestination.About) })
                }
                composable("notifications") {
                    NotificationsScreen(
                        onBack = { nav.popBackStack() },
                        onLogin = { nav.navigate("account") },
                        onContent = { id, isPost ->
                            if (isPost) openDestination(id.toIntOrNull()?.let(HeikaDestination::CommunityPost) ?: HeikaDestination.CommunityPost(-1))
                            else openDestination(HeikaDestination.UserProfile(id))
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
                    AboutScreen(onBack = { nav.popBackStack() }, onFeedback = { openDestination(HeikaDestination.Feedback) })
                }
                composable("account") {
                    AccountScreen(onBack = { nav.popBackStack() }, onSignedIn = { nav.popBackStack() })
                }
                composable(
                    route = "compat?url={url}&type={type}&targetId={targetId}",
                    arguments = listOf(
                        navArgument("url") { type = NavType.StringType; defaultValue = "/" },
                        navArgument("type") { type = NavType.StringType; defaultValue = "unknown" },
                        navArgument("targetId") { type = NavType.StringType; defaultValue = "" },
                    ),
                ) { entry ->
                    CompatWebScreen(
                        path = entry.arguments?.getString("url") ?: "/",
                        targetType = entry.arguments?.getString("type") ?: "unknown",
                        targetId = entry.arguments?.getString("targetId").orEmpty(),
                        auth = auth,
                        onBack = { nav.popBackStack() },
                        onOpenAbout = { openDestination(HeikaDestination.About) },
                    )
                }
                composable(
                    route = "destination-error?message={message}",
                    arguments = listOf(navArgument("message") { type = NavType.StringType; defaultValue = "目标页面无法打开" }),
                ) { entry ->
                    Column(Modifier.fillMaxSize().background(androidx.compose.material3.MaterialTheme.colorScheme.background)) {
                        BackHeader("页面无法打开", { nav.popBackStack() })
                        androidx.compose.material3.Text(
                            entry.arguments?.getString("message") ?: "目标页面无法打开",
                            Modifier.padding(horizontal = 22.dp, vertical = 18.dp),
                            color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                }
            }
            if (showBottomBar) {
                GlassNavigationBar(
                    selected = selected,
                    hazeState = hazeState,
                    onSelect = { target -> navigateTopLevel(nav, target) },
                    onPublish = { openDestination(HeikaDestination.Publish) },
                    modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 8.dp)
                        .then(if (homePreviewActive) Modifier.blur(10.dp) else Modifier),
                )
            }
            ForegroundNoticeHost(
                modifier = Modifier.align(Alignment.TopCenter).padding(horizontal = 14.dp, vertical = 8.dp),
                onOpen = { item ->
                    when {
                        item.postId != null -> item.postId.toIntOrNull()?.let { openDestination(HeikaDestination.CommunityPost(it)) }
                        item.actorId != null -> openDestination(HeikaDestination.UserProfile(item.actorId))
                    }
                },
            )
        }
    }
}

private fun HeikaPost.destination(): HeikaDestination =
    if (channel == "ai") HeikaDestination.AiResource(id, cloudId)
    else HeikaDestination.CommunityPost(id)

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
