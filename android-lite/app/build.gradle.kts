import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 正式站点与来源白名单：只允许这一组可信 HTTPS 来源调用敏感 Bridge。
val webUri = URI("https://moonclean.shop/")
val normalizedWebUrl = webUri.toString()

// Lite 使用独立签名变量名，避免误用标准版签名导致升级串包。
val storeFilePath: String? = System.getenv("HEIKA_LITE_KEYSTORE_PATH")
val storePasswordValue: String? = System.getenv("HEIKA_LITE_KEYSTORE_PASSWORD")
val keyAliasValue: String? = System.getenv("HEIKA_LITE_KEY_ALIAS")
val keyPasswordValue: String? = System.getenv("HEIKA_LITE_KEY_PASSWORD")
val hasSigning = !storeFilePath.isNullOrBlank() &&
    !storePasswordValue.isNullOrBlank() &&
    !keyAliasValue.isNullOrBlank() &&
    !keyPasswordValue.isNullOrBlank() &&
    file(storeFilePath).exists()

android {
    namespace = "com.heika.lite"
    compileSdk = 35

    defaultConfig {
        // 与标准版 com.heika.community 不同，可同时安装
        applicationId = "com.heika.community.lite"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        resourceConfigurations += listOf("zh", "en")
        buildConfigField("String", "WEB_APP_URL", "\"$normalizedWebUrl\"")
        buildConfigField("String", "WEB_APP_ORIGIN", "\"${webUri.scheme}://${webUri.rawAuthority}\"")
        buildConfigField("String", "WEB_APP_HOSTS", "\"moonclean.shop,www.moonclean.shop\"")
        buildConfigField("String", "BRIDGE_PROTOCOL_VERSION_TEXT", "\"2\"")
        buildConfigField("String", "VERSION_CODE_TEXT", "\"1\"")
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

    packaging {
        resources.excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1", "META-INF/*.kotlin_module")
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
        }
        release {
            // 轻量客户端核心目标之一是体积，正式包开启 R8 与资源压缩。
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (hasSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    // 只保留主流 ABI：WebView 走系统内核，无需打包任何原生库。
    splits { abi { isEnable = false } }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
