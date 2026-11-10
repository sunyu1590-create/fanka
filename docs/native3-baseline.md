# HEIKA Native 3.0 / 3.1 基线记录

> 状态核验日期：2026-11-10。每次开发前重新核验远端分支及 Actions；以下 SHA 是本次核验结果，不是永久基线。

## 唯一本地工程与当前有效源码

- 目录：`/workspace/heika-native3-followup`
- 仓库：`sunyu1590-create/fanka`
- 阶段 A 开发分支：`codex/stage-a-flip-publish-20261110`，对应 PR #14，基线 `codex/native3-full-native@e78d91aea04595ff1e2c60d2a8b47d3da6589433`
- 本轮源码提交：`6c6ae3e5cdda72cd3592fda673ed461aafb1b4d2` (`fix(publish): keep editor open when local snapshot fails`)
- 本地检查时 checkout 仍为 `codex/native3-full-native@e78d91a`；当前修改与 PR #14 分支内容逐文件比对后纳入本轮源码。
- 网站功能参考版本：2.40.7
- Android：`applicationId=com.heika.community`、`versionName=2.3.6`、`versionCode=14`

## 最近成功的 GitHub Android 构建

- Workflow：**HEIKA Native 3.0 Android**，PR Run **#41**，ID `42768954983`；状态成功，完成于 `2026-11-10 06:35 UTC`。
- PR 源码头：`6c6ae3e5cdda72cd3592fda673ed461aafb1b4d2`。PR 工作流以 GitHub 合并校验提交 `8c6def940f7703a6f01c200cc4349788f3a339f1` 构建，该提交包含上述 PR 源码和目标分支 `e78d91a`。
- 检查：`testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleRelease` 全部成功。
- Run：https://github.com/sunyu1590-create/fanka/actions/runs/42768954983
- Artifact：`HEIKA-Native-3-v8c6def940f7703a6f01c200cc4349788f3a339f1`；ID `13740604637`；22,785,897 bytes；Artifact ZIP SHA-256 `7434db8a5453b935cd528050635440500eb482b0a36328f474178961e5988b7d`；保留至 `2026-11-24 06:35 UTC`。
- Artifact 页面：https://github.com/sunyu1590-create/fanka/actions/runs/42768954983/artifacts/13740604637
- Workflow 依据 Gradle 配置生成 `HEIKA-2.3.6-14-debug.apk` 与 `HEIKA-2.3.6-14-release-unsigned.apk`。Debug APK 可安装；未签名 Release APK 仅供检查，不是正式发布包。
- 对精确 PR 分支提交触发的 push Run #40（ID `42768947213`）仍在 APK 打包中；#41 已成功构建与同一 PR HEAD 对应的合并校验树。

## 阶段 A 变更与验证

- 翻卡：登录用户走 `get_daily_flip_state()` / `confirm_daily_flip()` 权威状态和按账号/本地日/卡片请求键幂等事务；游客继续使用公开 demo 卡片流程。服务端规则复用现有每日额度与奖励概率，客户端不再直接写 `opened_at`。
- 发布：媒体上传复用 `upload_id`；单图进度/失败重试、排序与封面、待清理媒体重试和按账号隔离的 Room 快照/图片副本已接入。草稿、审核中修订、已发布修订分别处理。
- Web：`npm test` 50/50 通过，`npm run typecheck` 通过，`npm run build` 通过（有既有 lint 警告）；`git diff --check` 通过。
- Android：上述 Run #41 的单测、Lint、Debug 与 unsigned Release 构建通过。未执行本地 Gradle 构建（此前 Gradle 下载域名 DNS 不可用），未进行 Android 真机或模拟器端到端测试。
- 未使用真实线上账号执行翻卡、两设备并发、图片上传、审核或强制结束进程测试；这些仍需线上/设备验收。

## 部署依赖与风险

- Supabase 权威翻卡迁移已应用于项目 `sauknappipwkxloaovms`。网站 API/翻卡适配位于 PR #15，目标 `publish-vercel`，目前仍未合并或部署：https://github.com/sunyu1590-create/fanka/pull/15
- 生产网站代码部署前，不能宣称网页与 Android 的线上翻卡闭环已共同生效。由于迁移收紧了客户端对 `opened_at` 的直接写入，网站 API 部署需与迁移保持协调。
- 阶段 A Native 变更位于 PR #14，目前待审核/合入；本次未将任一 PR 合并到生产或主分支。

## 历史记录

- 前一成功构建：Run #33（ID `42755322468`，源码 `ebdf64efc55f28afe6895ed4c43f006412c8b246`），已被本次 Run #41 取代。
- Native 3.1 个人中心与设置改造提交：`8c70cea83b3bcf8ac8a08933bd4c1d651acafbb6`。
- 基线整合前的 `stash@{0}` 恢复快照在确认不再需要前不要删除。

## 后续任务要求

开发前重新检查工作目录、Git 状态、远端 HEAD、最新成功 Actions Run 和 APK 版本；比较远端源码与工作区，再在包含全部有效成果的最新基线上增量修改。构建失败时修复当前代码，不回退旧底包。未经授权不强推或合并生产分支.
