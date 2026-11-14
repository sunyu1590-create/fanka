# HEIKA Native 3.0 / 3.1 基线记录

> 状态核验日期：2026-11-14。每次开发前重新核验远端分支及 Actions；以下 SHA 是本次核验结果，不是永久基线。

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

## Native 3.3 管理工作台与详情页视觉收口

- 在 Native 3.3 最新源码上增量调整管理员中心为“概览数据 → 分组模块 → 管理队列”结构。概览复用 `/api/v1/admin/overview`；没有服务端统计来源的项目不显示虚构数量，模块处理继续使用既有 API 与服务端权限检查。
- 内容详情顶部标题按内容类型和分类显示；主图扩至屏幕宽度并保持直角，作者行去除多余底色容器，点赞/收藏/分享与评论输入合并到固定底栏，评分、评论、举报和反馈业务保留。
- 本次提交前 `git diff --check` 通过。环境内存可用约 9.1 GiB、磁盘可用约 5.6 GiB，Gradle 最大堆为 3 GiB，未发现内存不足迹象。
- 本地 `:app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease` 未能启动：Wrapper 下载 Gradle 8.11.1 时 `services.gradle.org` DNS 返回 `UnknownHostException`；机器没有已安装的 Gradle 发行版。GitHub Actions API 请求返回 `Forbidden`，无法从当前环境触发/检查 Runner 构建。故本次没有声称测试或 APK 构建通过，亦未生成新 APK。真机/模拟器未连接。

## Native 3.3 消息/个人主页与 SVG 图标适配

- 在 versionCode 25 的源码上增加私信列表页签、会话本地搜索、未读筛选、未读总数和通知入口；聊天详情展示联系人头像/主页入口、按日分隔的消息、时间和底部 IME 联动。保留既有消息 API、轮询、分页、发送幂等与失败重试。仓库没有置顶状态/API 和私信媒体上传接口，因此不显示虚假的置顶或附件操作。
- 个人主页等级徽标使用实际等级；今日任务领取摘要从既有 `/api/v1/daily-missions` 读取，探索中心仍展示真实等级、EXP 和连续天数；任务接口失败时显示查看入口，不伪造数字。
- 用户提供的 SVG 压缩包内 116 个图标已转换为 Android Vector Drawable，公共 `HeikaIcons` 入口映射至包内图标；资源没有星形或书签图案，这两类保留现有 Material 矢量图标。Android versionCode 从 25 升至 26。
- GitHub Actions Run #90 成功（2026-11-11）：Kotlin 单元测试、Android Lint、Debug APK 与 unsigned Release APK 均通过；源码 SHA 为 `1eb9e4f9ad27a3951dfd8ba3a322619145206e86`，versionCode 26。Artifact `HEIKA-Native-3-v1eb9e4f9ad27a3951dfd8ba3a322619145206e86`（23,777,697 bytes，SHA-256 `6504bd9d5c0929034f177df2cc5be764a2e7ebaade23fcec1a8d58a277c1429f`）：[Run #90](https://github.com/sunyu1590-create/fanka/actions/runs/43039709150)。
- 本地 Gradle Wrapper 仍因 `services.gradle.org` DNS 失败无法启动；CI Runner 已完成全部构建。未进行真机/模拟器交互验证。SVG 压缩包未附许可文件，本次按用户提供资产接入，未据此作出图标库再分发许可声明。

## Native 3.3 图标与交互视觉收口（versionCode 27）

- 基于最近成功构建 Run #90 的源码 `1eb9e4f9ad27a3951dfd8ba3a322619145206e86`（versionCode 26）继续开发，保留消息、个人主页、发现、翻卡、详情、评分、探索及发布功能。Android 改动提交：`907cf9696d35c9439399e263505fbdfa56e7e3c9`、`c46d578e9ef2508ddb13f599f1d37fadbe8ad413`、`8a9947ad8f1724643f28989337e1d3da66c157d2`、`bb48a4e6682912d8cbf4606cc4ab6fcc40b8aa39`、编译修复 `dab708e2f76fc7e827c21d25b60dabc6adb3245a`。APK 源码 SHA 为 `dab708e2f76fc7e827c21d25b60dabc6adb3245a`；基线文档后续更新不改变 APK 源码。
- 将 Native 3.2 翻卡预览改为单层连续背景模糊：模糊半径随展开/收回进度从 0 插值至 30dp，不叠加暗色 tint；预览时停用顶部与底部的平行模糊层。确认卡片和翻卡额度/揭晓接口保持原样。
- 从 ByteDance IconPark 官方仓库 revision `8dc132da4c85671ba6a5962c87aa2bdafbf158e9` 选取 119 个 SVG 并转换为随 APK 打包的 Vector Drawable，统一由 `HeikaIcons` 映射及主题 tint 使用。授权为 IconPark 仓库 Apache-2.0；完整授权与来源分别记录于 `native-android/ICONPARK-LICENSE.txt`、`native-android/ICONPARK-ATTRIBUTION.md`，APK 原始资源中包含许可证文本。移除 Compose Material Icons Extended 的直接使用和依赖。
- 发现卡片分类与评分标记、个人页作品标签改用不透明 Solid Glass；品牌顶栏及个人页顶栏改用与底栏共享的 Liquid Glass 表面。详情主图居中并铺满内容宽度，右上角操作图标使用主题亮色，评分使用统一星形资源；详情评论栏空输入状态显示评论图标，有文字时显示发送图标。翻卡确认页只保留一条模糊管线。
- 发布页扩大了图片上传预留区、优化字段顺序，并加入 Video Beta 的本地选择/预览前端。当前仓库没有视频上传服务端能力，因此没有显示已上传或伪造发布成功；后端上传闭环需后续实现。Android `versionName=2.3.6`，`versionCode=27`，`applicationId=com.heika.community`。
- GitHub Actions Run #98（ID `43068353850`）在源码 SHA `dab708e2f76fc7e827c21d25b60dabc6adb3245a` 上成功完成 `testDebugUnitTest`、`lintDebug`、Debug 与 unsigned Release 构建、产物准备和上传。Run：https://github.com/sunyu1590-create/fanka/actions/runs/43068353850 。Artifact `HEIKA-Native-3-vdab708e2f76fc7e827c21d25b60dabc6adb3245a`，ID `13878140607`，17,283,338 bytes，ZIP SHA-256 `dd343d5efbae9780802b2491867e0c66fc76b13d18ce7f8d5662f091802edb25`，有效至 `2026-11-25 17:35 UTC`：[下载 APK Artifact](https://github.com/sunyu1590-create/fanka/actions/runs/43068353850/artifacts/13878140607)。已下载 Artifact 并核对 `BUILD-INFO.txt` 源码 SHA、版本及两份 APK SHA-256。
- APK：`HEIKA-2.3.6-27-debug.apk`（15,433,376 bytes，SHA-256 `1e5d0d16c567c58429255ebc2962ae76aafb1a561e35bd2b9d815a4a1889edb0`）；`HEIKA-2.3.6-27-release-unsigned.apk`（2,903,994 bytes，SHA-256 `04797f0b5f2d2de721c47fbc6c0839614b7e01a4e1a654b753eab4e569e6d355`）。Release APK 未签名，仅供检查。
- `git diff --check`、119 个 Vector Drawable XML 解析、资源引用完整性、图标引用静态扫描通过。此前 Run #96/#95 发现 `BrandHeader` 调用参数错误；已改为显式命名 `trailing` 和 `hazeState`，Run #98 的测试、Lint、Debug/Release 全通过。本机 Gradle 仍受 `services.gradle.org` DNS 影响，构建由 GitHub Runner 完成。没有真机/模拟器，故翻卡模糊、Liquid/Solid Glass、Video Beta 预览和屏幕适配尚未做设备视觉验收；未改网站 API、未部署生产、Release 未签名。

## Native 3.3 Lucide 图标适配与探索详情连续转场（versionCode 30）

- 基线为 `codex/native32-phase1` / `953d993f4ab9bbf02559a449710a73ce96ce65be`。本次只替换确认有准确 Lucide 语义的活动图标，原 119 个 `ic_ip_*.xml` 全部保留为回退资源；举报警告与反馈等未确认相同语义的资源仍使用原图标。新增 Lucide 官方 SVG 转换后的本地 VectorDrawable，来源 `lucide-icons/lucide`，采用 ISC 许可证，许可证随 APK 打包。点赞、收藏、评分的 Lucide 官方 SVG 是线框；`like_filled`、`save_filled`、`star_filled` 是本地填充态变体，原状态和业务逻辑不变。
- `HeikaIcons.kt` 集中映射更新；分享与外链分开映射为 `share-2` 和 `external-link`。新增故事接龙 `git-branch` 与锁定状态 `lock-keyhole`。设置三级选择、操作、开关行从标题 `contains` 匹配改为 `SettingIconKey` 稳定键，保留设置标题、排序、跳转和行为。浅/深色图标仍使用原主题 tint。
- 发现页 `FeedCard` 与详情页原有 `SharedTransitionLayout` 共享图片转场保持；个人页作品、收藏、点赞卡片继续复用 `FeedCard`。探索日历记录卡增加同一 `postId` 的共享图片标识，并把共享转场作用域传入日历路由，使其和详情主图使用相同 key。无图或图片失败时不添加共享元素，回退到已有页面淡入/位移转场；帖子数据、翻卡额度和导航目标不变。详情内容仍保持整体布局入场，没有给标题、作者、按钮分别做共享位移。
- Android version 为 `2.3.6` / versionCode `30`，`applicationId=com.heika.community`。最终提交 SHA：`f3514f72a44146e20157db6549a52fcb99b4cd69`。GitHub Actions Run #101（ID `43194075877`）单测、Android Lint、Debug APK、unsigned Release APK、版本化产物和上传全部成功：[Run #101](https://github.com/sunyu1590-create/fanka/actions/runs/43194075877)。
- Artifact `HEIKA-Native-3-vf3514f72a44146e20157db6549a52fcb99b4cd69`，ID `13932017969`，17,351,203 bytes，ZIP SHA-256 `79e671e814cfd4803f60dc54af4c1a34e66c30fd98c8efc3f2cbf90c7c50c9dc`，有效至 `2026-11-26 09:51 UTC`：[下载 APK Artifact](https://github.com/sunyu1590-create/fanka/actions/runs/43194075877/artifacts/13932017969)。已下载并核对 `BUILD-INFO.txt` 的源码 SHA、versionCode 及 APK 哈希。
- APK：`HEIKA-2.3.6-30-debug.apk`（15,476,311 bytes，SHA-256 `695585b9fea165c9b662ea8f26cde1fec61a2aa788d898d75837e43133ca6221`）；`HEIKA-2.3.6-30-release-unsigned.apk`（2,942,587 bytes，SHA-256 `a200b7df1b57ed501bee380f148c429c1cdf06b3ee8c40263aa56c2bd8ee39a8`）。Release APK 未签名，仅供检查。
- 静态检查确认 HeikaIconRes 资源引用存在、Lucide XML 可解析，Debug APK 内含新增 Lucide 状态资源、保留的 IconPark fallback 和 Lucide 许可证。未连接真机/模拟器，因此没有完成三种入口共享转场、快速返回、图片失败、浅深主题下选中填充状态的视觉/帧率验收；CI 构建成功不等于设备交互验收。未改网站 API、未部署生产、未发布 APK。

## Native 3.3 当前工作区补充（versionCode 33）

- 2026-11-13 延续当前 `codex/native32-phase1` / `6a916aed2916d2d645dabad930805468ed3b4899` 工作区。此前字体核验结论仅代表当时 APK 未嵌入字体；本轮从仓库历史中恢复并验证 OPPO Sans 4.0 Regular（字体内部名称 `OPPO Sans 4.0`，29,197 个字符映射），随 Android APK 打包，并同时在 `res/raw` 保留 OPPO Sans Fonts License Agreement。许可允许未修改字体嵌入、打包及随软件再分发，应用“字体”设置和“关于黑卡”均显示字体来源/版权提示。
- 桌面启动图标与“关于黑卡”统一使用用户提供的金色卡片图，提供 Android 自适应图标与密度资源。
- 底部导航改为仅四个主标签共用独立圆角模糊胶囊，“发布”圆按钮置于胶囊外并为窄屏保留横向空间。发现页滚动标题折叠不再用 `animateContentSize` 追赶手势；卡片玻璃标签共享页面级 Haze 状态，并降低模糊半径以减少滚动期间的绘制成本。
- Android version 保持 `2.3.6`，versionCode 从 32 递增至 33。GitHub Actions 构建与源码 SHA、Artifact、设备验收状态待本轮完成后补录。

## HEIKA Native 3.3 关于页、个人页和探索广告位（versionCode 34）

- 基于 `codex/native32-phase1` / `be34234020c1c938c03b86af1b222d17e784cae5` 增量修改，并保留工作区已有的全部页面、图标和动画成果。Android `applicationId` 不变；versionName 保持 `2.3.6`，versionCode 提升至 `34`。
- 关于页保留完整原始图标文件，以 `ContentScale.Fit` 显示，不裁切；重排信息区并加入 Native 2.3.6 版本记录。记录只列 Android 版本和真实的构建改动，不混用网页端 2.40.x 版本号。
- 个人页品牌栏改为与页面背景同色，不再叠加独立液态玻璃色层；等级徽标显示为 `LV3` 格式；今日探索任务行移除重复奖章图标。底部四个主导航入口保留同一玻璃胶囊和点击语义，只隐藏文字并保留无障碍名称，发布圆钮仍在胶囊外。
- 探索中心增加可选图文推广位，默认关闭。Native 管理后台与网页管理后台都有入口；管理员写入时服务端验证 `profiles.role=admin`、目标作品编号及已发布状态。匿名/普通用户读取只返回启用且目标仍公开的内容，点击通过现有 Native 内容详情路由打开真实帖子。
- 新增 `exploration_ad_settings` RLS 表及 `GET /api/v1/exploration-ad`、`GET/PATCH /api/v1/admin/exploration-ad` 路由。迁移尚未应用到生产数据库，API 路由尚未部署；生产启用此广告位前需先应用新 migration 并部署网站。没有修改生产数据。
- GitHub Actions Native Android Run #105（ID `43411410970`）以源码 SHA `02b98204c847a5ecd1c30127c131b608e2a65840` 完成，Android 单测、Lint、Debug APK 与 unsigned Release APK 构建及 Artifact 上传均成功。Artifact `HEIKA-Native-3-v02b98204c847a5ecd1c30127c131b608e2a65840`，ID `14029867338`，大小 50,467,591 bytes，ZIP SHA-256 `6a81b741bf6abc18057c8fe5d08dc0c5e9217681f7f705ac5c7034c8d9b6b4b3`，有效至 `2026-11-27 10:50 UTC`。下载页：https://github.com/sunyu1590-create/fanka/actions/runs/43411410970/artifacts/14029867338
- APK 文件名为 `HEIKA-2.3.6-34-debug.apk` 与 `HEIKA-2.3.6-34-release-unsigned.apk`；Release 包未签名，仅供检查，Debug 包可用于安装验收。另一个兼容旧 Android 工程的 workflow 也成功，但其 versionName 为 2.2.4，不作为 Native 交付。
- Android 构建通过 CI，网站 TypeScript、63 项 Node 测试和 Next.js Build 通过；本机 ESLint 为 0 错误、51 条既有警告。未连接真机/模拟器，未做 profile 视觉截图验收。探索广告 migration/API 尚未部署生产，未修改生产数据。

## 生产 API 补齐与个人资料/系统默认值修复（2026-11-13）

- 本轮 Android 工作基于本机分支 `codex/native32-phase1` / HEAD `be34234020c1c938c03b86af1b222d17e784cae5` 增量修改；保留所有原有改动，不构建 APK、不提交或推送该分支。
- 生产 Supabase `sauknappipwkxloaovms` 已登记 migration `20261113122521_likes_and_bookmarks_notifications` 与 `20261113122526_exploration_ad_settings`；探索广告配置单例已存在且默认关闭。通知触发器已部署。旧本地迁移文件使用新记录时间戳命名，避免重复执行。
- 为生产网站单独从 `publish-vercel` 基线制作了 API 部署提交 `10afafbd99b0beba99c1a7220cd39de717759934`，范围仅含资料隐私 API、暂存图片上传与发布路径校验、探索广告公开/管理员 API 和管理入口。该部署不触发 Android Actions。Vercel 首次将其识别为 Preview；随后以 Production 目标重新创建部署 `dpl_2HniTiMAxrs9jj8pGqNSuttTHGYr` 并成功绑定 `moonclean.shop`。公开广告接口线上返回 `200 {"data":null}`（默认关闭），媒体路由命中并按缺少路径返回预期 `400`。隐私与管理路由受 Vercel SSO 阻挡，无法从本环境完成未登录响应验证。
- 原生编辑资料补充网站已有的性别、MBTI、生日、兴趣爱好字段与逐项公开开关；个人资料公开字段按 `is_public` 渲染。自己的 `/api/v1/library-state` 返回键为 `profileDetails`，已按真实响应键读取，公开资料 `/api/v1/profiles/:id` 仍读取 `details`。
- 草稿图片通过 `/api/v1/media` 的 `staging=1` 立即上传，服务端只允许登录用户后续提交其账号目录中的媒体；提交/保存前验证存储文件和用户路径。生产 API 部署包含该兼容修复。
- 新安装默认主题跟随系统、页面转场为叠化、字体为包内 OPPO Sans；翻卡预览背层增加高斯模糊和压暗、移除关闭叉号，继续支持点外关闭和系统返回。
- 本轮 Node 测试 `67/67` 通过，网站 TypeScript 检查通过；Android Gradle 编译检查因当前环境没有 Android SDK 未能执行。未连接真机，字体、翻卡模糊、资料编辑视觉和已登录图片上传需设备/API 账号验收。按用户要求未生成 APK。

## AI 专区资源分类（2026-11-13，本轮未构建 APK）

- 基线仍为 `codex/native32-phase1` / `be34234020c1c938c03b86af1b222d17e784cae5`。保留工作区既有个人资料、探索广告、字体、翻卡和 UI 修改。
- 原生发现页 AI 栏新增会参与顶部滚动折叠的「探索 AI 资源」入口；新增独立两列 AI 资源中心、类型结果页与搜索结果页。结果页复用既有 AI 分页 API、`FeedGrid` 卡片、用户瀑布/单列偏好、详情路由和返回栈。
- 发现页入口复用卡片玻璃标签的 Haze 背景采样，包含设备兼容降级色；资源中心分类卡使用最小高度约束，允许系统字号放大时自然增高。
- 资源主类型使用既有 `content_type` 与六个稳定键；新增 `usage_scenarios` 多值字段，六种场景独立筛选。查询支持类型 + 场景 + 标题/正文搜索组合，并保留分页、下拉刷新、错误/空态与列表缓存。
- 原生发布编辑、恢复与本地草稿快照保存使用场景；AI 提交和已发布内容修订写入资源数据，管理员审核通过修订时原子应用场景字段。管理员网页工作台与原生管理员中心都新增资源类型目录启停/文案/顺序管理；网页审核工作台还可纠正内容类型和场景，并记录审计。
- 新增 `supabase/migrations/20261113133929_ai_resource_catalog_and_scenarios.sql` 与公开/管理 API。迁移采用加列、稳定类型目录和兼容审核函数的增量方式；本轮前段尚未向生产执行数据库迁移、未部署 API，也未生成 APK。生产端需先应用迁移，再部署网站 API，之后原生新入口才会在线读取分类目录与筛选数据。
- 新增三项 AI 分类合同测试。网站 `npm run typecheck` 通过，完整 Node 测试 `70/70` 通过，ESLint `0` errors / `51` warnings，`git diff --check` 通过。Android Kotlin 编译检查因环境没有 Android SDK，`:app:compileDebugKotlin` 无法确定 SDK 路径；未连接真机、未运行原生导航验收，也未构建 APK。

## HEIKA 原始 Logo 和 Native 3.3 生产交付（versionCode 35）

- 启动图标和关于页直接引用用户提供的 `drawable-nodpi/ic_heika_original.jpg` 原始 1280×1280 JPEG；不重新采样、不裁切。自适应图标只沿用 Android 系统图标遮罩，原图黑色背景和主体留白均保留。
- Android versionName 保持 `2.3.6`，versionCode 提升至 `35`，用于区分这次生产源码与 versionCode 34 的既有构建。
- 本轮完成后补录 Supabase 迁移状态、网站生产部署 SHA/URL、GitHub Actions Run 和 APK artifact 校验信息。

## Native 3.3 全局交互与消息系统重构（本地构建 versionCode 36）

- 开始基线：`codex/native32-phase1` / `85b7fdc99e21617aada4e4fdaff3393e0f5ae05e`。核验时本地 `origin/codex/native32-phase1` 与该 HEAD 一致。GitHub Actions 最近成功 Android 构建为 Run #108（ID `43437316295`），同一 SHA、versionCode 35；Artifact ID `14044966135`，50,713,067 bytes，SHA-256 `ebecb6e72628344af2580d9804357f62bd3c86758dbd5e880b0d9d0f87a970bb`，有效期至 `2026-11-27 14:00 UTC`。此次源码仍在工作区未提交；没有切换分支、提交或推送。
- 保留先前工作区中的境内网络提示 API 与原生提示逻辑，并在其上继续修改。Android `applicationId` 仍为 `com.heika.community`，`versionName=2.3.6`，`versionCode` 提升到 36。
- 修复全屏模糊根因：移除 Activity 根 `RenderEffect`，不再模糊整页；弹窗背景 dim 和窗口背景模糊分别控制，限制对话框窗口宽度到内容区域。Android 12+ 使用窗口背景模糊，其他设备使用高可读半透明底色。统一 `HeikaGlassDialog` 左对齐标题/正文、独立胶囊操作按钮、危险操作红色、加载锁定与取消策略，并用于内容/评论/作品/后台删除以及设置确认等场景。
- 详情页更多菜单改为一体式 Haze 玻璃浮层，分为常用、反馈、个性化推荐、危险操作四组。复制、分享、反馈、举报、动态话题推荐抑制、作者推荐抑制/屏蔽、权限内删除仍走原有业务逻辑。
- `HeikaAvatar` 为消息、聊天、找人、通知、帖子作者/评论和个人资料统一处理圆形尺寸、裁切、异步加载与失败回退。聊天发送方头像原先错误显示账号 ID 首字符；现改为读取当前用户资料头像，并以昵称/“我”作为加载失败回退。
- 消息页压缩会话/找人导航，统一玻璃搜索框和全部/未读筛选；聊天改为紧凑日期标记、左右消息气泡、消息时间、共享局部玻璃输入栏和独立发送按钮，保留现有会话、搜索、未读、历史加载、发送失败重试与消息 API。通知列表增加全部/互动/审核/未读筛选，使用真实通知头像并保留 Android 权限状态检测与系统授权流程。
- 验证：`git diff --check`、`npm run typecheck`、Node `npm test`（71 项，0 失败）通过；Android `testDebugUnitTest` 33 项通过、0 失败；`lintDebug` 成功（Lint 报告 0 error、267 warning、2 hint，包含仓库资源和现有代码告警）；`assembleDebug` 和 `assembleRelease` 成功。Debug APK `native-android/app/build/HEIKA-artifacts/HEIKA-2.3.6-36-debug.apk` 为 32,349,139 bytes，SHA-256 `0640aa98fba2e42d3a4a90bed537e9831e61a96ce51649c38388dfa20227689a`；Release APK `HEIKA-2.3.6-36-release-unsigned.apk` 为 19,615,748 bytes，SHA-256 `31ddb434d21b92010797d0d2d22849fba48bfbf5f01ffe4a454ad7f3c74bac68`，未签名，仅供检查。
- 没有可用 Android 设备或模拟器（环境无 `adb`），未进行真机/模拟器视觉、键盘 Insets、消息收发与网络错误端到端验收。Run #108 是基线构建，不是本轮未提交源码的 GitHub Actions 构建；本轮 APK 为本地 JDK 17 / Android SDK 35 对工作区完整源码构建。未部署生产、未提交或推送。

## Native 3.3 交互反馈修正（2026-11-14，本轮不构建 APK）

- 继续基于 `codex/native32-phase1` / `85b7fdc99e21617aada4e4fdaff3393e0f5ae05e` 工作区；保留上一轮消息组件、网络地区提示与已生成的 versionCode 36 APK，不提交或推送。
- Android 确认弹窗在 API 31+ 监听系统跨窗口模糊开关；开启时设置 24dp 窗口模糊并使用可透出模糊背景的玻璃底色，关闭或不支持时自动切换高可读不透明底色。页面根视图仍不施加模糊。
- 详情“更多”浮层宽度收紧到 220–250dp。关于页更新记录加入 versionName 2.3.6 / build 36，并列出本轮实际弹窗、菜单和广告刷新修正。
- 探索中心广告查询与成长数据 45 秒缓存解耦：首次/返回加载及成长缓存命中时都会重新读取广告配置；帖子详情加载失败时显示轻量不可用提示。数据查询仍要求公开启用配置和已发布目标帖。生产 API 通过当前执行环境 curl 访问时被网络代理返回 403，无法现场核验线上配置与 API 响应；本轮不修改或部署生产数据/API。
- 验证：`npm test` 71 项全通过，`npm run typecheck` 通过，`:app:compileDebugKotlin` 通过，`git diff --check` 通过。本轮按要求没有执行 assemble/ APK 构建，也没有真机视觉验收。

## 广告位移至发现页信息流（2026-11-14，本轮不构建 APK）

- 按用户最新确认，广告不放在探索中心；迁移至发现页「精选」信息流顶部，作为全宽广告卡片。显示后台配置的标题、文案和图片，标注“广告”，点击进入关联的已发布作品。
- 探索中心不再加载或展示广告。新增独立 `DiscoveryAdViewModel`，公开读取广告配置，发现页首次进入、下拉刷新及从后台返回时刷新；网络失败仅在原广告位显示轻量提示。
- 保留现有管理员配置/API/数据库，不改变开关与目标帖逻辑。广告仅在有效启用配置及目标帖子详情可用时展示。
- Node 合同测试、TypeScript 检查及 Android Kotlin 编译通过；未构建 APK、未连接设备验收，也未部署生产数据/API。

## 网络识别、聊天对齐与翻卡遮罩修正（versionCode 37）

- 继续在现有工作区增量修改，不重置其他更改。国内网络识别改为先读取 Android 当前服务网络国家码；未确认时由设备直接请求 `api.country.is` 查询公网 IP 国家，不再依赖 Vercel API，也不把网络错误误报为境内网络。仅确认 CN 时弹提示。
- 私信消息头像对准气泡而非“时间+气泡”的整列；返回按钮明确使用主题高亮 tint；聊天输入玻璃容器关闭其顶部细高光线。
- 翻卡遮罩压暗从 24% 降至 14%，Haze 染色设为透明并略增模糊半径；根导航栏在预览期间保留轻量模糊，避免清晰浮在模糊背景之上。
- 翻卡庆祝改为约 1 秒的扩散金色光环与少量星屑粒子，不再绘制多色矩形彩带。
- Android 版本号提升至 `2.3.6 (37)`，关于页记录本次更新。`npm test` 74 项通过、`npm run typecheck`、`:app:testDebugUnitTest`、`:app:lintDebug`、`:app:assembleDebug`、`:app:assembleRelease` 与 `git diff --check` 均通过。Debug APK：`native-android/app/build/HEIKA-artifacts/HEIKA-2.3.6-37-debug.apk`，约 31 MB，SHA-256 `262db4d3f574a13c26e1afa492e7f86971887fa99c315c71450822ecff5ad916`；Release APK：`native-android/app/build/HEIKA-artifacts/HEIKA-2.3.6-37-release-unsigned.apk`，约 19 MB，SHA-256 `254a2a67f770996ba1ea227294683e0f25c03c0f01787fcf9eb02613abd04a5b`，未签名。包信息确认为 `com.heika.community`、`versionCode=37`。当前工程没有发布密钥或 signingConfig，故尚无可正式分发/覆盖安装的签名 Release APK。Lint 有 267 warning、2 hints，无 error。未发现 `adb`，因此没有真机交互验收；未提交/推送。

## 翻卡动画、弹窗模糊与发现广告图片修复（versionCode 38）

- 基于当前 `codex/native32-phase1` / `85b7fdc99e21617aada4e4fdaff3393e0f5ae05e` 工作区增量处理，保留之前所有未提交页面、消息、网络提示和广告入口修改；没有切换/重置工作区。Android `versionName=2.3.6`、`versionCode=38`、`applicationId=com.heika.community`。
- 翻卡确认链路保留服务端成功结果作为 3D 翻转前提；请求中立即给按钮轻触、卡片轻抬和银白边缘扫光，返回真实内容后用 `rotationY` 180° 翻转并在边缘位置切换正反面，加入两层错位卡片、透视、低强度高光与揭晓收尾。快速重复确认仍由 ViewModel 的 opening 状态和互斥锁拦截；请求失败复位以便重试；减少动画设置走简化路径。普通翻卡的彩带和彩色粒子实现已删除；只有高评分或当日最后一张可以出现短暂金色高光。未改变翻卡接口、次数/经验数据或持久化规则；今日任务没有单独翻卡成功事件，因此未伪造任务粒子反馈。
- 修正弹窗模糊：仍使用 Android 12+ 对话框窗口 `FLAG_BLUR_BEHIND` 局部高斯模糊，半径调整为 36dp；背景 dim 独立降低至 16%，暗/浅主题玻璃透明度分开配置。系统关闭跨窗口模糊或旧系统不支持时使用不透明且主题正确的面板底色，避免出现只有透明透底、文字背景发黑的问题。弹窗文字和按钮不参与模糊。
- 修复发现广告图片永不出现的问题：原逻辑比较 Coil 的 `StateFlow` 容器而非其发射的加载状态，导致 Success 判断恒假；现通过生命周期感知的 Flow 收集，只有真实加载成功时绘制图片。文字广告和图片失败均不创建图片占位。原生管理员入口可从系统相册选取并上传 JPG/PNG/WebP（≤4 MB），服务端校验管理员角色、MIME、文件签名和尺寸，并上传至单独公开读取的广告图片 bucket；替换配置后尝试清理旧的本应用资源。
- 新增 `GET /api/v1/admin/exploration-ad/image` 上传 API 和 Supabase Storage bucket/RLS migration `20261114040539_heika_ad_asset_upload.sql`。数据库 migration 与 API 仅写入当前工作区，未应用到生产、未部署 Vercel；因此正式环境启用管理员上传前还需部署此 API 并应用 migration。没有更改既有帖子表或翻卡业务数据。
- 验证：`npm run typecheck` 通过；Node `npm test` 75/75 通过；`npm run lint -- --no-cache` 0 error（51 条现存 warning）；`git diff --check` 通过；Android `testDebugUnitTest` 33/33 通过；`lintDebug` 0 error、267 warnings、2 hints；`assembleDebug` 和 `assembleRelease` 均成功。首轮 Lint 指出广告图加载状态直接访问 StateFlow `.value`，已修复为 `collectAsStateWithLifecycle()` 后全量重跑通过。
- Debug APK：`native-android/app/build/HEIKA-artifacts/HEIKA-2.3.6-38-debug.apk`（32,757,065 bytes，SHA-256 `292175b6c879da095b436635120a2d1c8af9c813bbfe83c6bcf4e204a0232188`），已核对包名、versionCode、versionName，APK 由 Android Debug 证书签名，可安装验收。Release APK：`HEIKA-2.3.6-38-release-unsigned.apk`（19,632,132 bytes，SHA-256 `9f8345fb9d6b935a63c555cf3347a0ebcaae7d027279e51d097b28a9429e006f`）；构建通过但未签名，仓库无发布密钥/signingConfig，不可作为已签名正式分发包。
- 当前无连接的 Android 设备或模拟器（`adb devices` 为空），未完成实体设备视觉、动画帧率、跨 Android 版本模糊和广告端到端上传验收。Node/Gradle 检查与 APK 构建不能替代真机验收。未部署生产、未提交或推送。


## 当前动态基线与会员中心任务（2026-11-14）

- 当前开发目录 `/workspace/heika-native3-followup`，分支 `codex/native32-phase1`，HEAD `2f7c52ffb540dda5a8a5f02f80e2badca59d4dfc`。本轮从此工作区增量开发；此前用户未提交的 UI、翻卡、广告、弹窗和消息系统改动继续保留。当前所有工作仍在未提交工作区，没有切分支、重置、提交、推送、部署或应用生产迁移。
- 开发前核验的最近成功 GitHub Android workflow 为 Run #125（ID `43571640890`），同一源码 SHA，Android 版本 `2.3.6` / versionCode `38`。这是任务开始时的成功构建基线，不包含本轮未提交改动。
- 本轮会员中心与支持功能增量涉及：会员网页/Android 页面、会员状态和每日额度 API、卡密生成/预览/兑换 API、管理员会员管理、会员到期 Cron、Supabase additive migration、服务端密钥配置示例及相关自动化测试。实现范围、批次导出规则、管理员权限、Afdian 第一阶段手工配置步骤和未启用的订单 Webhook 记录在 `docs/membership-support-implementation.md`。
- 本地验证：`npm run typecheck` 通过；`npm test` 80/80 通过；`npm run lint` 退出码 0（51 条 lint warning，无 lint error）；`npm run build` 成功，Next.js 生产构建完成；`git diff --check` 复核通过。
- Android 源码将版本递增为 `2.3.6` / versionCode `39`，并添加对应关于页更新记录；这是待构建源码版本，不代表已生成发布包。Gradle 验证尝试因环境未安装 Android SDK 失败（无 `ANDROID_HOME`、`ANDROID_SDK_ROOT`、`sdk.dir` 或可用 SDK）；没有产出本轮 APK。无设备/模拟器，不代表完成原生 UI、键盘、兑换端到端验收。
- Supabase migration 尚未应用到任何环境，也未连接可用 PostgreSQL 做解析或事务测试；本地仅通过静态合同测试检查。此处无 Supabase 凭据。迁移必须先在 staging 审核运行再按项目流程部署。
- 未配置 `HEIKA_REDEEM_CODE_KEY` 与 `CRON_SECRET`；卡密生成/兑换 API 在服务端配置密钥前会按设计拒绝执行。爱发电第一阶段使用后台生成卡密并由运营者在对应商品随机回复中分发；未创建或核验真实赞助订单。爱发电自动订单/Webhook 接入仍待官方签名、订单查询规范与凭据验证，不能视为已完成。

## 交互提示、探索评分玻璃与主页翻卡流程（2026-11-14）

- 当前分支 `codex/native32-phase1`，本地 HEAD `c3a438bc342553be13ee3743a18474c4c192fa50`；`git ls-remote` 确认远端同名分支 SHA 一致。会员订单、Repository、NativeAction、AdminCenter 与会员兑换测试等已有未提交修改均保留。
- GitHub Actions API 返回 403，GH_TOKEN 无效，无法重新核验最新成功 Run；最近已记录的成功构建信息仍是上文 Run #125，但不视作本轮源码验证。本轮不构建 APK。
- 原生选择反馈经 `HeikaNoticeBus.showSelection` 接入发现筛选、搜索范围、评论排序、个人内容页签、资料选择、发布类型/分类/场景、通知筛选、探索选择和设置选项；连续选择会合并较早的选择提示。爱发电外链失败提示改用应用内横幅。
- 首页已翻卡列表点击改为打开大卡预览；确认翻开后等待服务端状态，再执行透视 `rotationY` 3D 翻转，加入轻微卡片按压和点击锁；预览 CTA 改为「确认查看」，卡片主体不导航详情。主页翻开卡片的评分徽标使用局部玻璃材质，统一徽标模糊半径调为 20dp。
- `git diff --check` 通过。没有运行 Android 编译、自动化测试、APK 构建或真机交互验收。

## 发现页广告模块细线排版与 GitHub APK 构建（2026-11-14）

- 参考用户提供的广告卡片图，发现页广告块改为 HEIKA 推荐眉题与喇叭图标、醒目标题、两行描述和右侧箭头，并增加低对比品牌金细描边。保留图片广告缩略图及整块点击打开作品。
- 为纳入本次 UI 改动及工作区中此前已授权的全部未提交实现，提交并推送 `codex/native32-phase1`。代码提交 `39eb2879a24a7ef6ba8081481a79c9daf3b6a3f6`，工作区干净。
- GitHub Actions Native Android Run #113（ID `43616451658`）成功：Android 单元测试、Lint、Debug 与 unsigned Release APK 构建、版本产物准备和上传均通过。Run：https://github.com/sunyu1590-create/fanka/actions/runs/43616451658
- Artifact `HEIKA-Native-3-v39eb2879a24a7ef6ba8081481a79c9daf3b6a3f6`，ID `14122179059`，ZIP 50,970,859 bytes，SHA-256 `c12ac506d433d54995c20109736058f591aa28c8d4188591033af3d81524022b`，有效至 `2026-11-28 16:42 UTC`。Artifact 页面：https://github.com/sunyu1590-create/fanka/actions/runs/43616451658/artifacts/14122179059
- 构建版本 `2.3.6` / versionCode `39`，applicationId `com.heika.community`。Artifact 含 `HEIKA-2.3.6-39-debug.apk` 与 `HEIKA-2.3.6-39-release-unsigned.apk`；Debug 用于安装验收，Release 未签名，仅供检查。没有本地 APK 路径，也未做真机验证。
