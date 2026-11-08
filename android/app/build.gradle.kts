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
        versionCode = 8
        versionName = "2.2.2"
        buildConfigField("String", "WEB_APP_URL", "\"$normalizedWebUrl\"")
        buildConfigField("String", "WEB_APP_ORIGIN", "\"${webUri.scheme}://${webUri.rawAuthority}\"")
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
    implementation("androidx.webkit:webkit:1.14.0")
}
