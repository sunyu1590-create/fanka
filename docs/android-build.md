# HEIKA Android 第一版构建

本仓库新增的 GitHub Actions workflow 为 `.github/workflows/android-apk.yml`。它会在 Android、Web Bridge 或应用代码变更的 push/PR 上运行，也可从 GitHub 的 **Actions → HEIKA Android APK → Run workflow** 手动启动。

构建成功后，在该次 workflow 页面下载 `heika-android-apk` artifact：

- `HEIKA-debug.apk`：由 Android debug key 自动签名，可直接安装用于测试。
- `HEIKA-release-unsigned.apk`：未签名 release 包，用于后续正式签名流程。

原有 Expo Android 实现和 `build-android-apk.yml` 已从远端 `android/phase-one`、`android/phase-two` 分支的当前树中移除；第一阶段统一使用本目录下的 Kotlin WebView 容器及新 workflow。

新包沿用旧客户端的 `applicationId` `com.heika.community`；当前版本为 `2.21.0`（`versionCode=81`），以 `android-native/app/build.gradle.kts` 为准。

GitHub workflow 只产出 debug 与 unsigned release 两种 artifact：debug 用 CI debug key 签名，仅作预览；unsigned release 不能安装，也不是升级包。正式分发以服务器构建为准。

## 生产发布流程

在服务器 `/home/ubuntu/fanka` 执行：

```bash
NOTES="第一条|第二条" bash scripts/build-native.sh
```

脚本依次完成：`git pull --ff-only` → 全量编译 release（签名材料取自 `/home/ubuntu/.heika-keys/keystore.env`，权限 600，不进仓库）→ `apksigner` 校验 → 核对每个 `@HiltViewModel` 都生成了模块 → 发布到 `/home/ubuntu/downloads` 并切换 `heika-native-latest.apk` 软链 → 更新 `manifest.json`（供下载页与 `/api/v1/app-version` 读取）→ 清理旧包。

发版必须同时改两处版本号，否则测试会拦住：

1. `android-native/app/build.gradle.kts` 的 `versionCode` / `versionName`；
2. `AboutScreen.kt` 的 `nativeReleases` 首条 `NativeRelease(code, date, notes)`。

`tests/android-native-capabilities.test.mjs` 会断言二者一致，CI 的 web 校验阶段即会失败。

已安装旧版的用户靠 `versionCode` 判断升级：`/api/v1/app-version` 返回的 `code` 大于本地 `BuildConfig.VERSION_CODE` 才会提示更新。因此 `versionCode` 必须单调递增，且新包必须用同一把发布密钥签名（`CN=HEIKA`），否则 Android 拒绝覆盖安装。

默认入口为 `https://moonclean.shop/`。如需使用其他部署地址，在仓库的 **Settings → Secrets and variables → Actions → Variables** 设置 `HEIKA_WEB_URL`，值必须为可信 HTTPS 根地址；不要包含路径、查询参数或 fragment。构建会以此地址生成精确的 WebView Bridge 来源规则和 HTTPS Deep Link host。

## 本地构建

需要 JDK 17、Gradle 8.11.1、Android SDK Platform 35 和 Build Tools 35.0.0：

```bash
gradle --no-daemon -p android :app:assembleDebug
```

自定义 Web 地址：

```bash
gradle --no-daemon -p android -PheikaWebUrl=https://moonclean.shop/ :app:assembleDebug
```

APK 位于 `android/app/build/outputs/apk/`。

## 当前发布边界

GitHub workflow 仅构建并保留 APK artifact，不上传应用商店，也不创建发布签名。正式分发需要项目所有者配置签名密钥和发布审批。旧构建代码仍可从清理提交之前的 Git 历史恢复；当前分支树只保留新混合容器构建流程。
