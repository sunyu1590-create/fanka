# HEIKA Android 第一版构建

本仓库新增的 GitHub Actions workflow 为 `.github/workflows/android-apk.yml`。它会在 Android、Web Bridge 或应用代码变更的 push/PR 上运行，也可从 GitHub 的 **Actions → HEIKA Android APK → Run workflow** 手动启动。

构建成功后，在该次 workflow 页面下载 `heika-android-apk` artifact：

- `HEIKA-debug.apk`：由 Android debug key 自动签名，可直接安装用于测试。
- `HEIKA-release-unsigned.apk`：未签名 release 包，用于后续正式签名流程。

原有 Expo Android 实现和 `build-android-apk.yml` 已从远端 `android/phase-one`、`android/phase-two` 分支的当前树中移除；第一阶段统一使用本目录下的 Kotlin WebView 容器及新 workflow。

新包沿用旧客户端的 `applicationId` `com.heika.community`；当前版本为 `2.2.2`（`versionCode=8`）。GitHub debug APK 使用 Android debug key；如果现有安装由另一把发布密钥签名，Android 不允许直接覆盖安装。正式升级包需要使用原发布签名密钥；当前 workflow 的 unsigned release 包不能直接安装。

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
