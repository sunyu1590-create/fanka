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

## HEIKA Native 3.2 第二阶段：性能、稳定性与交互收口

- 工程仍为 `/workspace/heika-native3-followup`，开发分支 `codex/native32-phase1`；从第一阶段最终文档提交 `a1ad0b954be2b5e6432e2facf66b56569fca0202` 增量开发，因此 A、B、C、D 与第一阶段源码均保留。
- 第二阶段实现提交：`b2f0d8e66e4cd5867d553562a7751dc60998452c`；修正编译问题：`8a0cd1a1d9977196bfb31052f01cdf8653c830db`；补充图片失败重试及其编译修正：`715f1697b22e2f16e700ebd45ac06af8d098aecf`、`e6c087312b98f7afc9e13e541cdf70b833e7be20`。Run #73 构建的最后 Android 源码 SHA 为 `e6c087312b98f7afc9e13e541cdf70b833e7be20`。本节文档提交不改 Android 源码。
- Android 版本递增为 `2.3.6` / versionCode `20`；`applicationId=com.heika.community` 不变。
- 加载与缓存：个人资料、通知、帖子详情、AI 版本、私信列表及探索数据先显示账号/资源隔离的本地快照，再后台刷新；失败保留有效内容。请求代次阻止过期结果覆盖新页面或账号；个人资料、通知偏好和探索入口增加重复加载抑制。发现图与详情原图使用不同缓存键；图片失败可点击重试；调整图片缓存容量时保留旧 loader 30 秒，避免取消正在显示的请求。
- 私信：Native 明确使用 Supabase Data API 的 `POST /rest/v1/rpc/dm_inbox_summary`、`open_dm`、`send_dm`，以及 `GET /rest/v1/dm_messages`、`POST /rest/v1/dm_reads`，不是 Next.js `/api/v1/messages`。会话资料批量读取；进入会话时才按新收到的消息标记已读；活动会话轮询间隔为 12 秒并以请求代次隔离切换中的旧响应。接口错误现包含服务名、路径、HTTP 状态及 PostgREST 错误码（如有）；新增测试锁定方法、路由、分页与时间戳编码。
- 私信 404 根因证据：只读生产检查确认 `GET /api/v1/messages` 返回 Next.js 404，当前生产部署不含该网站路由；但 Native 3.2 源码走 Supabase Data API，未调用该路径。截图时间对应的 Supabase 只读日志未发现相应 DM RPC/Data API 请求，现有 RPC 与 authenticated 执行授权也已核实。因此，旧安装包实际请求的路径及截图 404 的最终来源仍不能从现有证据确定；本阶段没有把 404 当作成功，也没有用本地假响应掩盖问题。最终 APK 保留真实错误并增强诊断，未改网站或数据库。
- 探索日历不依赖尚未部署的 `/api/v1/exploration-calendar`：以登录用户 JWT 读取受 RLS 约束的 `user_interactions.opened_at`，按 `/api/v1/me` 中的账号时区分日，分页统计月记录与连续天数，再读取真实内容详情；已只读核实表启用 RLS 且 authenticated 用户仅能按 `user_id=auth.uid()` 读取。没有新增表或更改数据库策略。
- 翻卡仍由服务端确认额度和揭晓；展开/请求期间忽略其他卡片点击，避免 Mutex 排队触发第二次翻卡。评分仍使用网页 1–5 星 API，仅服务端成功响应后写入评分结果并播放完成状态；保留失败回滚与重复提交保护。AI 精选空数组保持有效空状态；详情图维持 0dp 直角。
- 新增/扩展 Android 单测覆盖私信路由合同、账号缓存键隔离、探索时区/连续天数和缩略图/原图缓存分离。Run #70 与 #72 曾暴露两组编译错误，均已修正；最终 Native workflow Run #73（ID `42853543274`，2026-11-10）成功，`testDebugUnitTest`、`lintDebug`、Debug 与 unsigned Release 构建、版本化产物准备和上传全部通过。Run：https://github.com/sunyu1590-create/fanka/actions/runs/42853543274
- Artifact `HEIKA-Native-3-ve6c087312b98f7afc9e13e541cdf70b833e7be20`，ID `13782351519`，23,238,221 bytes，ZIP SHA-256 `2d0043108cbabd414a654356a417e6bbe8f6dd2ed1a4956dbe2a0fa25a1b7d46`，有效至 `2026-11-24 16:28 UTC`。下载：https://github.com/sunyu1590-create/fanka/actions/runs/42853543274/artifacts/13782351519
- APK：`HEIKA-2.3.6-20-debug.apk`（21,666,299 bytes，SHA-256 `795d8504068a3d169c1bd7861ca94273b953b6a5f0e57a4fb91799c6d5df9c28`）；`HEIKA-2.3.6-20-release-unsigned.apk`（2,615,571 bytes，SHA-256 `e9ea0d7ead6b0e0fa934243de4ea4bca54b0599cc298ff093bd0a217c688c895`）。Release APK 未签名，只供检查；Artifact 中两 APK 的哈希已从下载包独立复算。
- 本地 Gradle wrapper 仍因 `services.gradle.org` DNS `UnknownHostException` 无法下载分发包；最终源码已由 GitHub Runner 完成全套单测、Lint 与构建。没有可用 Android 设备/模拟器或测试账号，因此未验收真机帧率、旋转/进程恢复、真实网络中断、跨账号私信、双设备及完整线上端到端场景；不能把 CI 构建称为真机验收。未修改网站源码、未合并 PR、未部署生产或发布 APK。

## HEIKA Native 3.2：全局 UI 精修与本地动效/图标

- 基于阶段二最新 HEAD `5c462036fb83aa25c494d442fae37490fa170a80`，并保留阶段 A/B/C/D 与 Native 3.2 两阶段的全部祖先成果，分支仍为 `codex/native32-phase1`。主要 UI 提交 `72c16b113604f43df84714077edcf5c8e6c829f0`；编译修正提交 `a37bc318467c473d039e0b8efdfb5268b8d2bdf1`；共享图片返回圆角修正提交 `19fcd59390d4b78ad93eaaf7a247407adf45dc99`。最终 APK 构建源码 SHA 为 `19fcd59390d4b78ad93eaaf7a247407adf45dc99`。本次代码差异涉及 `MainActivity`、详情/发现/首页/探索/个人/搜索/设置页面与 ViewModel，以及 `HeikaGlass`、`HeikaIcons`、`HeikaSharedImage`、主题/偏好和 UI 选项单测。
- Android 版本从 `2.3.6` / versionCode `20` 升为 `2.3.6` / versionCode `21`，`applicationId=com.heika.community` 不变。
- 首页翻卡保留服务端额度校验、确认请求和揭晓状态；Haze 背景与底部导航按展开进度增加模糊，统一叠加暗化，清理外层重复矩形描边并调整收回时长。发现页将话题、资源类型和排序折叠为独立筛选面板，分类标签和评分角标复用裁切后的 `HeikaGlassSurface`。
- 详情页作者与互动区使用状态化图标；评分面板增加 Haze 聚焦、星级颜色/缩放/触觉反馈及提交中状态。仅收到服务端成功结果后关闭面板和更新评分，失败时保留原评分并显示错误。详情媒体继续为 0dp 圆角。
- 设置的“外观与阅读”增加上下浮、叠化、连续开关三种可持久化页面切换选项。上下浮/叠化适用于普通导航；连续开关模式通过 Compose `SharedTransitionLayout` 将发现卡片图片从列表共享到详情图，并用共享覆盖层裁切插值实现卡片圆角到详情直角的过渡。无卡片来源的路由使用轻位移叠化回退。首页翻卡动画独立于页面切换偏好。
- `HeikaGlassSurface` 统一裁切、低对比半透明材质、Haze 模糊、单条边缘高光及无模糊时的实体色降级。`HeikaIcons.kt` 将主要语义图标集中到随 APK 编译的 Compose Material Icons Extended 矢量资产（Apache-2.0）；不依赖远程图标、不用字符或 Emoji 作为主要图标。
- OPPO Sans 检查：官方 ColorOS 字体页面为 https://www.coloros.com/article/A00000074/ ，说明字体可用于个人、商业等场景，同时保留 OPPO 版权、禁止修改/转售并限制向他方提供下载渠道；页面没有明确说明可将字体文件嵌入并随第三方 Android APK 再分发。官方资源下载在当前环境返回 403。由于不能确认满足本项目要求的 APK 内嵌再分发授权，本轮没有下载、改名或打包字体，也没有把 OPPO Sans 标为可选。字体设置页仅显示“系统默认”；DataStore、字体目录解析及主题字体映射留有接入位，并有测试保证未打包字体不会被错误呈现为可选项。需取得 OPPO 对应用内嵌/再分发的明确许可或官方可再分发条款后再启用。
- 单测新增 `NativeUiOptionsTest`，验证转场值持久化规范和仅暴露 APK 已提供的字体。Unicode 图标字符扫描无匹配；`git diff --check` 通过。Native workflow Run #74（ID `42863146774`）首次编译失败后修正编译项；Run #75（ID `42863912731`）单测、Lint、Debug/unsigned Release 构建曾成功。最终又修正返回方向的共享图片圆角插值，并由 Run #76（ID `42865876052`）对最终源码的单测、Lint、Debug/unsigned Release 构建、版本化产物准备和上传全部验证成功。
- Run #76：https://github.com/sunyu1590-create/fanka/actions/runs/42865876052 。Artifact `HEIKA-Native-3-v19fcd59390d4b78ad93eaaf7a247407adf45dc99`，ID `13787158867`，23,322,032 bytes，ZIP SHA-256 `90ff2987f64a8120e1734370cd86800a8c1e1a77dd06f734f27a397631f6ee33`，下载：https://github.com/sunyu1590-create/fanka/actions/runs/42865876052/artifacts/13787158867 。Artifact 有效期至 `2026-11-24 17:40 UTC`。
- APK：`HEIKA-2.3.6-21-debug.apk`（21,715,451 bytes，SHA-256 `539f2faac2b3fd0e1c5dc1ce8a7b8e1c66d428c0ec58641576b34db5ea33d668`）；`HEIKA-2.3.6-21-release-unsigned.apk`（2,648,339 bytes，SHA-256 `1386979a90601f726068cbfa8604d8efc7c6cfdf1e70d0c2d778000d448e87db`）。上述文件及哈希已从 Run #76 下载 Artifact 独立核对；Release APK 未签名，仅供检查。
- 本地 Gradle 构建仍被 `services.gradle.org` DNS `UnknownHostException` 阻断；Run #76 使用 GitHub Runner 构建。当前环境没有 Android 设备或模拟器，未进行真机模糊效果、共享元素帧时、快速打断、屏幕旋转、浅深色截图和滚动恢复验收；CI 构建不等于设备视觉验收。Run #76 有既有系统栏/API 弃用警告、发送/返回/外链图标镜像警告及已有恒真条件警告。未修改网站或数据库，未合并 PR、部署生产或发布 APK。

## HEIKA Native 3.2：详情互动、评论与设置收口

- 基于本分支 Run #76 源码 `19fcd59390d4b78ad93eaaf7a247407adf45dc99` 增量修复；阶段 A/B/C/D、Native 3.2 前序工作全部保留。交互修复提交 `36e8673`，重复点击/过期鉴权响应收口 `a09d69e`、`dc585bc`，分页重试修复 `3aef176`，纯 JVM ID 协议测试修复 `e2bd945b1d4c6cfeb0d1bbf9fe96d77eef4f9136`。当前 Android 构建源码 SHA 为 `e2bd945b1d4c6cfeb0d1bbf9fe96d77eef4f9136`；本节文档提交只改基线记录，不改 APK 源码。
- Android 版本递增至 `2.3.6` / versionCode `22`；`applicationId=com.heika.community` 不变。
- ID 根因：网站 `/api/v1/posts/[id]` 先取得包含数值 `id=client_id` 的展示对象，再展开原始 Supabase 记录；原记录 UUID `id` 覆盖数值 `id`，同时保留数值 `client_id`。旧 Android `optInt("id")` 将 UUID 变成 `0`，由此生成 `/api/v1/posts/0/rating`。修复后优先读取 `clientId` / `client_id`，只接受正整数；数值旧 `id` 作为兼容回退；缺失或小数 ID 会在请求前拒绝，不截断、不生成 `0`。UUID `cloudId` 继续供评论、举报和 AI 资源请求使用。
- 网站协议核验：评分 GET/POST 使用 `/api/v1/posts/{client_id}/rating`，详情评分 GET 才返回 `myRating`；原批量 `/api/v1/ratings` 只含平均分与次数，所以 Android 现改用详情评分 GET 恢复账号个人评分。点赞/收藏仍使用已存在的 `POST /api/v1/library-state`，JSON 体为 `{action,id,value}`，其中 `id` 是数值 `client_id`。关注仍传作者 UUID。评论与评论点赞使用帖/评论 UUID，分别调用现有 `/api/v1/posts/{uuid}/comments` 和 `/api/v1/comments/{uuid}/reactions`；Session 仍由 Repository 的 authenticated 请求附加。这里只读核对仓库中的 Next.js 路由和 Android 请求定义，未用生产测试账号发起真实互动。
- 评分保持详情页内联 1–5 星：48dp 触控目标、颜色过渡、按压缩放、轻触觉反馈、局部 `HeikaGlassSurface` 聚焦和提交状态。点赞、收藏、关注有请求锁、加载/选中状态及失败恢复；点赞数按真实初始总数进行乐观变化，失败回滚。鉴权等待期间先锁操作，并以请求代次丢弃切页后的旧响应。用户看到简短提示，不显示原始 HTTP 错误。
- 评论区改为紧凑头像/昵称/正文/时间/回复/点赞结构，去除逐条大型卡片；回复按线程展开，保留多层父子关系和每条回复对象。评论分页仍走服务端分页 API；首屏加载、空态、失败重试、发送状态及加载更多均保留；加载更多失败重试原失败页。底部胶囊编辑器随 IME 与安全区上移，多行最多 4 行/112dp、空内容禁发，发送中禁重复提交并暂锁输入/改回复目标；失败保留文本，成功插入服务端返回的评论并展开目标线程。评论点赞走真实 reactions API，失败回滚。
- 设置二级页统一为同一组列表单选、操作行和服务端状态开关；外观页导航至主题、布局、阅读、页面切换动画和字体的独立选项页，存储容量独立选择；通知、隐私、账号、会员、关于继续保留原有入口、实际后端开关与系统操作。现阶段字体只显示系统默认，不虚构未获再分发授权的 OPPO Sans。现有三种页面切换动画和 DataStore 偏好保持不变，所有详情图片仍为 0dp。
- 新增 `PostIdMapping` 与 `PostInteractionProtocol` 纯 Kotlin 测试，覆盖 UUID/client_id 分离、旧数值 ID 兼容、无效/小数 ID 拒绝、评分路径、评分状态路径和点赞/收藏请求体。首次 Run #81 暴露测试直接调用 Android `org.json` stub 的错误；改为纯 JVM 逻辑后，Native workflow Run #82（ID `42958022158`）对最终 Android 源码 SHA `e2bd945b1d4c6cfeb0d1bbf9fe96d77eef4f9136` 的 31 项单测、Lint、Debug/unsigned Release 构建、版本化产物准备及上传全部成功。Run：https://github.com/sunyu1590-create/fanka/actions/runs/42958022158
- Artifact `HEIKA-Native-3-ve2bd945b1d4c6cfeb0d1bbf9fe96d77eef4f9136`，ID `13827543869`，23,346,346 bytes，ZIP SHA-256 `4919e37265006015fe09fc060b92e76f3f4ecaba3f5b3f1e0bc33954ba65ba1f`，下载：https://github.com/sunyu1590-create/fanka/actions/runs/42958022158/artifacts/13827543869 。已下载并校验 ZIP 完整性、`BUILD-INFO.txt` 的源码 SHA/versionCode 和 APK 哈希。
- APK：`HEIKA-2.3.6-22-debug.apk`（21,748,219 bytes，SHA-256 `5868ece58df73c4345d414089b954c6ae8d75af2ec70a36160e09f7757d90e05`）；`HEIKA-2.3.6-22-release-unsigned.apk`（2,648,339 bytes，SHA-256 `1d548730bf45c9ad655ee02854a12e3c1aa3bd605dbf461106fb5ba529683e5d`）。Release 未签名，仅供检查。
- 本地 Gradle 仍因 `services.gradle.org` DNS `UnknownHostException` 无法执行；Run #82 的 GitHub Runner 完成所有检查和 APK 构建。未在真机/模拟器验证键盘、评分触觉/模糊、返回与滚动，也未使用生产账号对评分、赞藏、评论和关注进行端到端请求；CI 通过不代表这些线上/设备场景已验收。未改网站或数据库、未合并 PR、未部署生产。

## HEIKA Native 3.3：详情业务闭环、管理与隐私入口

- 基于 Native 3.2 versionCode 22 的完整分支增量开发；保留 A/B/C/D、Native 3.2 动画/图标/评论/评分和 ID 映射修复。Android versionCode 首轮升至 23，后续补全管理页与推荐话题操作后递增至 24，versionName 仍为 `2.3.6`，applicationId 仍为 `com.heika.community`。本轮 Android 源码提交：`fb856b48da18f99b51ac2725d4214498d855ce3e`（详情互动/隐私/管理）、`8d192756c3b220a0efc8b752b8ae763183381a9e`（设置恢复码、私信举报管理和 CI 编译修复）、`205f0991e72a677479e8a5f92751afaeae3687b2`（作者删除内容）、`60ff6b8f92d7bea9a0268f2e9616d335f0091e77`（管理页面与话题推荐操作）、`4d169d6976804816c1719f7d4bd7c2ccf81acee9`（原生管理配置）、`8bb3b1f999b4b7331357e4a27ad44a893471ea11`（CI 编译修正）。最终 Android 源码 SHA 为 `8bb3b1f999b4b7331357e4a27ad44a893471ea11`；文档提交不修改 APK 源码。分支 `codex/native32-phase1` 已推送。
- 详情页三点菜单接入复制链接、Android Sharesheet、内容反馈、内容举报、减少作者推荐和屏蔽作者；作者本人可二次确认后通过现有 UUID DELETE API 删除内容。评论保留紧凑列表、线程回复、评论点赞，支持复制、回复、举报以及作者本人删除；所有这些操作使用已有服务端路由，并以响应结果更新或回滚状态。评分仍为单行 1–5 星即时操作；点赞/收藏和评分继续使用正数 `client_id`，评论/举报/帖子删除使用 UUID，不做 UUID 转数字或默认 0 回退。
- 新增原生管理员工作台（举报、私信举报、帖子审核、AI 审核/反馈、评论管理、申诉、用户限制、账号角色/会员等级、用户反馈、关键词规则增删/启停、操作审计、分类启停/新增、话题活动新增/上下线、推荐卡片配比和 AI 密钥配置）。入口由服务端管理员 overview 确认；各队列和变更请求仍由对应 `/api/v1/admin/*` 服务端权限检查保护。分类名称/别名/合并、关键词规则范围编辑和话题活动编辑仍未在原生端覆盖；APK 不保存管理员或 AI 密钥，AI 密钥只提交到现有服务端加密存储。
- 内容“不感兴趣”增加真实话题屏蔽：使用现有 `/api/v1/recommendation-feedback` 的 `mute_topic`，不只在本地隐藏；作者减少推荐和账号屏蔽仍是独立选项。
- 设置补充账号隐私读取/更新与黑名单解除，以及使用现有恢复码 API 生成并一次性展示恢复码（生成前确认会使旧码失效）。新增 `/api/v1/me/privacy` 使用登录用户 JWT 与 RLS 读取/更新既有 profile、browsing preference 和 user_blocks 数据，没有数据库迁移。该 API 随本分支提交，生产尚未部署；上线隐私中心前需要部署该网站路由。仓库没有账号数据导出或注销 API，本轮不虚构此类操作。
- Run #83 曾因 Compose imports 失败；Run #86 又发现详情菜单误引用 `item.tags`，均已修复。Run #84、#87 因后续推送取消。最终 Native workflow Run #88（ID `42968509742`，源码 SHA `8bb3b1f999b4b7331357e4a27ad44a893471ea11`）Kotlin 单测、Android Lint、Debug APK、unsigned Release APK、版本化产物与上传全部成功。Run：https://github.com/sunyu1590-create/fanka/actions/runs/42968509742 。Artifact `HEIKA-Native-3-v8bb3b1f999b4b7331357e4a27ad44a893471ea11`，ID `13833215460`，23,581,994 bytes，ZIP SHA-256 `a5a35eca95a77878a62b6ac40282351a55b8a63ee62d56fbe130001dcf033724`，下载：https://github.com/sunyu1590-create/fanka/actions/runs/42968509742/artifacts/13833215460 。Artifact ZIP 已下载；`BUILD-INFO.txt` 的 version、versionCode、源码 SHA 与 APK 对应，ZIP 和 APK 哈希已独立复算。APK：`HEIKA-2.3.6-24-debug.apk`（21,912,059 bytes，SHA-256 `6208ca0dc995b9b649fa2ac738b9167b5a618222aec828ba77b5a6cba2017f46`）；`HEIKA-2.3.6-24-release-unsigned.apk`（2,713,875 bytes，SHA-256 `4d5fb24e3c39a1bb7926dbebe75533de164520d9982a057c76792a15fe55288a`）。Release APK 未签名，仅供检查。Run #117/#119 是不同的旧 `android/` 工程（版本 2.2.4），没有用作 Native 3.3 产物。
- Web validation 已通过 `npm run typecheck`、56 项 `npm test` 和 `npm run build`；此前 lint 为 0 error、51 个既有 warning。之后新增的内容删除、管理员和原生路由合同断言下，`npm test` 57 项全通过；`git diff --check` 通过。
- 本机 Android Gradle 仍因 `services.gradle.org` DNS `UnknownHostException` 无法下载 Gradle 8.11.1；使用 GitHub Actions Runner 构建。当前没有真机、模拟器或测试账号，未完成评论/反馈/屏蔽/删除与管理员角色的线上端到端验收，也未验证共享元素动画的实机帧时间、键盘联动和跨账号隔离。未合并 PR、未部署生产、未发布 APK；Release APK 为 unsigned 检查包。
