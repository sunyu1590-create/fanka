# HEIKA Native 3.0 / 3.1 基线记录

> 状态核验日期：2026-11-10。每次开发前重新核验远端分支及 Actions；以下 SHA 是本次核验结果，不是永久基线。

## 唯一本地工程与当前有效源码

- 目录：`/workspace/heika-native3-followup`
- 仓库：`sunyu1590-create/fanka`
- 阶段 A 开发分支：`codex/stage-a-flip-publish-20261110`，对应 PR #14，基线 `codex/native3-full-native@e78d91aea04595ff1e2c60d2a8b47d3da6589433`
- 本轮 Native 源码提交：`6c6ae3e5cdda72cd3592fda673ed461aafb1b4d2` (`fix(publish): keep editor open when local snapshot fails`)；后续仅增加基线文档提交。
- 工作区已与本轮 PR 分支中的代码逐文件核对，保留现有 Native 3.0 功能和阶段 A 改动。
- 网站功能参考版本：2.40.7
- Android：`applicationId=com.heika.community`、`versionName=2.3.6`、`versionCode=14`

## 最近成功的 GitHub Android 构建

- Workflow：**HEIKA Native 3.0 Android**，push Run **#40**，ID `42768947213`；状态成功，完成于 `2026-11-10 06:38 UTC`。
- 构建分支：`codex/stage-a-flip-publish-20261110`；源码提交精确对应 `6c6ae3e5cdda72cd3592fda673ed461aafb1b4d2`。
- 检查：`testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleRelease`、产物准备和上传全部成功。
- Run：https://github.com/sunyu1590-create/fanka/actions/runs/42768947213
- Artifact：`HEIKA-Native-3-v6c6ae3e5cdda72cd3592fda673ed461aafb1b4d2`；ID `13741590867`；22,785,893 bytes；Artifact ZIP SHA-256 `460122376c6eb74f19649c0d90891d988fd1a64410c64275f530ce519b7cafb5`；保留至 `2026-11-24 06:38 UTC`。
- Artifact 页面：https://github.com/sunyu1590-create/fanka/actions/runs/42768947213/artifacts/13741590867
- Workflow 依据 Gradle 配置生成 `HEIKA-2.3.6-14-debug.apk` 与 `HEIKA-2.3.6-14-release-unsigned.apk`。Debug APK 可安装；未签名 Release APK 仅供检查，不是正式发布包。
- PR 校验 Run #41（ID `42768954983`）也成功；它使用 GitHub 合并校验提交 `8c6def940f7703a6f01c200cc4349788f3a339f1`，包含同一 PR 源码和基线 `e78d91a`。

## 阶段 A 变更与验证

- 翻卡：登录用户走 `get_daily_flip_state()` / `confirm_daily_flip()` 权威状态和按账号/本地日/卡片请求键幂等事务；游客继续使用公开 demo 卡片流程。服务端规则复用现有每日额度与奖励概率，客户端不再直接写 `opened_at`。
- 发布：媒体上传复用 `upload_id`；单图进度/失败重试、排序与封面、待清理媒体重试和按账号隔离的 Room 快照/图片副本已接入。草稿、审核中修订、已发布修订分别处理。
- Web：`npm test` 50/50 通过，`npm run typecheck` 通过，`npm run build` 通过（有既有 lint 警告）；`git diff --check` 通过。
- Android：Run #40 的单测、Lint、Debug 与 unsigned Release 构建通过。未执行本地 Gradle 构建（此前 Gradle 下载域名 DNS 不可用），未进行 Android 真机或模拟器端到端测试。
- 未使用真实线上账号执行翻卡、两设备并发、图片上传、审核或强制结束进程测试；这些仍需线上/设备验收。

## 部署依赖与风险

- Supabase 权威翻卡迁移已应用于项目 `sauknappipwkxloaovms`。网站 API/翻卡适配位于 PR #15，目标 `publish-vercel`，目前仍未合并或部署：https://github.com/sunyu1590-create/fanka/pull/15
- 生产网站代码部署前，不能宣称网页与 Android 的线上翻卡闭环已共同生效。由于迁移收紧了客户端对 `opened_at` 的直接写入，网站 API 部署需与迁移保持协调。
- 阶段 A Native 变更位于 PR #14，目前待审核/合入；本次未将任一 PR 合并到生产或主分支。

## 历史记录

- 前一成功构建：Run #33（ID `42755322468`，源码 `ebdf64efc55f28afe6895ed4c43f006412c8b246`），已被本次 Run #40 取代。
- Native 3.1 个人中心与设置改造提交：`8c70cea83b3bcf8ac8a08933bd4c1d651acafbb6`。
- 基线整合前的 `stash@{0}` 恢复快照在确认不再需要前不要删除。

## 阶段 A 部署与阶段 B 开发状态

- 阶段 A 网站 PR #15 已 squash 合入 `publish-vercel`，提交 `0dfe745c6805dfca55e221aa3d8fdc00e863377d`；Vercel 生产部署 `dpl_F2jxYpsPJsz6ThKf9178CkB8xs4T` 已 READY，别名包含 `moonclean.shop`。
- 阶段 B 从阶段 A 分支 `32c1e552ccefd05b8154a1c6c5b9fa0d3a85cb0c` 创建，分支 `codex/stage-b-messaging-20261110`。首个阶段 B 提交 `c4d2550` 加入前台生命周期同步、显式已读 API、稳定 nonce 重试及会话账号状态隔离；Android 版本递增至 `2.3.6` / versionCode `15`。
- 最新阶段 B Native Android Actions push Run #47（ID `42790617039`）成功，代码提交 `38f28da6d554111bc63c8cd4069c55f75ab4eda7`；单测、Lint、Debug 与 unsigned Release 构建、Artifact 上传均通过。Artifact ID `13752425014`，SHA-256 `a0f414cb3d3b667183ef5977e352ca369a64759726c0faf95f4c7aa4e752725b`，Artifact 页面：https://github.com/sunyu1590-create/fanka/actions/runs/42790617039/artifacts/13752425014
- APK：`HEIKA-2.3.6-15-debug.apk`、`HEIKA-2.3.6-15-release-unsigned.apk`。Android 真机、双账号和 Realtime/网络恢复验收未执行。Android 当前用前台有界轮询作为兼容方案，不是后台推送。

## 后续任务要求

开发前重新检查工作目录、Git 状态、远端 HEAD、最新成功 Actions Run 和 APK 版本；比较远端源码与工作区，再在包含全部有效成果的最新基线上增量修改。构建失败时修复当前代码，不回退旧底包。未经授权不强推或合并生产分支.

## 阶段 C AI 专区增量开发与构建

- 开发分支：`codex/stage-c-ai-20261110`，从阶段 B 最新有效提交 `e1082b9b7d1d35107093dd4570aa24bf28a67f97` 创建；阶段 A/B 代码均保留。
- 阶段 C 代码提交：`53c8cb4f61a045ce9b1b21f3e900c77afc5dec08`。
- Android 版本：`2.3.6` / versionCode `16`（在阶段 B 的 15 上递增）。
- 已接入网页现有 `/api/v1/ai-space`、`/api/v1/ai-space/{id}/versions`、`/api/v1/ai-space/{id}/feedback`：原生 AI 详情字段、系统剪贴板、校验后的 HTTPS 外链、版本历史/错误重试和资源反馈；AI 发布、草稿恢复和已发布修订复用阶段 A 图片/草稿机制。
- AI 搜索与筛选继续复用现有分页端点；社区与 AI 各自保存筛选状态。
- 新增 `AiResourceRulesTest` 覆盖六种资源类型、必填字段和外链校验。
- 最新阶段 C 分支文档提交：`fd316918bf242f254ee8613a23f8b27ea852ea66`；PR #17 仍开放、未合并，目标为阶段 B 分支。PR 详情显示可合并。
- Native workflow PR Run **#51**（ID `42794350914`）于 `2026-11-10 10:00 UTC` 成功；PR head 为 `fd316918bf242f254ee8613a23f8b27ea852ea66`，Actions 对 PR 合并校验源码执行构建。Run：https://github.com/sunyu1590-create/fanka/actions/runs/42794350914
- 测试、Lint、Debug APK、unsigned Release APK、产物准备及上传步骤全部成功。APK 配置：`applicationId=com.heika.community`、`versionName=2.3.6`、`versionCode=16`；产物名为 `HEIKA-2.3.6-16-debug.apk` 和 `HEIKA-2.3.6-16-release-unsigned.apk`。Release 包未签名，仅供检查；Debug APK 是可安装测试包。
- Artifact：`HEIKA-Native-3-v17271a39f77c35ebdd3008ddb5323096001be58a`，ID `13752359398`，22,862,134 bytes，ZIP SHA-256 `d07e0c134b68a43abf467b48476d003006db9c98bdac0c2a9a94654b66c377e2`，有效至 `2026-11-24 10:00 UTC`。下载页：https://github.com/sunyu1590-create/fanka/actions/runs/42794350914/artifacts/13752359398
- 本机 Gradle 测试/构建被 `services.gradle.org` DNS `UnknownHostException` 阻断；GitHub Actions 已在 Runner 完成对应测试和构建。未进行真机/模拟器、线上账号、AI 反馈提交及发布编辑审核端到端验证。
- PR #17 的 Actions 运行由 PR 校验事件触发，Artifact 名中的 SHA 是 GitHub PR 合并校验引用；其对应 PR head 是上述 `fd3169…`，目标基线是阶段 B `e1082b9…`。未合并 PR，也未发布 APK。
