package com.heika.nativeapp.ui

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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import com.heika.nativeapp.BuildConfig
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
import com.heika.nativeapp.feature.discovery.AiResourceCenterScreen
import com.heika.nativeapp.feature.discovery.AiResourceResultsScreen
import com.heika.nativeapp.feature.home.HomeScreen
import com.heika.nativeapp.feature.mall.MallScreen
import com.heika.nativeapp.feature.messages.MessagesScreen
import com.heika.nativeapp.feature.notifications.NotificationsScreen
import com.heika.nativeapp.feature.notifications.ForegroundNoticeHost
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaCollection
import com.heika.nativeapp.feature.collection.CollectionScreen
import com.heika.nativeapp.feature.profile.ProfileScreen
import com.heika.nativeapp.feature.web.NativeWebScreen
import com.heika.nativeapp.feature.web.WebContainerViewModel
import com.heika.nativeapp.ui.DecorViewModel
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
import com.heika.nativeapp.feature.MembershipRedeemScreen
import com.heika.nativeapp.feature.settings.AboutScreen
import com.heika.nativeapp.feature.settings.SettingsScreen
import com.heika.nativeapp.feature.settings.SettingsDetailScreen
import com.heika.nativeapp.feature.settings.AdminCenterScreen
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun HeikaNativeApp(imageLoader: ImageLoader, pageTransition: String = "shared") {
    CompositionLocalProvider(LocalHeikaImageLoader provides imageLoader) {
        val context = LocalContext.current
        val networkRegionNoticeViewModel: NetworkRegionNoticeViewModel = hiltViewModel()
        val networkRegionWarning by networkRegionNoticeViewModel.warning.collectAsState()
        val appUpdateViewModel: AppUpdateViewModel = hiltViewModel()
        val decorViewModel: DecorViewModel = hiltViewModel()
        val appUpdate by appUpdateViewModel.update.collectAsState()
        AnnouncementHost()
        val nav = rememberNavController()
        val hazeState = rememberHazeState()
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
        var networkNoticeCountdown by remember { mutableIntStateOf(2) }
        LaunchedEffect(networkRegionNoticeViewModel) { networkRegionNoticeViewModel.checkNetworkRegion() }
        LaunchedEffect(appUpdateViewModel) { appUpdateViewModel.checkForUpdate() }
        LaunchedEffect(networkRegionWarning) {
            if (networkRegionWarning != null) {
                networkNoticeCountdown = 2
                delay(1_000)
                networkNoticeCountdown = 1
                delay(1_000)
                networkNoticeCountdown = 0
            }
        }
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
        Box(
            Modifier.fillMaxSize()
                .background(androidx.compose.material3.MaterialTheme.colorScheme.background)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)),
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
                        if (initialState.destination.route.orEmpty() in aiResourceRoutes || targetState.destination.route.orEmpty() in aiResourceRoutes) {
                            fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard))
                        } else if (initialState.destination.route.orEmpty() in mainTabRoutes && targetState.destination.route.orEmpty() in mainTabRoutes) {
                            fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard))
                        } else if (pageTransition == "shared" && initialState.destination.route.orEmpty() in sharedCardSourceRoutes && targetState.destination.route == postDetailRoute) {
                            // 目标页背景先落位，剩下的连续感交给共享元素；快速淡入避免和飞行抢注意力。
                            fadeIn(tween(HeikaMotion.quick, easing = HeikaMotion.standard))
                        } else when (pageTransition) {
                            "crossfade" -> fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard))
                            "shared" -> fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard))
                            else -> fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard)) +
                                slideInVertically(tween(HeikaMotion.transition, easing = HeikaMotion.standard)) { it / 36 }
                        }
                    },
                    exitTransition = {
                        if (initialState.destination.route.orEmpty() in aiResourceRoutes || targetState.destination.route.orEmpty() in aiResourceRoutes) {
                            fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                        } else if (initialState.destination.route.orEmpty() in mainTabRoutes && targetState.destination.route.orEmpty() in mainTabRoutes) {
                            fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                        } else if (pageTransition == "shared" && initialState.destination.route.orEmpty() in sharedCardSourceRoutes && targetState.destination.route == postDetailRoute) {
                            // 源页只做淡出，连"轻微后退"的缩放也去掉：连贯感交给共享元素，
                            // 背景层任何位移都会和飞行的封面打架，看起来像两套动画。
                            fadeOut(tween(HeikaMotion.spatial, easing = HeikaMotion.standard))
                        } else when (pageTransition) {
                            "crossfade" -> fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                            "shared" -> fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                            else -> fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard)) +
                                slideOutVertically(tween(HeikaMotion.control, easing = HeikaMotion.standard)) { -it / 48 }
                        }
                    },
                    popEnterTransition = {
                        if (initialState.destination.route.orEmpty() in aiResourceRoutes || targetState.destination.route.orEmpty() in aiResourceRoutes) {
                            fadeIn(tween(HeikaMotion.transition, easing = HeikaMotion.standard))
                        } else if (initialState.destination.route.orEmpty() in mainTabRoutes && targetState.destination.route.orEmpty() in mainTabRoutes) {
                            fadeIn(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                        } else if (pageTransition == "shared" && initialState.destination.route == postDetailRoute && targetState.destination.route.orEmpty() in sharedCardSourceRoutes) {
                            fadeIn(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                        } else when (pageTransition) {
                            "crossfade" -> fadeIn(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                            "shared" -> fadeIn(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                            else -> fadeIn(tween(HeikaMotion.control, easing = HeikaMotion.standard)) +
                                slideInVertically(tween(HeikaMotion.control, easing = HeikaMotion.standard)) { -it / 48 }
                        }
                    },
                    popExitTransition = {
                        if (initialState.destination.route.orEmpty() in aiResourceRoutes || targetState.destination.route.orEmpty() in aiResourceRoutes) {
                            fadeOut(tween(HeikaMotion.control, easing = HeikaMotion.standard))
                        } else if (initialState.destination.route.orEmpty() in mainTabRoutes && targetState.destination.route.orEmpty() in mainTabRoutes) {
                            fadeOut(tween(HeikaMotion.quick, easing = HeikaMotion.standard))
                        } else if (pageTransition == "shared" && initialState.destination.route == postDetailRoute && targetState.destination.route.orEmpty() in sharedCardSourceRoutes) {
                            fadeOut(tween(HeikaMotion.quick, easing = HeikaMotion.standard))
                        } else when (pageTransition) {
                            "crossfade" -> fadeOut(tween(HeikaMotion.quick, easing = HeikaMotion.standard))
                            "shared" -> fadeOut(tween(HeikaMotion.quick, easing = HeikaMotion.standard))
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
                        onAiResources = { nav.navigate("ai-resources") },
                        onOpenMall = { nav.navigate("mall") },
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
                        hazeState = hazeState,
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
                        onCollection = { id -> nav.navigate("collection/${Uri.encode(id)}") },
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared" && !mainTabSwitchActive,
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
                composable("mall") {
                    MallScreen(onBack = { nav.popBackStack() })
                }
                composable("ai-resources") {
                    AiResourceCenterScreen(
                        onBack = { nav.popBackStack() },
                        onSearch = { nav.navigate("ai-resources/search") },
                        onSelectType = { type -> nav.navigate("ai-resources/type/$type") },
                    )
                }
                composable(
                    route = "ai-resources/type/{type}",
                    arguments = listOf(navArgument("type") { type = NavType.StringType }),
                ) { entry ->
                    val type = entry.arguments?.getString("type")
                    AiResourceResultsScreen(
                        initialType = type,
                        isSearch = false,
                        onBack = { nav.popBackStack() },
                        onSearch = { nav.navigate("ai-resources/search?type=${type.orEmpty()}") },
                        onPost = openPost,
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared",
                    )
                }
                composable(
                    route = "ai-resources/search?type={type}",
                    arguments = listOf(navArgument("type") { type = NavType.StringType; defaultValue = "" }),
                ) { entry ->
                    AiResourceResultsScreen(
                        initialType = entry.arguments?.getString("type")?.takeIf(String::isNotBlank),
                        isSearch = true,
                        onBack = { nav.popBackStack() },
                        onSearch = {},
                        onPost = openPost,
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared",
                    )
                }
                composable(
                    route = postDetailRoute,
                    arguments = listOf(navArgument("postKey") { type = NavType.StringType }),
                ) { entry ->
                    val postKey = entry.arguments?.getString("postKey")
                    PostDetailScreen(
                        post = postKey?.let(sharedPosts::get),
                        postKey = postKey,
                        onBack = { nav.popBackStack() },
                        onAuthor = { id -> openDestination(HeikaDestination.UserProfile(id)) },
                        onLogin = { nav.navigate("account") },
                        onShare = { post -> shareNativePost(context, post) },
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared",
                        onOpenCollection = { id -> nav.navigate("collection/${Uri.encode(id)}") },
                        onOpenChapter = { key -> nav.navigate("post/${Uri.encode(key)}") },
                    )
                }
                composable(
                    route = "collection/{seriesId}",
                    arguments = listOf(navArgument("seriesId") { type = NavType.StringType }),
                ) { entry ->
                    CollectionScreen(
                        seriesId = entry.arguments?.getString("seriesId"),
                        onBack = { nav.popBackStack() },
                        onOpenChapter = { chapter -> nav.navigate("post/${Uri.encode(chapter.id)}") },
                        onAuthor = { id -> openDestination(HeikaDestination.UserProfile(id)) },
                        onShare = { collection -> shareNativeCollection(context, collection) },
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
                        onCollection = { id -> nav.navigate("collection/${Uri.encode(id)}") },
                        sharedTransitionScope = sharedTransitionScope,
                        animatedVisibilityScope = this,
                        sharedElementsEnabled = pageTransition == "shared",
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
                    MembershipScreen(onBack = { nav.popBackStack() }, onLogin = { nav.navigate("account") }, onAbout = { openDestination(HeikaDestination.About) }, onRedeem = { nav.navigate("membership-redeem") })
                }
                composable("membership-redeem") {
                    MembershipRedeemScreen(onBack = { nav.popBackStack() }, onLogin = { nav.navigate("account") })
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
                        onSection = { section ->
                            when (section) {
                                "about" -> nav.navigate("about")
                                "admin" -> nav.navigate("admin")
                                // 装扮与工坊走网页容器：网页端编辑，原生读取同一份账号设置。
                                "decor-bar", "decor-card", "decor-gallery" -> nav.navigate("web/$section")
                                else -> nav.navigate("settings/$section")
                            }
                        },
                    )
                }
                composable(
                    route = "web/{feature}",
                    arguments = listOf(navArgument("feature") { type = NavType.StringType }),
                ) { entry ->
                    val webViewModel: WebContainerViewModel = hiltViewModel()
                    val webSession by webViewModel.session.collectAsState()
                    val feature = entry.arguments?.getString("feature").orEmpty()
                    NativeWebScreen(
                        title = webTitle(feature),
                        path = webPath(feature),
                        sessionJson = webSession,
                        onBack = { nav.popBackStack() },
                        onEvent = { type, _ ->
                            when (type) {
                                // 网页完成装扮应用：native 侧立即失效缓存并重新拉取设置。
                                "decor-applied" -> { decorViewModel.invalidate(); decorViewModel.refresh() }
                                "close" -> nav.popBackStack()
                                "open-native" -> Unit
                            }
                        },
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
                    blurEnabled = true,
                    previewBackdropActive = homePreviewActive,
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
            if (networkRegionWarning != null) {
                HeikaAlertDialog(
                    onDismissRequest = {},
                    properties = DialogProperties(
                        dismissOnBackPress = false,
                        dismissOnClickOutside = false,
                        usePlatformDefaultWidth = true,
                    ),
                    title = { Text("网络环境提示") },
                    text = {
                        Text("检测到您当前的网络可能位于中国大陆。黑卡服务器位于新加坡，跨境连接可能不稳定，造成登录状态异常、内容加载失败或数据更新不同步。\n\n建议切换到能够稳定连接新加坡地区的网络后重新打开 App，访问速度通常会更快、更稳定。您也可以继续访问，但部分功能可能无法正常使用。")
                    },
                    confirmButton = {
                        TextButton(
                            enabled = networkNoticeCountdown == 0,
                            onClick = networkRegionNoticeViewModel::continueIntoApp,
                        ) {
                            Text(if (networkNoticeCountdown > 0) "继续访问（$networkNoticeCountdown）" else "继续访问")
                        }
                    },
                )
            }
            appUpdate?.let { update ->
                HeikaAlertDialog(
                    onDismissRequest = appUpdateViewModel::snooze,
                    title = { Text("发现新版本 ${update.version}") },
                    text = {
                        Text(buildString {
                            append("当前版本 ${BuildConfig.VERSION_NAME}，服务器已发布 ${update.version}。")
                            if (update.notes.isNotEmpty()) {
                                append("\n\n")
                                append(update.notes.joinToString("\n") { "· $it" })
                            }
                        })
                    },
                    confirmButton = {
                        TextButton(onClick = appUpdateViewModel::openDownloadPage) { Text("立即更新") }
                    },
                    dismissButton = {
                        TextButton(onClick = appUpdateViewModel::snooze) { Text("稍后") }
                    },
                )
            }
        }
    }
}

private const val postDetailRoute = "post/{postKey}"
private val aiResourceRoutes = setOf("ai-resources", "ai-resources/type/{type}", "ai-resources/search?type={type}")
private val sharedCardSourceRoutes = setOf("home", "discovery", "profile", "user/{userId}", "search", "ai-resources/type/{type}", "ai-resources/search?type={type}", "exploration/calendar", "exploration/co-explore?inviteCode={inviteCode}")

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
        val summary = post.aiSummary ?: post.body.replace(Regex("[#>*_`\\[\\]()]"), " ").replace(Regex("\\s+"), " ").trim().take(180)
        putExtra(Intent.EXTRA_TEXT, listOf(post.title, summary, "作者：${post.author}", url).filter(String::isNotBlank).joinToString("\n"))
    }
    runCatching { context.startActivity(Intent.createChooser(send, "分享内容")) }
}

private fun shareNativeCollection(context: android.content.Context, collection: HeikaCollection) {
    val url = "https://moonclean.shop/?series=${Uri.encode(collection.id)}"
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, collection.title)
        val summary = collection.description.take(180)
        putExtra(
            Intent.EXTRA_TEXT,
            listOf(collection.title, "${collection.kindLabel} · ${collection.statusLabel} · ${collection.publishedCount} 章", summary, "作者：${collection.creatorName}", url)
                .filter(String::isNotBlank)
                .joinToString("\n"),
        )
    }
    runCatching { context.startActivity(Intent.createChooser(send, "分享合集")) }
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

/** APP 内网页容器的目标页：只直达功能子页，不经过网页首页。 */
private fun webTitle(feature: String): String = when (feature) {
    "decor-bar" -> "底栏装扮"
    "decor-card" -> "卡片装扮"
    "decor-gallery" -> "创意工坊"
    else -> "黑卡"
}

private fun webPath(feature: String): String = when (feature) {
    "decor-bar" -> "/?app=1&decor=bar"
    "decor-card" -> "/?app=1&decor=card"
    "decor-gallery" -> "/?app=1&decor=gallery"
    else -> "/?app=1"
}
