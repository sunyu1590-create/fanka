# HEIKA Native 3.0 / 3.1 基线记录

> 状态核验日期：2026-11-10。每次开发前重新核验 GitHub 分支和 Actions；本文件不将任何 SHA 永久视为最新。

## 唯一本地工程

- 目录：`/workspace/heika-native3-followup`
- 仓库：`sunyu1590-create/fanka`
- 分支：`codex/native3-full-native`
- 本轮 Android 代码提交：`8c70cea83b3bcf8ac8a08933bd4c1d651acafbb6`
- 本轮代码基于远端 Native 3.0 提交：`df3d8581859bd0f20ef3f8b1697d74b671b83f80`；随后已快进整合。
- 网站功能参考：2.40.7
- Android：`applicationId=com.heika.community`、`versionName=2.3.6`、`versionCode=14`

## 最近成功的远端构建

- Native Android push Run **#28**，ID `42750160378`，Commit `7f521a8148170b619b20d7bb419d28e6e4c8546c`，成功；PR Run **#29**（ID `42750167340`）也成功。
- Run #28 Artifact：`HEIKA-Native-3-v7f521a8148170b619b20d7bb419d28e6e4c8546c`，Artifact ID `13733561533`，21.6 MB，SHA-256 `7ef9d4ca69c00c571c4154236f67e47138d1c91ed405904a022acfbf8c8c00c4`。
- Native Android push Run **#26**，ID `42657627969`，Commit `df3d8581859bd0f20ef3f8b1697d74b671b83f80`。
- PR 验证 Run **#27**，ID `42657640472`，同一 Commit，成功。
- [Run #26](https://github.com/sunyu1590-create/fanka/actions/runs/42657627969)；[Run #27](https://github.com/sunyu1590-create/fanka/actions/runs/42657640472)。
- Run #26 Artifact：`HEIKA-Native-3-vdf3d8581859bd0f20ef3f8b1697d74b671b83f80`，含 `HEIKA-2.3.6-14-debug.apk` 和未签名 Release APK。未签名 Release 只供检查。
- Run #28 对应本轮 Native 3.1 源码；此后只应在有新的 Android 源码提交时再产生新的 APP 构建。

## 本轮本地验证产物

- APK：`native-android/app/build/outputs/apk/debug/app-debug.apk`
- APK 对应 Android 代码提交：`8c70cea83b3bcf8ac8a08933bd4c1d651acafbb6`
- SHA-256：`b646d2dd1ffef2cffff87b123a89588542f05bfebd02c64b39dc8985aee6afef`
- 包名 / 版本：`com.heika.community` / `2.3.6` / `versionCode 14`；本地 Debug APK，非商店签名发布包。
- `:app:testDebugUnitTest`：10 项通过；`:app:lintDebug`：通过，0 error、9 warnings；`:app:assembleDebug`：通过。
- 当前环境未连接 Android 模拟器或真机，因此未完成设备 UI 和端到端验证。

## 基线整合与恢复快照

- 本轮开始时本地 HEAD 为 `2df476d3f1bdf58ccace4c4acf2f3384ff35db26`，核验发现远端多 3 个 Native 3.0 提交。先用 `stash@{0}` 保存所有原有修改和未跟踪文件，再快进至 `df3d858...`，恢复本地成果并处理少量文件冲突；没有重置或丢弃源码。
- `stash@{0}` 是基线整合前的本地安全恢复快照，确认不再需要前不要删除。
- Native 3.1 个人中心与设置改造已提交为 `8c70cea...`；基线文档在后续文档提交中更新。代码提交和文档提交的差异应在 Git 日志中查看。

## 后续任务要求

开发前重新检查工作目录、Git 状态、远端 HEAD、最新成功 Actions Run 和 APK 版本；比较远端源码与工作区，再在包含全部有效成果的最新基线上增量修改。构建失败时修复当前代码，不回退旧底包。未经授权不强推或覆盖远端分支。
