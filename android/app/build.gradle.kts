import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val webUri = URI("https://moonclean.shop/")
val normalizedWebUrl = webUri.toString()

// Release signing comes from environment variables: no keystore or password is
// ever stored in the repository. Without them the release build stays unsigned.
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
    namespace = "com.heika.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.heika.community"
        minSdk = 26
        targetSdk = 35
        versionCode = 42
        versionName = "2.4.0"
        buildConfigField("String", "WEB_APP_URL", "\"$normalizedWebUrl\"")
        buildConfigField("String", "WEB_APP_ORIGIN", "\"${webUri.scheme}://${webUri.rawAuthority}\"")
        buildConfigField("String", "WEB_APP_HOSTS", "\"moonclean.shop,www.moonclean.shop\"")
        manifestPlaceholders["webHost"] = webUri.host
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

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            isShrinkResources = false
            if (hasSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
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
