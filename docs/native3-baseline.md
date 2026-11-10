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
- 阶段 C 的 PR Run #51（ID `42794350914`）曾成功；其后最新成功构建是 Native workflow PR Run **#52**（ID `42795847117`），完成于 `2026-11-10 10:03 UTC`，对应 PR #17 head `codex/stage-c-ai-20261110` / SHA `2d503eb76f4196af89eb812f753924acf3bdc782`。Run：https://github.com/sunyu1590-create/fanka/actions/runs/42795847117
- Run #52 的测试、Lint、Debug APK、unsigned Release APK、产物准备及上传步骤全部成功。APK 配置：`applicationId=com.heika.community`、`versionName=2.3.6`、`versionCode=16`；Release 包未签名，仅供检查；Debug APK 是可安装测试包。
- Artifact：`HEIKA-Native-3-v57ffab3af3e2565339e8beeb351e2ab975ba4657`，ID `13755145798`，22,862,133 bytes，ZIP SHA-256 `f8bdb8c909f3e5d54b826284bb0a3f80598e012e224b310e0e1bdcc77624cf90`，有效至 `2026-11-24 10:10 UTC`。下载页：https://github.com/sunyu1590-create/fanka/actions/runs/42795847117/artifacts/13755145798
- 本机 Gradle 测试/构建被 `services.gradle.org` DNS `UnknownHostException` 阻断；GitHub Actions 已在 Runner 完成对应测试和构建。未进行真机/模拟器、线上账号、AI 反馈提交及发布编辑审核端到端验证。
- PR #17 的 Actions 运行由 PR 校验事件触发，Artifact 名中的 SHA 是 GitHub PR 合并校验引用；其对应 PR head 是上述 `fd3169…`，目标基线是阶段 B `e1082b9…`。未合并 PR，也未发布 APK。

## 阶段 D 探索生态原生化

- 从阶段 C head `2d503eb76f4196af89eb812f753924acf3bdc782` 创建分支 `codex/stage-d-exploration-20261110`；阶段 A/B/C 成果均保留。PR #18 仍开放，目标为阶段 C 分支；未合并、未部署生产。
- 阶段 D 实现提交：`dd68daccd0a52f265f70638ff38a9a646046f4fc`；构建修复提交：`44e436d1cfa857665bbd7209e6a7598b8042bbc3`（改用可用 Material 图标）；进度计算与测试修复提交：`4203dfd91662762504e2e28de279d6f93572577b`。APK 对应的最后一个 Android 源码 SHA 为该提交。分支最新 HEAD `dbd27d5ac7450c3b5824c510197b3a5d28fb89b4` 仅新增本节交付记录，不改 Android/网站源码。
- Android 版本递增为 `2.3.6` / versionCode `17`。探索中心复用每日任务、成长 API；日历通过新增只读 `/api/v1/exploration-calendar` 读取账号时区下的翻卡记录；双人探索和故事接龙复用既有 API，服务端仍负责权限、保密揭晓、奖励和状态校验。
- Native 3.0 Actions Run #58（ID `42818911250`）对应 PR #18 head SHA `4203dfd91662762504e2e28de279d6f93572577b`，单测、Lint、Debug 与 unsigned Release APK 构建、产物上传均成功。Run：https://github.com/sunyu1590-create/fanka/actions/runs/42818911250
- APK：`HEIKA-2.3.6-17-debug.apk`、`HEIKA-2.3.6-17-release-unsigned.apk`；`applicationId=com.heika.community`。Release APK 未签名，仅供检查；Debug APK 为测试安装包。Artifact `HEIKA-Native-3-v42c428de3de9f21d206edc1e0d95a37ce025aea0`，ID `13765509856`，23,118,174 bytes，ZIP SHA-256 `4487b31d8ff27d7415808e7879004d5b113a3efeb94e8078c00351e6930442dd`，有效至 `2026-11-24 12:55 UTC`。下载：https://github.com/sunyu1590-create/fanka/actions/runs/42818911250/artifacts/13765509856
- 网站端 53 个 Node 测试、TypeScript、ESLint 与 Next 构建通过；Android Run #54 曾因不可用图标引用失败，Run #56 因进度断言与网页四舍五入规则不一致失败，Run #58 已验证修复。当前本机仍无法下载 Gradle 分发包（`services.gradle.org` DNS 不可解析）。
- 未进行真机、测试账号、跨设备奖励领取、双人探索/接龙线上 E2E。新增日历 API 尚在 PR #18，需部署后线上可用；此次未部署、未合并或发布 APK。

## HEIKA Native 3.2 第一阶段：全局 UI 与核心动效

- 开发目录仍为 `/workspace/heika-native3-followup`，从阶段 D 最新源码 `54e42440c06b7854097750078c2e460c6daee3d5` 增量开发；该 SHA 同时是阶段 D 分支 HEAD 和本轮前最新成功 APK 的源码。阶段 A、B、C、D 均在祖先提交中。
- 开发分支 `codex/native32-phase1`。UI 源码提交 `aa59899b4acbce02f535a6d686810e0c0521fdb3`；编译修正和导航动效提交 `16a022ebddf69a0136fad4d9c5ca823a2af1f7bd`。最终 APK 对应源码 SHA 为 `16a022ebddf69a0136fad4d9c5ca823a2af1f7bd`。
- Android 版本为 `2.3.6` / versionCode `19`（此前 versionCode `18`）。`applicationId=com.heika.community` 不变。
- 全局颜色、字阶、边距、圆角、Material 控件形状和动效时长统一在 `HeikaTheme` / `HeikaComponents`；页面返回栏统一为原生图标，保留既有玻璃底部导航。导航切换使用 280ms 轻位移叠化，返回使用 220ms 轻位移叠化。
- 首页翻卡保留原服务端额度、幂等确认和揭晓顺序；仅调整源卡到展开卡的位置/比例插值、圆角/阴影和 Haze 连续模糊，关闭时复用同一状态回到源位置。评分仍提交网页相同的 1–5 星服务端 API，采用网页对应星色和 58ms 阶梯反馈；评分均值、次数和成功动画只在服务端确认后更新。
- 内容详情主图 0dp 圆角；多图使用原生横向分页且 `ContentScale.Fit` 保留图片比例。详情排序调整为媒体、分类/状态、标题、作者/时间、正文、类型字段和互动。探索中心/日历/双人探索/故事接龙重新整理层级和状态，日历请求失败时用占位符代替未确认的 0；故事时间线新增条目具有位置过渡。设置按账号、偏好、其他分组，保留原入口和服务端开关状态。
- 消息列表和会话新增/插入动画；消息错误提供重试。AI 原生发现页默认切换为「最新」而非线上无精选资源的「推荐」，线上「最新」与「热门」各返回 2 项；选择「推荐」无结果时可直接进入最新内容。无假数据或本地评分算法。

### 网页动画对照与 Compose 实现

| 网页实现 | Compose 实现 |
| --- | --- |
| 翻卡读取起始卡片矩形，以 380ms `cubic-bezier(.22,.72,.18,1)` 扩展；背景模糊在 280ms 内渐进，关闭时反向，减少动态效果时立即落位。 | 使用起始矩形插值卡片平移与缩放，380ms 空间缓动；Haze 模糊、遮罩、阴影和圆角共享同一进度，收回时反向执行。翻开请求仍由服务端确认后才揭晓。 |
| 评分为 1–5 星，星间延迟 58ms，颜色和均值来自真实评分；网页先播动效再等待请求。 | 星色与星间延迟沿用网页，缩放克制；均值平滑变化，提交中禁止重复点击。为了保证状态真实，成功动效在服务端成功返回后播放，失败保留原分数。 |
| 详情图片共享元素进出为 320ms / 240ms，图片由列表矩形过渡至 0dp 圆角详情图。 | 详情图使用 0dp 圆角、多图原生分页与原比例；页面路由采用统一轻位移叠化。当前原生详情没有复刻网页的图片克隆矩形共享元素。 |
| 发现标签指示线 240ms、内容交叉叠化 260ms；系统减少动态效果时停用。 | 频道/排序文字与指示线分别平滑变色和位移；导航页面以统一 280ms / 220ms 叠化加轻位移切换。 |
| 网页弹窗遮罩 260ms、背景模糊至 7px；面板约 360ms 入场、210ms 退出。 | 使用 Compose 原生对话框与统一 12dp/16dp 形状；Compose 动画遵循系统 Animator 时长比例。当前没有给所有原生 AlertDialog 增加统一背景模糊层。 |

### 线上问题复核与验证边界

- 只读检查生产域名：探索日历 `GET /api/v1/exploration-calendar?month=2026-11` 返回 HTTP 404；阶段 D 对应网站 API 仍在 PR #18，未合并/部署。阶段 D 当前原生源码实际通过登录态 `/api/v1/library-state` 读取翻卡记录，按账号时区整理日期并读取真实帖子详情，不调用这个未部署路由，也不使用假数据；本轮保留该回退实现且没有改网站代码。未用真实账号在设备上复测原截图错误。
- 同一只读检查中 AI `sort=featured` 返回 200、`total=0`；`sort=latest` 和 `sort=popular` 均返回 200、`total=2`。新包默认显示最新资源，用户仍可查看精选筛选。
- 针对截图时间的 Supabase 只读日志检查未发现 DM RPC 404；当时 profile/profile_attributes 请求为 200。已核实 `dm_inbox_summary()`、`open_dm(uuid)`、`send_dm(uuid,text,uuid,text)` 存在且授予 `authenticated` 执行权限。生产 `/api/v1/messages` 只读 GET 返回 404，但 Native 3.2 使用 Supabase Data API 直连，不调用该网站路由。消息页增加了重试入口；没有测试账号复现原请求，设备侧 404 的最终根因仍未确认。
- 本机 Android Gradle 构建因 `services.gradle.org` DNS `UnknownHostException` 无法运行。GitHub Actions #67 暴露评分动画导入包名错误，已修正；Native 3.2 Run #68（ID `42839712520`，2026-11-10 15:08 UTC）最终成功：`testDebugUnitTest`、`lintDebug`、Debug 与 unsigned Release 构建、版本化产物准备及上传全部通过。
- APK：`HEIKA-2.3.6-19-debug.apk`、`HEIKA-2.3.6-19-release-unsigned.apk`；`applicationId=com.heika.community`。Debug APK 可安装测试；Release APK 未签名，仅供检查。Artifact `HEIKA-Native-3-v16a022ebddf69a0136fad4d9c5ca823a2af1f7bd`，ID `13776955971`，23,184,408 bytes，ZIP SHA-256 `b2a3f1369ed4243cf42896b927ef99c73f0413a332e5a0a1e4d4fd1f2e76c7bd`，有效至 `2026-11-24 15:08 UTC`。下载：https://github.com/sunyu1590-create/fanka/actions/runs/42839712520/artifacts/13776955971
- 未进行真机/模拟器、跨账号、跨设备、网络中断、横竖屏、低性能帧率或完整线上端到端验收；CI 构建成功不代表这些交互已在设备上确认。未合并 PR、未部署生产、未发布 APK。
