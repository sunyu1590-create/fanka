package com.heika.nativeapp.ui

import android.graphics.RenderEffect
import android.graphics.Shader
import android.os.Build
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateDpAsState
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.navigation
import androidx.navigation.navArgument
import kotlinx.coroutines.delay
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
import com.heika.nativeapp.feature.exploration.CoExploreScreen
import com.heika.nativeapp.feature.exploration.ExplorationCalendarScreen
import com.heika.nativeapp.feature.exploration.ExplorationCenterScreen
import com.heika.nativeapp.feature.exploration.ExplorationDailyTasksScreen
import com.heika.nativeapp.feature.exploration.ExplorationRewardsScreen
import com.heika.nativeapp.feature.exploration.ExplorationEventsScreen
import com.heika.nativeapp.feature.exploration.ExplorationChainsViewModel
import com.heika.nativeapp.feature.exploration.StoryChainDetailScreen
import com.heika.nativeapp.feature.exploration.StoryChainListScreen
import com.heika.nativeapp.feature.profile.ManageWorksScreen
import com.heika.nativeapp.feature.publish.PublishScreen
import com.heika.nativeapp.feature.search.SearchScreen
import com.heika.nativeapp.feature.FeedbackScreen
import com.heika.nativeapp.feature.MembershipScreen
import com.heika.nativeapp.feature.settings.AboutScreen
import com.heika.nativeapp.feature.settings.SettingsScreen
import com.heika.nativeapp.feature.settings.SettingsDetailScreen
import com.heika.nativeapp.feature.settings.AdminCenterScreen
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun HeikaNativeApp(imageLoader: ImageLoader, pageTransition: String = "lift") {
    CompositionLocalProvider(LocalHeikaImageLoader provides imageLoader) {
        val context = LocalContext.current
        val nav = rememberNavController()
        val hazeState = rememberHazeState()
        val modalBackdropCount = remember { mutableIntStateOf(0) }
        val modalBlurRadius by animateDpAsState(
            targetValue = if (modalBackdropCount.intValue > 0) 9.dp else 0.dp,
            animationSpec = tween(210),
            label = "modal-backdrop-blur",
        )
        val backStack by nav.currentBackStackEntryAsState()
        val route = backStack?.destination?.route.orEmpty()
        val sharedPosts = remember { mutableStateMapOf<String, HeikaPost>() }
        var homePreviewActive by remember { mutableStateOf(false) }
        var chatConversationOpen by remember { mutableStateOf(false) }
        val selected = when (route) {
            "discovery" -> "discovery"
            "messages", "conversation/{conversationId}" -> "messages"
            "profile", "user/{userId}" -> "profile"
            else -> "home"
        }
        val topLevelRoute = route in setOf("home", "discovery", "messages", "profile")
        val mainTabRoutes = setOf("home", "discovery", "messages", "profile")
        var mainTabSwitchActive by remember { mutableStateOf(false) }
        LaunchedEffect(mainTabSwitchActive, route) {
            if (mainTabSwitchActive && route in mainTabRoutes) {
                delay((HeikaMotion.transition + 60).toLong())
                mainTabSwitchActive = false
            }
        }
        val showBottomBar = topLevelRoute && !(route == "messages" && chatConversationOpen)
        val openDestination: (HeikaDestination) -> Unit = remember(nav) {
            { destination ->
                when (val target = DestinationResolver.resolve(destination)) {
                    is DestinationTarget.Native -> nav.navigate(target.route) { launchSingleTop = true }
                    is DestinationTarget.Invalid -> nav.navigate("destination-error?message=${Uri.encode(target.message)}")
                }
            }
        }
        val openPost: (HeikaPost) -> Unit = remember(nav, sharedPosts) {
            { post ->
                val key = post.sharedImageKey()
                sharedPosts[key] = post
                if (sharedPosts.size > 80) sharedPosts.keys.firstOrNull { it != key }?.let(sharedPosts::remove)
                openDestination(post.destination())
            }
        }
        CompositionLocalProvider(LocalHeikaModalBackdropCount provides modalBackdropCount) {
        Box(
            Modifier.fillMaxSize()
                .background(androidx.compose.material3.MaterialTheme.colorScheme.background)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
                .graphicsLayer {
                    val radiusPx = modalBlurRadius.toPx()
                    renderEffect = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && radiusPx > 0f) {
                        RenderEffect.createBlurEffect(radiusPx, radiusPx, Shader.TileMode.CLAMP).asComposeRenderEffect()
                    } else null
                },
        ) {
            Box(
                Modifier.fillMaxSize().hazeSource(hazeState),
            ) {
                SharedTransitionLayout(Modifier.fillMaxSize()) {
                val sharedTransitionScope = this
                NavHost(
                    navController = nav,
                    startDestination = "home",
                    modifier = Modifier.fillMaxSize()
                        .then(
                            if (topLevelRoute && !(route == "messages" && chatConversationOpen)) Modifier
                            else Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
                        )
                        .imePadding(),
                    enterTransition = {
                        if (initialState.destination.route.orEmpty() in mainTabRoutes && targetState.destination.route.orEmpty() in mainTabRoutes) {
                            fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard))
                        } else if (pageTransition == "shared" && initialState.destination.route.orEmpty() in sharedCardSourceRoutes && targetState.destination.route == postDetailRoute) {
                            fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard))
                        } else when (pageTransition) {
                            "crossfade" -> fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard))
                            "shared" -> fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard)) +
                                slideInVertically(tween(HeikaMotion.transition, easing = HeikaMotion.standard)) { it / 72 }
                            else -> fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard)) +
                                slideInVertically(tween(HeikaMotion.transition, easing = HeikaMotion.standard)) { it / 36 }
                        }
                    },
                    exitTransition = {
                        if (initialState.destination.route.orEmpty() in mainTabRoutes && targetState.destination.route.orEmpty() in mainTabRoutes) {
                            fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                        } else if (pageTransition == "shared" && initialState.destination.route.orEmpty() in sharedCardSourceRoutes && targetState.destination.route == postDetailRoute) {
                            fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                        } else when (pageTransition) {
                            "crossfade" -> fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                            "shared" -> fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard)) +
                                slideOutVertically(tween(HeikaMotion.control, easing = HeikaMotion.standard)) { -it / 96 }
                            else -> fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard)) +
                                slideOutVertically(tween(HeikaMotion.control, easing = HeikaMotion.standard)) { -it / 48 }
                        }
                    },
                    popEnterTransition = {
                        if (initialState.destination.route.orEmpty() in mainTabRoutes && targetState.destination.route.orEmpty() in mainTabRoutes) {
                            fadeIn(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                        } else if (pageTransition == "shared" && initialState.destination.route == postDetailRoute && targetState.destination.route.orEmpty() in sharedCardSourceRoutes) {
                            fadeIn(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                        } else when (pageTransition) {
                            "crossfade" -> fadeIn(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                            "shared" -> fadeIn(tween(HeikaMotion.control, easing = HeikaMotion.standard)) +
                                slideInVertically(tween(HeikaMotion.control, easing = HeikaMotion.standard)) { -it / 96 }
                            else -> fadeIn(tween(HeikaMotion.control, easing = HeikaMotion.standard)) +
                                slideInVertically(tween(HeikaMotion.control, easing = HeikaMotion.standard)) { -it / 48 }
                        }
                    },
                    popExitTransition = {
                        if (initialState.destination.route.orEmpty() in mainTabRoutes && targetState.destination.route.orEmpty() in mainTabRoutes) {
                            fadeOut(tween(HeikaMotion.quick, easing = HeikaMotion.standard))
                        } else if (pageTransition == "shared" && initialState.destination.route == postDetailRoute && targetState.destination.route.orEmpty() in sharedCardSourceRoutes) {
                            fadeOut(tween(HeikaMotion.quick, easing = HeikaMotion.standard))
                        } else when (pageTransition) {
                            "crossfade" -> fadeOut(tween(HeikaMotion.quick, easing = HeikaMotion.standard))
                            "shared" -> fadeOut(tween(HeikaMotion.quick, easing = HeikaMotion.standard)) +
                                slideOutVertically(tween(HeikaMotion.quick, easing = HeikaMotion.standard)) { it / 72 }
                            else -> fadeOut(tween(HeikaMotion.quick, easing = HeikaMotion.standard)) +
                                slideOutVertically(tween(HeikaMotion.quick, easing = HeikaMotion.standard)) { it / 36 }
                        }
                    },
                ) {
                composable("home") {
                    HomeScreen(
                        onSearch = { openDestination(HeikaDestination.Search) },
                        onNotifications = { openDestination(HeikaDestination.Notifications) },
                        onPost = openPost,
                        onPreviewActive = { homePreviewActive = it },
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared" && !mainTabSwitchActive,
                    )
                }
                composable("discovery") {
                    DiscoveryScreen(
                        onSearch = { openDestination(HeikaDestination.Search) },
                        onNotifications = { openDestination(HeikaDestination.Notifications) },
                        onPost = openPost,
                        hazeState = hazeState,
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared" && !mainTabSwitchActive,
                    )
                }
                composable("messages") {
                    MessagesScreen(
                        onBack = { nav.popBackStack() },
                        onProfile = { id -> openDestination(HeikaDestination.UserProfile(id)) },
                        onLogin = { nav.navigate("account") },
                        onNotifications = { openDestination(HeikaDestination.Notifications) },
                        onConversationChange = { chatConversationOpen = it },
                    )
                }
                composable("profile") {
                    val profileViewModel: ProfileViewModel = androidx.hilt.navigation.compose.hiltViewModel()
                    val visibleEntry by nav.currentBackStackEntryAsState()
                    LaunchedEffect(visibleEntry?.destination?.route) {
                        if (visibleEntry?.destination?.route == "profile") {
                            val profileEntry = runCatching { nav.getBackStackEntry("profile") }.getOrNull()
                            if (profileEntry?.savedStateHandle?.get<Boolean>("refreshProfileExploration") == true) {
                                profileEntry.savedStateHandle["refreshProfileExploration"] = false
                                profileViewModel.refreshExplorationSummary()
                            }
                        }
                    }
                    ProfileScreen(
                        userId = null,
                        onBack = { nav.popBackStack() },
                        onPost = openPost,
                        onDraft = { post -> nav.navigate("publish?channel=${post.channel}&draftId=${post.id}") },
                        onSettings = { openDestination(HeikaDestination.Settings) },
                        onMembership = { openDestination(HeikaDestination.Membership) },
                        onMessage = { id -> openDestination(HeikaDestination.StartConversation(id)) },
                        onLogin = { nav.navigate("account") },
                        onEditProfile = { nav.navigate("edit-profile") },
                        onExplore = {
                            runCatching { nav.getBackStackEntry("profile").savedStateHandle.set("refreshProfileExploration", true) }
                            nav.navigate("exploration")
                        },
                        onDailyTasks = {
                            runCatching { nav.getBackStackEntry("profile").savedStateHandle.set("refreshProfileExploration", true) }
                            nav.navigate("exploration/tasks")
                        },
                        onManageWorks = { nav.navigate("manage-works") },
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared" && !mainTabSwitchActive,
                        hazeState = hazeState,
                        viewModel = profileViewModel,
                    )
                }
                composable("search") {
                    SearchScreen(
                        onBack = { nav.popBackStack() },
                        onPost = openPost,
                        onProfile = { id -> openDestination(HeikaDestination.UserProfile(id)) },
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared",
                    )
                }
                composable(
                    route = postDetailRoute,
                    arguments = listOf(navArgument("postKey") { type = NavType.StringType }),
                ) { entry ->
                    PostDetailScreen(
                        post = entry.arguments?.getString("postKey")?.let(sharedPosts::get),
                        postKey = entry.arguments?.getString("postKey"),
                        onBack = { nav.popBackStack() },
                        onAuthor = { id -> openDestination(HeikaDestination.UserProfile(id)) },
                        onLogin = { nav.navigate("account") },
                        onShare = { post -> shareNativePost(context, post) },
                        hazeState = hazeState,
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared",
                    )
                }
                composable(
                    route = "user/{userId}",
                    arguments = listOf(navArgument("userId") { type = NavType.StringType }),
                ) { entry ->
                    ProfileScreen(
                        userId = entry.arguments?.getString("userId"),
                        onBack = { nav.popBackStack() },
                        onPost = openPost,
                        onDraft = { post -> nav.navigate("publish?channel=${post.channel}&draftId=${post.id}") },
                        onSettings = { openDestination(HeikaDestination.Settings) },
                        onMembership = { openDestination(HeikaDestination.Membership) },
                        onMessage = { id -> openDestination(HeikaDestination.StartConversation(id)) },
                        onLogin = { nav.navigate("account") },
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared",
                        hazeState = hazeState,
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
                            openPost(post)
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
                        onSection = { section -> when (section) { "about" -> nav.navigate("about"); "admin" -> nav.navigate("admin"); else -> nav.navigate("settings/$section") } },
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
                        onSection = { section -> nav.navigate("settings/$section") },
                    )
                }
                composable("edit-profile") {
                    val currentEntry by nav.currentBackStackEntryAsState()
                    val profileEntry = remember(currentEntry) { nav.getBackStackEntry("profile") }
                    val profileViewModel: ProfileViewModel = androidx.hilt.navigation.compose.hiltViewModel(profileEntry)
                    EditProfileScreen(onBack = { nav.popBackStack() }, viewModel = profileViewModel)
                }
                composable("admin") {
                    AdminCenterScreen(onBack = { nav.popBackStack() })
                }
                composable("exploration") {
                    ExplorationCenterScreen(
                        onBack = { nav.popBackStack() },
                        onTasks = { nav.navigate("exploration/tasks") },
                        onRewards = { nav.navigate("exploration/rewards") },
                        onEvents = { nav.navigate("exploration/events") },
                        onCalendar = { nav.navigate("exploration/calendar") },
                        onCoExplore = { nav.navigate("exploration/co-explore?inviteCode=") },
                        onStoryChains = { nav.navigate("exploration/chains-graph") },
                    )
                }
                composable("exploration/tasks") {
                    ExplorationDailyTasksScreen(onBack = { nav.popBackStack() }, onCompleteMission = { missionKey ->
                        mainTabSwitchActive = true
                        navigateTopLevel(nav, if (missionKey == "flip_two") "home" else "discovery")
                    })
                }
                composable("exploration/rewards") {
                    ExplorationRewardsScreen(onBack = { nav.popBackStack() })
                }
                composable("exploration/events") {
                    ExplorationEventsScreen(onBack = { nav.popBackStack() })
                }
                composable("exploration/calendar") {
                    ExplorationCalendarScreen(
                        onBack = { nav.popBackStack() },
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared",
                        onPost = { record ->
                            val post = record.post
                            if (post != null) openPost(post)
                            else if (record.channel == "ai") openDestination(HeikaDestination.AiResource(record.clientId, record.postId))
                            else openDestination(HeikaDestination.CommunityPost(record.clientId, record.postId))
                        },
                    )
                }
                composable(
                    route = "exploration/co-explore?inviteCode={inviteCode}",
                    arguments = listOf(navArgument("inviteCode") { type = NavType.StringType; defaultValue = "" }),
                ) { entry ->
                    CoExploreScreen(
                        onBack = { nav.popBackStack() },
                        onLogin = { nav.navigate("account") },
                        inviteCode = entry.arguments?.getString("inviteCode")?.takeIf(String::isNotBlank),
                        onPost = openPost,
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared",
                    )
                }
                navigation(startDestination = "exploration/chains", route = "exploration/chains-graph") {
                    composable("exploration/chains") { entry ->
                        val graphEntry = remember(entry) { nav.getBackStackEntry("exploration/chains-graph") }
                        val chainsViewModel: ExplorationChainsViewModel = hiltViewModel(graphEntry)
                        StoryChainListScreen(
                            onBack = { nav.popBackStack() },
                            onOpen = { id -> nav.navigate("exploration/chains/$id") },
                            viewModel = chainsViewModel,
                        )
                    }
                    composable(
                        route = "exploration/chains/{chainId}",
                        arguments = listOf(navArgument("chainId") { type = NavType.StringType }),
                    ) { entry ->
                        val graphEntry = remember(entry) { nav.getBackStackEntry("exploration/chains-graph") }
                        val chainsViewModel: ExplorationChainsViewModel = hiltViewModel(graphEntry)
                        StoryChainDetailScreen(
                            chainId = entry.arguments?.getString("chainId").orEmpty(),
                            onBack = { nav.popBackStack() },
                            onSeedPost = { id -> openDestination(HeikaDestination.CommunityPost(0, id)) },
                            viewModel = chainsViewModel,
                        )
                    }
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
            }
            if (showBottomBar) {
                GlassNavigationBar(
                    selected = selected,
                    hazeState = hazeState,
                    onSelect = { target ->
                        mainTabSwitchActive = true
                        navigateTopLevel(nav, target)
                    },
                    onPublish = { openDestination(HeikaDestination.Publish) },
                    modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 8.dp),
                    blurEnabled = !homePreviewActive,
                )
            }
            ForegroundNoticeHost(
                modifier = Modifier.align(Alignment.TopCenter).padding(horizontal = 14.dp, vertical = 8.dp),
                hazeState = hazeState,
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
}

private const val postDetailRoute = "post/{postKey}"
private val sharedCardSourceRoutes = setOf("home", "discovery", "profile", "user/{userId}", "search", "exploration/calendar", "exploration/co-explore?inviteCode={inviteCode}")

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
