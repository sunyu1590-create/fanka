# HEIKA Native 3.0 / 3.1 基线记录

> 状态核验日期：2026-11-10。每次开发前都要重新核验 GitHub 分支和 Actions，不把这里的 SHA 永久视为最新。

## 唯一本地工程

- 目录：`/workspace/heika-native3-followup`
- 仓库：`sunyu1590-create/fanka`
- 分支：`codex/native3-full-native`
- 当前基线：`df3d8581859bd0f20ef3f8b1697d74b671b83f80`（已与当时核验的远端开发分支快进同步）
- 网站功能参考：2.40.7
- Android：`applicationId=com.heika.community`、`versionName=2.3.6`、`versionCode=14`

## 最近成功的远端构建

- Native Android push Run **#26**，ID `42657627969`，Commit `df3d8581859bd0f20ef3f8b1697d74b671b83f80`。
- PR 验证 Run **#27**，ID `42657640472`，同一 Commit，成功。
- [Run #26](https://github.com/sunyu1590-create/fanka/actions/runs/42657627969)；[Run #27](https://github.com/sunyu1590-create/fanka/actions/runs/42657640472)。
- Run #26 Artifact：`HEIKA-Native-3-vdf3d8581859bd0f20ef3f8b1697d74b671b83f80`，含 `HEIKA-2.3.6-14-debug.apk` 和未签名 Release APK。未签名 Release 只供检查。

## 基线整合与本地进展

- 本轮开始时本地 HEAD 为 `2df476d3f1bdf58ccace4c4acf2f3384ff35db26`，核验发现远端有 3 个 Native 3.0 提交。改动前将完整工作区和未跟踪文件保存到本地恢复快照 `stash@{0}`，将分支快进到上述 `df3d858...`，再恢复并合并本地工作；没有重置或丢弃源码。
- 当前个人中心与设置的改动已整理为 21 个文件（17 个修改、4 个新增），并完成本地暂存，准备创建可追溯提交。安全快照仍保留。
- 当前 Android 源版本仍为 2.3.6 / code 14；本轮不更改发布版本号。
- 最近一次本地 Debug APK：`native-android/app/build/outputs/apk/debug/app-debug.apk`，SHA-256 `b646d2dd1ffef2cffff87b123a89588542f05bfebd02c64b39dc8985aee6afef`。该包在本地工作区构建，尚未由新的 GitHub Actions Run 构建；提交后应重新构建并更新此记录。

## 后续任务要求

开发前重新检查工作目录、Git 状态、远端 HEAD、最新成功 Actions Run 和 APK 版本；比较远端源码与工作区，再在包含全部有效成果的最新基线上增量修改。构建失败时修复当前代码，不回退旧底包。未经授权不强推或覆盖远端分支。
