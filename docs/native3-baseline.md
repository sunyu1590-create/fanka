# HEIKA Native 3.0 / 3.1 基线记录

> 状态核验日期：2026-11-10。每次开发前重新核验远端分支及 Actions；记录中的 SHA 仅表示当时验证的源码，不是永久基线。

## 唯一本地工程与当前有效源码

- 目录：`/workspace/heika-native3-followup`
- 仓库：`sunyu1590-create/fanka`
- 开发分支：`codex/native3-full-native`
- 本轮最新 Android 源码提交：`ebdf64efc55f28afe6895ed4c43f006412c8b246` (`fix: update profile feed card click call`)
- 上一项功能提交：`8f2adb06bb09af2a1279c4712f8e61f54dcd51ac` (`feat: refine HEIKA content discovery and search`)
- 网站功能参考版本：2.40.7
- Android：`applicationId=com.heika.community`、`versionName=2.3.6`、`versionCode=14`
- 最近成功构建后仅有本文件可能产生文档记录提交；它不改变 APK 源码。以 Actions Run 的 `head_sha` 为实际 APK 源码版本。

## 最近成功的 GitHub Android 构建

- Workflow：**HEIKA Native 3.0 Android**，push Run **#33**，ID `42755322468`
- 源码提交：`ebdf64efc55f28afe6895ed4c43f006412c8b246`；分支：`codex/native3-full-native`
- 状态：成功；单元测试、Android lint、Debug APK 与 unsigned Release APK 步骤均成功。
- Run：https://github.com/sunyu1590-create/fanka/actions/runs/42755322468
- Artifact：`HEIKA-Native-3-vebdf64efc55f28afe6895ed4c43f006412c8b246`；ID `13734869594`；约 21.7 MB；SHA-256 `1184b2bae2ea965c56e8f21f6038ce49a4d496d86dad648b2dc5a6bd85d6972d`；保留至 2026-11-24。
- Artifact 页面：https://github.com/sunyu1590-create/fanka/actions/runs/42755322468/artifacts/13734869594
- Workflow 根据 Gradle 配置生成 `HEIKA-2.3.6-14-debug.apk` 和 `HEIKA-2.3.6-14-release-unsigned.apk`。Debug 可安装；unsigned Release 仅供检查，不是正式发布包。
- #31 曾因 `ProfileScreen.kt` 使用过期 `FeedCard` 调用方式而在 Kotlin 编译失败。该调用已修复并包含在 `ebdf64e`，#33 全流程通过。未使用本地 Android 构建。

## 本轮验证范围

- Web：`npm run typecheck` 通过；`npm test` 通过（47/47）；定向 ESLint 0 error、22 warnings。
- Android：GitHub Actions #33 中 `testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleRelease` 均成功。
- 本轮没有运行本地 Gradle 构建，也没有 Android 模拟器或真机验证。
- `ProfileScreen.kt` 的兼容调用修复发生在 #31 的失败之后；相关 Web 文件在前一功能提交中已完成 typecheck、测试和 lint。

## 历史记录

- 2026-11-10 之前的成功构建包括 Run #28（ID `42750160378`，源码 `7f521a8148170b619b20d7bb419d28e6e4c8546c`）及更早的 #26/#27。它们已被 Run #33 取代为最近成功构建。
- Native 3.1 个人中心与设置改造提交：`8c70cea83b3bcf8ac8a08933bd4c1d651acafbb6`。
- 基线整合前，本地修改曾通过 `stash@{0}` 保留；该恢复快照在确认不再需要前不要删除。

## 后续任务要求

开发前重新检查工作目录、Git 状态、远端 HEAD、最新成功 Actions Run 和 APK 版本；比较远端源码与工作区，再在包含全部有效成果的最新基线上增量修改。构建失败时修复当前代码，不回退旧底包。未经授权不强推或合并生产分支。
