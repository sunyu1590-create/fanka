# 黑卡 HEIKA

HEIKA 是内容探索社区，网页端与原生 Android App 共用账号和核心业务 API。当前工作主线是 GitHub `main`；本文件记录该分支的实际工程结构，旧部署说明不再作为构建依据。

## 当前版本

- 网页端：`2.51.0`，版本号位于 `package.json`，更新内容位于 `lib/release-notes.ts`。
- Android 原生端：`2.12.0`（`versionCode` 66），以 `android-native/app/build.gradle.kts` 为准。
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
- DeepSeek API 密钥由管理员保存后使用 AES-256-GCM 加密，并存放在 `@vercel/blob` 私有对象中。该 SDK 是代码中的密钥存储依赖，不表示网站部署在 Vercel。
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
- `AI_SETTINGS_ENCRYPTION_KEY`、`BLOB_READ_WRITE_TOKEN`、`AI_TASK_WORKER_TOKEN`、`NEXT_PUBLIC_VIDEO_UPLOAD_BETA`

仓库只记录变量名和占位配置，禁止提交任何真实密钥。AI worker 需要与主服务配置相同的 `AI_TASK_WORKER_TOKEN`。

## 迁移与部署纪律

代码提交、构建成功、数据库迁移、服务器部署、Android 真机验证是不同状态。本仓库任务不代表生产迁移或部署已执行。应用新迁移前，部署审核者应确认备份、当前 schema 版本、DDL 和回滚方案；禁止在生产数据库直接运行未审查脚本。
