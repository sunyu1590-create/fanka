plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
}

// Signing material comes from the environment so nothing secret is committed.
val storeFilePath: String? = System.getenv("HEIKA_KEYSTORE_PATH")
val storePasswordValue: String? = System.getenv("HEIKA_KEYSTORE_PASSWORD")
val keyAliasValue: String? = System.getenv("HEIKA_KEY_ALIAS")
val keyPasswordValue: String? = System.getenv("HEIKA_KEY_PASSWORD")
val hasSigning = !storeFilePath.isNullOrBlank() &&
    !storePasswordValue.isNullOrBlank() &&
    !keyAliasValue.isNullOrBlank() &&
    !keyPasswordValue.isNullOrBlank() &&
    file(storeFilePath).exists()

android {
    namespace = "com.heika.nativeapp"
    compileSdk = 35

    defaultConfig {
        // Retained for upgrade compatibility with known #68 and PR #10 builds.
        applicationId = "com.heika.community"
        minSdk = 26
        targetSdk = 35
        // 版本号保持不变，仅递增 build code，保证能在 98 之上直接覆盖安装。
        versionCode = 103
        versionName = "2.34.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", "\"https://moonclean.shop\"")
        buildConfigField("String", "GITHUB_URL", "\"https://github.com/sunyu1590-create/fanka\"")
    }

    signingConfigs {
        if (hasSigning) {
            create("release") {
                storeFile = file(storeFilePath!!)
                storePassword = storePasswordValue
                keyAlias = keyAliasValue
                keyPassword = keyPasswordValue
            }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    packaging {
        resources.excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1")
    }

    buildTypes {
        debug { }
        release {
            // R8 is disabled for this adaptation build: the auth layer changed and
            // there is no device in the loop to catch shrinker-induced failures.
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (hasSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
    testOptions { unitTests.isIncludeAndroidResources = true }
}

ksp { arg("room.schemaLocation", "$projectDir/schemas") }

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.05.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
    implementation("androidx.navigation:navigation-compose:2.9.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
    implementation("dev.chrisbanes.haze:haze:1.6.10")

    implementation("com.google.dagger:hilt-android:2.56.2")
    ksp("com.google.dagger:hilt-compiler:2.56.2")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    implementation("androidx.room:room-runtime:2.7.1")
    implementation("androidx.room:room-ktx:2.7.1")
    ksp("androidx.room:room-compiler:2.7.1")
    implementation("androidx.paging:paging-runtime-ktx:3.3.6")
    implementation("androidx.paging:paging-compose:3.3.6")
    implementation("androidx.datastore:datastore-preferences:1.1.7")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    implementation("androidx.work:work-runtime-ktx:2.10.1")

    // 首页推荐位的视频播放：只做静音自动播放与静音切换，不用默认控制栏。
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    // 轮播视频磁盘缓存：SimpleCache 需要 datasource 与 database 两个模块。
    implementation("androidx.media3:media3-datasource:1.4.1")
    implementation("androidx.media3:media3-database:1.4.1")

    implementation("io.coil-kt.coil3:coil-compose:3.2.0")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.2.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
