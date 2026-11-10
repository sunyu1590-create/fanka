package com.heika.nativeapp.ui

import android.content.Intent
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
import com.heika.nativeapp.feature.navigation.DestinationResolver
import com.heika.nativeapp.feature.navigation.DestinationTarget
import com.heika.nativeapp.feature.navigation.HeikaDestination
import com.heika.nativeapp.feature.detail.PostDetailScreen
import com.heika.nativeapp.feature.discovery.DiscoveryScreen
import com.heika.nativeapp.feature.home.HomeScreen
import com.heika.nativeapp.feature.messages.MessagesScreen
import com.heika.nativeapp.feature.notifications.NotificationsScreen
import com.heika.nativeapp.feature.notifications.ForegroundNoticeHost
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.feature.profile.ProfileScreen
import com.heika.nativeapp.feature.profile.ProfileViewModel
import com.heika.nativeapp.feature.profile.EditProfileScreen
import com.heika.nativeapp.feature.profile.ExplorationCenterScreen
import com.heika.nativeapp.feature.profile.ManageWorksScreen
import com.heika.nativeapp.feature.publish.PublishScreen
import com.heika.nativeapp.feature.search.SearchScreen
import com.heika.nativeapp.feature.FeedbackScreen
import com.heika.nativeapp.feature.MembershipScreen
import com.heika.nativeapp.feature.settings.AboutScreen
import com.heika.nativeapp.feature.settings.SettingsScreen
import com.heika.nativeapp.feature.settings.SettingsDetailScreen
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

@Composable
fun HeikaNativeApp(imageLoader: ImageLoader) {
    CompositionLocalProvider(LocalHeikaImageLoader provides imageLoader) {
        val context = LocalContext.current
        val nav = rememberNavController()
        val hazeState = rememberHazeState()
        val backStack by nav.currentBackStackEntryAsState()
        val route = backStack?.destination?.route.orEmpty()
        var homePreviewActive by remember { mutableStateOf(false) }
        var chatConversationOpen by remember { mutableStateOf(false) }
        val selected = when (route) {
            "discovery" -> "discovery"
            "messages", "conversation/{conversationId}" -> "messages"
            "profile", "user/{userId}" -> "profile"
            else -> "home"
        }
        val topLevelRoute = route in setOf("home", "discovery", "messages", "profile")
        val showBottomBar = topLevelRoute && !(route == "messages" && chatConversationOpen)
        val openDestination: (HeikaDestination) -> Unit = remember(nav) {
            { destination ->
                when (val target = DestinationResolver.resolve(destination)) {
                    is DestinationTarget.Native -> nav.navigate(target.route) { launchSingleTop = true }
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
                            if (topLevelRoute && !(route == "messages" && chatConversationOpen)) Modifier
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
                    MessagesScreen(
                        onBack = { nav.popBackStack() },
                        onProfile = { id -> openDestination(HeikaDestination.UserProfile(id)) },
                        onLogin = { nav.navigate("account") },
                        onConversationChange = { chatConversationOpen = it },
                    )
                }
                composable("profile") {
                    val profileViewModel: ProfileViewModel = androidx.hilt.navigation.compose.hiltViewModel()
                    ProfileScreen(
                        userId = null,
                        onBack = { nav.popBackStack() },
                        onPost = { post -> openDestination(post.destination()) },
                        onDraft = { post -> nav.navigate("publish?channel=${post.channel}&draftId=${post.id}") },
                        onSettings = { openDestination(HeikaDestination.Settings) },
                        onMembership = { openDestination(HeikaDestination.Membership) },
                        onMessage = { id -> openDestination(HeikaDestination.StartConversation(id)) },
                        onLogin = { nav.navigate("account") },
                        onEditProfile = { nav.navigate("edit-profile") },
                        onExplore = { nav.navigate("exploration") },
                        onManageWorks = { nav.navigate("manage-works") },
                        viewModel = profileViewModel,
                    )
                }
                composable("search") {
                    SearchScreen(
                        onBack = { nav.popBackStack() },
                        onPost = { post -> openDestination(post.destination()) },
                        onProfile = { id -> openDestination(HeikaDestination.UserProfile(id)) },
                    )
                }
                composable(
                    route = "post/{postKey}",
                    arguments = listOf(navArgument("postKey") { type = NavType.StringType }),
                ) { entry ->
                    PostDetailScreen(
                        postKey = entry.arguments?.getString("postKey"),
                        onBack = { nav.popBackStack() },
                        onAuthor = { id -> openDestination(HeikaDestination.UserProfile(id)) },
                        onLogin = { nav.navigate("account") },
                        onShare = { post -> shareNativePost(context, post) },
                    )
                }
                composable(
                    route = "user/{userId}",
                    arguments = listOf(navArgument("userId") { type = NavType.StringType }),
                ) { entry ->
                    ProfileScreen(
                        userId = entry.arguments?.getString("userId"),
                        onBack = { nav.popBackStack() },
                        onPost = { post -> openDestination(post.destination()) },
                        onDraft = { post -> nav.navigate("publish?channel=${post.channel}&draftId=${post.id}") },
                        onSettings = { openDestination(HeikaDestination.Settings) },
                        onMembership = { openDestination(HeikaDestination.Membership) },
                        onMessage = { id -> openDestination(HeikaDestination.StartConversation(id)) },
                        onLogin = { nav.navigate("account") },
                    )
                }
                composable(
                    route = "conversation/{conversationId}",
                    arguments = listOf(navArgument("conversationId") { type = NavType.StringType }),
                ) { entry ->
                    MessagesScreen(
                        initialConversationId = entry.arguments?.getString("conversationId"),
                        onBack = { nav.popBackStack() },
                        onProfile = { id -> openDestination(HeikaDestination.UserProfile(id)) },
                        onLogin = { nav.navigate("account") },
                    )
                }
                composable(
                    route = "new-conversation/{userId}",
                    arguments = listOf(navArgument("userId") { type = NavType.StringType }),
                ) { entry ->
                    MessagesScreen(
                        initialPeerId = entry.arguments?.getString("userId"),
                        onBack = { nav.popBackStack() },
                        onProfile = { id -> openDestination(HeikaDestination.UserProfile(id)) },
                        onLogin = { nav.navigate("account") },
                    )
                }
                composable(
                    route = "publish?channel={channel}&draftId={draftId}",
                    arguments = listOf(
                        navArgument("channel") { type = NavType.StringType; defaultValue = "community" },
                        navArgument("draftId") { type = NavType.StringType; defaultValue = "0" },
                    ),
                ) { entry ->
                    PublishScreen(
                        onBack = { nav.popBackStack() },
                        onLogin = { nav.navigate("account") },
                        draftId = entry.arguments?.getString("draftId")?.toIntOrNull()?.takeIf { it > 0 },
                        channel = entry.arguments?.getString("channel") ?: "community",
                        onPublished = { post ->
                            nav.popBackStack()
                            openDestination(post.destination())
                        },
                    )
                }
                composable("feedback") {
                    FeedbackScreen(onBack = { nav.popBackStack() }, onLogin = { nav.navigate("account") })
                }
                composable("membership") {
                    MembershipScreen(onBack = { nav.popBackStack() }, onLogin = { nav.navigate("account") })
                }
                composable("notifications") {
                    NotificationsScreen(
                        onBack = { nav.popBackStack() },
                        onLogin = { nav.navigate("account") },
                        onContent = { id, isPost ->
                            if (isPost) openDestination(id.toIntOrNull()?.let(HeikaDestination::CommunityPost) ?: HeikaDestination.CommunityPost(0, id))
                            else openDestination(HeikaDestination.UserProfile(id))
                        },
                    )
                }
                composable("settings") {
                    SettingsScreen(
                        onBack = { nav.popBackStack() },
                        onSection = { section -> if (section == "about") nav.navigate("about") else nav.navigate("settings/$section") },
                    )
                }
                composable(
                    route = "settings/{section}",
                    arguments = listOf(navArgument("section") { type = NavType.StringType }),
                ) { entry ->
                    SettingsDetailScreen(
                        section = entry.arguments?.getString("section").orEmpty(),
                        onBack = { nav.popBackStack() },
                        onAccount = { nav.navigate("account") },
                        onEditProfile = { nav.navigate("edit-profile") },
                        onMembership = { openDestination(HeikaDestination.Membership) },
                        onAbout = { nav.navigate("about") },
                        onNotifications = { openDestination(HeikaDestination.Notifications) },
                    )
                }
                composable("edit-profile") {
                    val currentEntry by nav.currentBackStackEntryAsState()
                    val profileEntry = remember(currentEntry) { nav.getBackStackEntry("profile") }
                    val profileViewModel: ProfileViewModel = androidx.hilt.navigation.compose.hiltViewModel(profileEntry)
                    EditProfileScreen(onBack = { nav.popBackStack() }, viewModel = profileViewModel)
                }
                composable("exploration") {
                    ExplorationCenterScreen(onBack = { nav.popBackStack() })
                }
                composable("manage-works") {
                    val currentEntry by nav.currentBackStackEntryAsState()
                    val profileEntry = remember(currentEntry) { nav.getBackStackEntry("profile") }
                    val profileViewModel: ProfileViewModel = androidx.hilt.navigation.compose.hiltViewModel(profileEntry)
                    ManageWorksScreen(onBack = { nav.popBackStack() }, onEdit = { post -> nav.navigate("publish?channel=${post.channel}&draftId=${post.id}") }, viewModel = profileViewModel)
                }
                composable("about") {
                    AboutScreen(onBack = { nav.popBackStack() }, onFeedback = { openDestination(HeikaDestination.Feedback) })
                }
                composable("account") {
                    AccountScreen(onBack = { nav.popBackStack() }, onSignedIn = { nav.popBackStack() })
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
                            ?: openDestination(HeikaDestination.CommunityPost(0, item.postId))
                        item.actorId != null -> openDestination(HeikaDestination.UserProfile(item.actorId))
                    }
                },
            )
        }
    }
}

private fun HeikaPost.destination(): HeikaDestination =
    if (channel == "ai") HeikaDestination.AiResource(id, cloudId)
    else HeikaDestination.CommunityPost(id, cloudId)

private fun shareNativePost(context: android.content.Context, post: HeikaPost) {
    val url = if (post.channel == "ai") {
        "https://moonclean.shop/?aiPost=${post.id}&cloudId=${Uri.encode(post.cloudId)}"
    } else {
        "https://moonclean.shop/?post=${post.id}"
    }
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, post.title)
        putExtra(Intent.EXTRA_TEXT, "${post.title}\n$url")
    }
    runCatching { context.startActivity(Intent.createChooser(send, "分享内容")) }
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
