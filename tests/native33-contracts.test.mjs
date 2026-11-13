import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("privacy API scopes all records to the authenticated caller and uses only caller JWT RLS", async () => {
  const route = await read("app/api/v1/me/privacy/route.ts");
  assert.match(route, /context\(req\)/);
  assert.match(route, /eq\("owner_id", user!\.id\)/);
  assert.match(route, /eq\("user_id", user!\.id\)/);
  assert.match(route, /eq\("id", user!\.id\)/);
  assert.doesNotMatch(route, /adminClient|service_role|SUPABASE_SERVICE_ROLE/);
});

test("native detail actions keep post and comment UUIDs separate from numeric interaction IDs", async () => {
  const repository = await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");
  const detail = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/detail/PostDetailViewModel.kt");
  assert.match(repository, /put\("comment_id", commentId\)/);
  assert.match(repository, /put\("post_id", postId\)/);
  assert.match(repository, /fun deleteComment\(commentId: String\)/);
  assert.match(detail, /repository\.muteRecommendationAuthor\(authorId\)/);
  assert.match(repository, /suspend fun muteRecommendationTopic\(topic: String\)/);
  assert.match(detail, /repository\.reportPost\("", reason, note, commentId\)/);
  assert.match(detail, /post\.id <= 0/);
  assert.match(repository, /suspend fun deletePost\(postId: String\)[\s\S]*?require\(isUuid\(postId\)\)[\s\S]*?\/api\/v1\/posts\/\$\{encode\(postId\)\}.*method = "DELETE"/);
  assert.match(detail, /post\.authorId != mutableState\.value\.currentUserId/);
});

test("detail shared image remains a shared element and content text has no staggered entry", async () => {
  const shared = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/HeikaSharedImage.kt");
  const detail = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/detail/PostDetailScreen.kt");
  assert.match(shared, /sharedElement\(/);
  assert.match(shared, /post-image-\$\{postKey\.lowercase\(\)\}/);
  assert.doesNotMatch(detail, /titleShown|authorShown|bodyShown/);
});

test("glass blur is sourced from discovery covers and app content while dialogs are open", async () => {
  const discovery = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/discovery/DiscoveryScreen.kt");
  const glass = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/HeikaGlass.kt");
  const dialog = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/HeikaAlertDialog.kt");
  const app = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/HeikaNativeApp.kt");
  assert.match(discovery, /val badgeHazeState = rememberHazeState\(\)/);
  assert.match(discovery, /\.hazeSource\(it\)/);
  assert.match(discovery, /FeedCard\(post,[\s\S]*?hazeState = hazeState/);
  assert.match(glass, /blurRadius = 16\.dp/);
  assert.match(glass, /fallbackTint = HazeTint\(surface\.copy\(alpha = if \(dark\) \.24f else \.30f\)\)/);
  assert.match(dialog, /LocalHeikaModalBackdropCount/);
  assert.match(dialog, /LocalContentColor provides MaterialTheme\.colorScheme\.onSurface/);
  assert.match(app, /RenderEffect\.createBlurEffect\(radiusPx, radiusPx, Shader\.TileMode\.CLAMP\)/);
  assert.match(app, /if \(modalBackdropCount\.intValue > 0\) 9\.dp/);
});

test("top-level tabs suppress shared images during crossfade and detail metadata stays left aligned", async () => {
  const app = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/HeikaNativeApp.kt");
  const detail = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/detail/PostDetailScreen.kt");
  assert.match(app, /sharedElementsEnabled = pageTransition == "shared" && !mainTabSwitchActive/);
  assert.match(detail, /centeredTitleSize = 18\.sp/);
  assert.match(detail, /horizontalArrangement = Arrangement\.spacedBy\(9\.dp\)\) \{\s*Text\(item\.tag/);
  assert.match(detail, /Row\(Modifier\.fillMaxWidth\(\)\.clickable\(enabled = item\.authorId != null\)[\s\S]*?horizontalArrangement = Arrangement\.spacedBy\(10\.dp\)\)/);
});

test("native admin center uses server protected feedback, audit, and moderation rule APIs", async () => {
  const repository = await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");
  const screen = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/settings/AdminCenterScreen.kt");
  assert.match(repository, /\/api\/v1\/admin\/user-feedback\?status=open/);
  assert.match(repository, /\/api\/v1\/admin\/audit\?/);
  assert.match(repository, /\/api\/v1\/admin\/moderation-rules/);
  assert.match(screen, /"user-feedback" to "用户反馈"/);
  assert.match(screen, /"keywords" to "关键词规则"/);
  assert.match(screen, /"audit" to "操作记录"/);
  assert.match(repository, /suspend fun adminCategories\(\)/);
  assert.match(repository, /suspend fun adminTopicEvents\(\)/);
  assert.match(repository, /suspend fun adminRecommendationSettings\(\)/);
  assert.match(repository, /suspend fun adminAiSettings\(\)/);
  assert.match(repository, /suspend fun setAdminUserRole\(id: String, role: String\)/);
  assert.match(repository, /suspend fun setAdminUserMembership\(id: String, tier: String\)/);
});

test("native post comments expose website-supported hot and newest sorting", async () => {
  const repository = await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");
  const detail = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/detail/PostDetailViewModel.kt");
  const route = await read("app/api/v1/posts/[id]/comments/route.ts");
  assert.match(repository, /suspend fun comments\(postId: String, page: Int = 1, sort: String = "new"\)/);
  assert.match(repository, /comments\?page=.*&limit=30&sort=\$safeSort/);
  assert.match(detail, /fun setCommentSort\(sort: String\)/);
  assert.match(detail, /repository\.comments\(post\.cloudId, next, sort\)/);
  assert.match(route, /searchParams\.get\("sort"\) === "hot" \? "hot" : "new"/);
  assert.match(route, /b\.likeCount - a\.likeCount/);
});

test("like and bookmark notifications use protected database triggers and existing notification rows", async () => {
  const migration = await read("supabase/migrations/20261113122521_likes_and_bookmarks_notifications.sql");
  assert.match(migration, /'moderation','like','bookmark'/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /old\.liked is true/);
  assert.match(migration, /v_owner <> v_actor/);
  assert.match(migration, /after insert or update of liked on public\.user_interactions/);
  assert.match(migration, /after insert on public\.bookmarks/);
  assert.match(migration, /insert into public\.app_notifications/);
});

test("exploration ad is admin controlled, disabled by default, and only links to published content", async () => {
  const migration = await read("supabase/migrations/20261113122526_exploration_ad_settings.sql");
  const adminRoute = await read("app/api/v1/admin/exploration-ad/route.ts");
  const adminPostsRoute = await read("app/api/v1/admin/exploration-ad/posts/route.ts");
  const publicRoute = await read("app/api/v1/exploration-ad/route.ts");
  const nativeAdmin = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/settings/AdminCenterScreen.kt");
  const nativeExploration = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/exploration/ExplorationScreens.kt");
  const webAdmin = await read("components/AdminModeration.tsx");
  assert.match(migration, /enabled boolean not null default false/);
  assert.match(migration, /public\.is_admin\(\)/);
  assert.match(migration, /p\.status = 'published'/);
  assert.match(adminRoute, /role\.data\?\.role !== "admin"/);
  assert.match(adminRoute, /status", "published"/);
  assert.match(adminRoute, /Number\.isSafeInteger\(Number\(postRef\)\)/);
  assert.match(adminPostsRoute, /role\.data\?\.role !== "admin"/);
  assert.match(adminPostsRoute, /\.eq\("status", "published"\)/);
  assert.match(adminPostsRoute, /\.eq\("channel", "community"\)/);
  assert.match(adminPostsRoute, /query\.length < 2 \|\| query\.length > 60/);
  assert.match(publicRoute, /context\(req, false\)/);
  assert.match(publicRoute, /if \(!data\?\.enabled \|\| !data\.post_id\) return null/);
  assert.match(nativeAdmin, /"exploration-ad" -> repository\.adminExplorationAd\(\)/);
  assert.match(nativeAdmin, /saveAdminExplorationAd\(payload\)/);
  assert.match(nativeAdmin, /searchExplorationAdPosts\(adPostSearch\)/);
  assert.match(await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt"), /adminExplorationAdPosts\(query: String\)/);
  assert.match(nativeExploration, /ExplorationAdRow\(ad\) \{ onPost\(ad\.post\) \}/);
  assert.match(webAdmin, /id: "exploration-ad"/);
  assert.match(webAdmin, /cloudRequest\("\/api\/v1\/admin\/exploration-ad"/);
  assert.match(webAdmin, /admin\/exploration-ad\/posts\?q=/);
  assert.match(webAdmin, /role === "admin"/);
});

test("native profile editor reads and saves all website profile attributes with privacy flags", async () => {
  const screen = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/profile/ProfileDetailScreens.kt");
  const profileScreen = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/profile/ProfileScreen.kt");
  const vm = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/profile/ProfileViewModel.kt");
  const repository = await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");
  const route = await read("app/api/v1/me/route.ts");
  for (const field of ["gender", "mbti", "birthday", "hobbies"]) {
    assert.match(screen, new RegExp(`\"${field}\"`));
    assert.match(vm, new RegExp(`\"${field}\"`));
    assert.match(route, new RegExp(`\"${field}\"`));
  }
  assert.match(screen, /viewModel\.updateProfile\(nickname, bio, details\)/);
  assert.match(repository, /put\("details", details\)/);
  assert.match(vm, /profileAttributes\(data\.optJSONArray\("profileDetails"\)\)/);
  assert.match(vm, /profileAttributes\(data\.optJSONArray\("details"\)\)/);
  assert.match(vm, /is_public/);
  assert.match(profileScreen, /attributes\.visibility\["gender"\]/);
  assert.match(profileScreen, /attributes\.visibility\["mbti"\]/);
});

test("unset native preferences default to system theme, crossfade, and bundled OPPO Sans", async () => {
  const preferences = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/NativePreferences.kt");
  const theme = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/HeikaTheme.kt");
  const activity = await read("native-android/app/src/main/java/com/heika/nativeapp/MainActivity.kt");
  assert.match(preferences, /themeKey\] \?: "system"/);
  assert.match(theme, /normalize\(choice: String\).*\?: "oppo_sans"/);
  assert.match(theme, /normalize\(value: String\).*\?: "crossfade"/);
  assert.match(activity, /collectAsState\(initial = "system"\)/);
  assert.match(activity, /collectAsState\(initial = "crossfade"\)/);
  assert.match(activity, /collectAsState\(initial = "oppo_sans"\)/);
});

test("publish image selection uploads to staging immediately and blocks submission until every image is uploaded", async () => {
  const vm = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/publish/PublishViewModel.kt");
  const repository = await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");
  assert.match(vm, /Upload the selected image immediately as an unlinked staging object/);
  assert.match(vm, /uploadJobs\[key\] = viewModelScope\.launch \{ uploadPendingImage\(key\) \}/);
  assert.match(vm, /activeUpload\?\.isActive == true\) activeUpload\.join\(\)/);
  assert.match(vm, /latest\.images\.any \{ it\.path == null \}.*图片上传未完成/s);
  assert.match(repository, /addFormDataPart\("staging", "1"\)/);
});

test("flip preview dims and Gaussian-blurs the backdrop, closes on outside tap, and has no close button", async () => {
  const home = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/home/HomeScreen.kt");
  const overlay = home.slice(home.indexOf("private fun FlipPreviewOverlay"), home.indexOf("private fun PreviewCardBack"));
  assert.match(overlay, /HazeStyle\([\s\S]*blurRadius = 32\.dp \* expand/);
  assert.match(overlay, /Color\.Black\.copy\(alpha = 0\.24f \* expand\)/);
  assert.match(overlay, /onClick = \{ requestDismiss\(\) \}/);
  assert.doesNotMatch(overlay, /contentDescription = "关闭预览"/);
});

test("native profile and about presentation retain icon whitespace and semantic navigation labels", async () => {
  const about = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/settings/AboutScreen.kt");
  const profile = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/profile/ProfileScreen.kt");
  const nav = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/HeikaComponents.kt");
  assert.match(about, /ContentScale\.Fit/);
  assert.match(about, /ReleaseSection\(version\.second, historyExpanded\)/);
  assert.match(about, /第三方许可与开源声明/);
  assert.match(about, /BuildConfig\.API_BASE_URL/);
  const membership = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/NativeActionScreens.kt");
  assert.match(membership, /membershipLoaded/);
  assert.match(membership, /memberPlans/);
  assert.match(membership, /会员方案仅供预览，暂未开放在线订阅/);
  assert.match(membership, /不会创建订单、发起支付或更改账号等级/);
  assert.match(profile, /Text\("LV\$\{state\.stats\.level\}"/);
  assert.doesNotMatch(profile, /Icon\(HeikaIcons\.Medal, null, tint = MaterialTheme\.colorScheme\.primary, modifier = Modifier\.size\(18\.dp\)\)/);
  assert.doesNotMatch(nav, /Text\(label, color = labelColor/);
  assert.match(nav, /NavigationGlyph\(key, if \(isSelected\).*?, label\)/);
});

test("Android launcher and About use the exact supplied HEIKA logo without raster transformation", async () => {
  const logo = await readFile(new URL("../native-android/app/src/main/res/drawable-nodpi/ic_heika_original.jpg", import.meta.url));
  const about = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/settings/AboutScreen.kt");
  const adaptiveIcon = await read("native-android/app/src/main/res/mipmap-anydpi-v26/ic_heika.xml");
  assert.equal(createHash("sha256").update(logo).digest("hex"), "b49393d80d283915f396c3d67832a754cc67e544a7700297d9428964abb2a83b");
  assert.match(about, /painterResource\(R\.drawable\.ic_heika_original\)[\s\S]*ContentScale\.Fit/);
  assert.match(adaptiveIcon, /foreground android:drawable="@drawable\/ic_heika_original"/);
});
