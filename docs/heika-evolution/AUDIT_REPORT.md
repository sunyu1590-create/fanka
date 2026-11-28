# AUDIT_REPORT · 全应用审计基线报告

> 审计时间：2026-11-28 08:19–08:21 (Asia/Shanghai)
> 基线：Web 2.69.0 (d49f9d6) / Android-Native 2.34.0 (code 103)
> 审计方式：生产服务器只读扫描（Git / 文件系统 / Docker / 路由清单）

---

## 1. 生产基线

| 项 | 值 | 证据 |
|---|---|---|
| Git HEAD | d49f9d6 (main ↔ origin/main 一致) | git log |
| Web 版本 | 2.69.0 | package.json / public/sw.js 一致 |
| 工作树 | 干净（仅 Caddyfile.bak.cc30 有意未跟踪） | git status |
| 应用容器 | fanka, fanka-ai-worker（镜像 fanka:latest，同一新镜像） | docker ps |
| 回滚锚点 | fanka-metrics 运行 d05390eeb0a0（= fanka:e0cf7f7 = rollback-chat2-2baa063） | docker ps |
| 基础设施 | caddy:2-alpine / postgrest v14.18 / storage-api v1.89.12 / gotrue v2.197.0 / realtime v2.148.3 / postgres 17.6.1.136 | docker ps |
| 磁盘 | 40G 总量，18G 已用 (46%)，21G 可用 | df -h |

---

## 2. Web 端结构

### 2.1 页面（App Router，共 6 个）

| 路由 | 文件 | 说明 |
|---|---|---|
| / | app/page.tsx | 社区单页主入口（首页/精选/AI/合集/商城/详情/发布/个人中心/设置/聊天均以内部视图承载） |
| /download | app/download/page.tsx | 客户端下载页 |
| /link-warning | app/link-warning/page.tsx | 外链安全提示页 |
| /membership | app/membership/page.tsx | 会员中心 |
| /membership/redeem | app/membership/redeem/page.tsx | 会员兑换 |
| /p/[id] | app/p/[id]/page.tsx | 文章独立详情页（与浮层共用组件） |

### 2.2 API（共 200 个 route.ts）

| 分组 | 前缀 | 覆盖范围 |
|---|---|---|
| 用户端 | app/api/v1/* | auth, posts, series, comments, search, recommendations, messages, notifications, ai-space, memberships, media, drafts 等 |
| 管理端 | app/api/v1/admin/* | access-codes, ai-space, ai-tasks, membership, moderation, nexus, home-banners, metrics 等 |
| 内部 | app/api/v1/internal/* | ai-tasks/process, budget-check, health, metrics |
| 杂项 | — | client-config, demo/cards, library-comments, dl/[file] |

> 待做（阶段六）：逐个核对前端调用点，标记『界面有入口但无接口』『接口存在但前端未用』『虚假/硬编码数据』三类问题。

### 2.3 组件（约 100+）

- 管理系列：AdminAITasks, AdminMembership, AdminNexus, AdminAccessCodes 等（admin/ 子目录）
- 业务组件：AISpace, MembershipCenter, ComposerPanels, CoExplore, Community, ReaderTocAside 等
- 三维可视化：nexus/ 子目录
- 待做（阶段一后段）：比对页面引用，找出未引用的废弃组件。

---

## 3. 三端工程有效性（关键澄清）

| 目录 | 身份 | 版本 | 最后提交 | 结论 |
|---|---|---|---|---|
| android-native/ | **当前正式底包**（Kotlin + Jetpack Compose, HEIKA Native 3.0） | versionCode 103 / 2.34.0 | 2026-11-27 2baa063 | ✅ 有效工程 |
| android/ | 旧 WebView 壳 | versionCode 42 / 2.4.0 | 2026-11-21 8fbaa4e | ⚠️ README 明示为 reference project，不打包不启动 |
| mobile/ | Expo 工程 | — | 2026-11-21 8fbaa4e | ⚠️ 与 android/ 同日停更，疑废弃，待最终确认 |

### 3.1 android-native 要点（README 摘要）
- Application ID：com.heika.community
- 纯原生 Compose，无 WebView 宿主与 JS bridge
- 会话凭证存 Android Keystore 加密存储；登录/刷新走 /api/client-config 提供的 CloudBase auth 网关
- 业务全部复用 /api/v1 既有路由；私信走 /api/v1/messages
- 构建命令：./gradlew testDebugUnitTest lintDebug assembleDebug assembleRelease
- **Release 未签名**：正式签名证书需通过 GitHub Secrets 提供，当前 release 产物不是生产升级包（风险 R1）
- README 自述 2.21.0/81 与 gradle 实际 2.34.0/103 不一致，README 声明『Gradle file wins』（风险 R2）

---

## 4. 基础设施清单

| 服务 | 镜像 | 状态 |
|---|---|---|
| caddy | caddy:2-alpine | Up 2 days |
| supabase-rest | postgrest/postgrest:v14.18 | Up 2 days |
| supabase-storage | supabase/storage-api:v1.89.12 | healthy |
| supabase-auth | supabase/gotrue:v2.197.0 | healthy |
| realtime | supabase/realtime:v2.148.3 | healthy |
| supabase-db | supabase/postgres:17.6.1.136 | healthy |

---

## 5. 后续审计入口

| 待审计项 | 方式 | 所属阶段 |
|---|---|---|
| 数据库主要实体与慢查询 | postgres 容器内 psql 只读查询 | 阶段一后段 / 十 |
| 页面真实操作检查（按钮无反馈/接口未接通/虚假数据） | HTTP 探测 + 代码核对 | 阶段二 |
| 200 个 API 的前端引用核对 | grep 调用点比对 | 阶段六 |
| 废弃组件识别 | 引用计数 | 阶段一后段 / 十一 |
| Nexus 真实数据绑定核验 | 代码 + 接口比对 | 阶段七 |

---

## 6. 审计结论摘要

1. 生产与 Git 代码一致，基础设施健康，磁盘余量充足，可在当前基础上直接开展工程。
2. 三端身份已澄清：Web 主站 + android-native 为双主线；android/ 与 mobile/ 为历史遗留，不得在其上开发。
3. Web 端为『单页社区 + 5 独立页』架构，200 个 API 是全功能后端，阶段六需完成接入状态全量核对。
4. APK 正式签名凭据可用性为最大外部阻塞点（R1），需尽早确认。
