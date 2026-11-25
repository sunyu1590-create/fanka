# 黑卡 HEIKA

HEIKA 是内容探索社区，网页端与原生 Android App 共用账号和核心业务 API。当前工作主线是 GitHub `main`；本文件记录该分支的实际工程结构，旧部署说明不再作为构建依据。

> **Supabase 已弃用（2026-11-23）**
> 本项目不再使用 Supabase：不接入 Supabase 云服务，也不把自建套件作为新增功能的方案。
> 新增代码不得引入 `@supabase/*`，不得新增 `/auth/v1`、`/rest/v1`、`/storage/v1` 语义的调用；
> 部署脚本不得再调用 Supabase CLI。现有容器仅作维持性运行，替换方案另行排期。
> 完整说明见 `docs/supabase-deprecated.md`。

## 当前版本

- 网页端：`2.65.0`，版本号位于 `package.json`，更新内容位于 `lib/release-notes.ts`。
- Android 原生端：`2.29.0`（`versionCode` 96），以 `android-native/app/build.gradle.kts` 为准。
- 当前网站域名配置：`https://moonclean.shop`。更改生产目标前，先检查 `Caddyfile`、Compose 文件和远程环境，不要从旧文档推断。

## 工程结构

- `app/`、`components/`：Next.js App Router、网页界面及 `/api/v1` 服务端路由。
- `lib/`：内容、鉴权、服务端数据访问、附件、AI 服务及共享业务逻辑。
- `supabase/migrations/`：数据库变更脚本。生产迁移必须由部署审核者先检查再执行。
- `android-native/`：当前发布工作流采用的 Kotlin / Jetpack Compose 原生 App；没有 WebView 容器。
- `android/`、`mobile/`：遗留或独立参考工程，不是当前主 Android APK 工作流的构建源。
- `scripts/ai-task-worker.mjs`：容器内 AI 任务队列工作进程。
- `Dockerfile`、`docker-compose.yml`、`Caddyfile`：现有容器、工作进程和反向代理配置。

## 当前服务依赖

- 网站 API 服务通过 Supabase SDK 访问 Auth、Postgres 和 Storage；主服务密钥仅供服务端使用。不要在网页变量或 APK 中放入服务密钥。
- Android 登录与账号令牌通过现有 CloudBase 账号网关及 HEIKA API；App 继续复用 `/api/v1` 业务服务。
- DeepSeek API 密钥由管理员在后台保存，使用 AES-256-GCM 加密后写入 Supabase 的 `app_secrets` 表（仅 `service_role` 可访问），不再依赖 Vercel Blob 或服务器本地文件；明文只在应用进程内存中出现。
- 当前 Compose 配置包含 `app`、`ai-worker`、`caddy`。交接 AI 必须核验目标机现有容器、域名、数据服务和环境后再部署。

## 本地检查

网页端需要 Node.js 22：

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run build
```

Android 工程在 `android-native/`，需要 Java 17、Android SDK 35 和 Gradle 8.11.1：

```bash
cd android-native
./gradlew --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

主 APK 工作流为 `.github/workflows/android-apk.yml`。Debug APK 使用 CI 调试签名；Release APK 在没有正式签名配置时为未签名预览包，不可作为生产升级包。

## 相关环境变量名称

实际部署前以 `lib/`、`Dockerfile`、`docker-compose.yml` 和目标服务器 `.env` 为准。常见名称包括：

- `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`（兼容旧名 `SUPABASE_SECRET_KEY`）
- `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`NEXT_PUBLIC_AUTH_REDIRECT_URL`、`PUBLIC_BASE_URL`
- `AI_SETTINGS_ENCRYPTION_KEY`、`AI_TASK_WORKER_TOKEN`

仓库只记录变量名和占位配置，禁止提交任何真实密钥。AI worker 需要与主服务配置相同的 `AI_TASK_WORKER_TOKEN`。

## 媒体与 AI 总结约定

- 图片上传统一走 `lib/media-upload.ts`（网页）与 `HeikaRepository.uploadImage`（APP）：`XMLHttpRequest.upload.onprogress` / OkHttp `ForwardingSink` 逐字节计数，只展示真实百分比；字节发完后进入「服务器处理中」，不提前显示 100%。
- 并发上限 3。一次选 9 张时同时开 9 条上传会把上行带宽抢空，表现为「卡住不动」，因此两端都限制为 3 路并发并保留可重试的失败态。
- 视频上传已下线：网页与 APP 均不再提供入口，`/api/v1/media` 与 `library-state` 收到视频类型直接返回 `410`。
- AI 总结的提示词由 `lib/summary-style.mjs` 按标题与正文判定题材（情感随笔、科普知识、教程实操、评论观点、叙事故事、资讯报道、商业产品、生活记录），再与通用约束组合；新增题材只需要在该文件里加一条规则。
- 摘要类模型的 `max_tokens` 需要覆盖推理过程，`deepseek-flash` 给到 3000（审核 2000、分类 1600），过低会返回 `empty_output`。

## 首页推荐位与合集封面

两块能力共用同一套「APP 原生展示、网页编辑、后端统一存储」的结构，原生端不提供管理后台。

- **首页多媒体推荐位**：位置在翻卡额度下方、卡池上方。内容为图片与视频混排的单一有序池，自动轮播；只有一条时不显示指示器，没有内容时整块不渲染。轮播高度只由配置决定（`size_mode=ratio` 时按宽高比换算，`size_mode=custom` 时用四端各自的高度），不随媒体比例变化。
- **后台入口**：网页端 `/?admin=1` → 管理后台 → 运营位 → 「首页推荐位」，可增删内容、调顺序、设投放时间与四端尺寸，右侧是手机/平板/电脑/APP 四端实时预览。
- **合集封面**：24 套官方模板（`swiss` / `glass` / `magazine` / `minimal` / `literary` / `studio` 六系列），四种来源：上传、套模板、按标题自动生成、提取合集内作品图。统一 3:4、600×800，程序化生成，不调用 AI。
- **封面入口**：网页端合集页 → 「封面设置」，或在 APP 合集更多菜单点「封面设置」跳网页编辑页（`/series/{id}/cover?app=1&requireAuth=1`），保存后原生列表通过 `coverUpdated` 桥接事件即时刷新。
- **后台管理**：管理后台 → 运营位 → 「合集封面」，可查看覆盖率、模板启停、发起历史封面补齐任务并查看每条记录的结果。

生成封面依赖中文字体：运行镜像必须安装 `fonts-noto-cjk`（`Dockerfile` runner 阶段已装）。`lib/server/series-cover.ts` 启动时会用 `fc-match` 自检，缺字体直接报错，不会静默输出方块字。

新增迁移 `supabase/migrations/20261125180000_home_banners_and_series_covers.sql`、`20261125181000_cover_storage_buckets.sql`。执行后必须 `NOTIFY pgrst, 'reload schema'`，否则 `/api/v1/home-banners` 与 `/api/v1/cover-templates` 会返回「table not found in schema cache」。

## 迁移与部署纪律

代码提交、构建成功、数据库迁移、服务器部署、Android 真机验证是不同状态。本仓库任务不代表生产迁移或部署已执行。应用新迁移前，部署审核者应确认备份、当前 schema 版本、DDL 和回滚方案；禁止在生产数据库直接运行未审查脚本。
