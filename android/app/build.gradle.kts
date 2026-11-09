import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val webUri = URI("https://moonclean.shop/")
val normalizedWebUrl = webUri.toString()

android {
    namespace = "com.heika.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.heika.community"
        minSdk = 26
        targetSdk = 35
        versionCode = 11
        versionName = "2.3.6"
        buildConfigField("String", "WEB_APP_URL", "\"$normalizedWebUrl\"")
        buildConfigField("String", "WEB_APP_ORIGIN", "\"${webUri.scheme}://${webUri.rawAuthority}\"")
        buildConfigField("String", "WEB_APP_HOSTS", "\"moonclean.shop,www.moonclean.shop,fanka-two.vercel.app\"")
        manifestPlaceholders["webHost"] = webUri.host
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-savedstate:2.8.7")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("com.github.bumptech.glide:glide:4.16.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    testImplementation("junit:junit:4.13.2")
}
