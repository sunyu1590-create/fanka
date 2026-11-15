# 黑卡 HEIKA

黑卡 HEIKA 是一个由个人开发和维护的内容探索社区，围绕每日翻卡、兴趣发现、阅读与交流展开。用户可以发现社区作品和 AI 资源，收藏、评分、评论、私信及发布内容；网页端与 Android App 共用账号和核心业务服务。

## 当前版本

- 网站：`3.0.0`
- Android：当前原生应用为 `native-android/` 中的 HEIKA Native 3.0，应用 ID 为 `com.heika.community`，版本 `2.3.6`（versionCode 40）。旧 `android/` WebView 工程仅保留兼容参考。
- 网站生产域名：`https://moonclean.shop`
- 托管与后端：腾讯云开发 CloudBase（云托管 + PostgreSQL），已停止使用 Vercel 与 Supabase。

## 最近更新

- **基础设施迁移到腾讯云开发**：数据库、对象存储、身份认证、AI 密钥保管全部迁入 CloudBase，站点运行在腾讯云云托管（上海）。
- 数据库由 `cloudbase/migrations/` 管理，共 75 个迁移文件，含 6 张会员相关表（`membership_plans`、`user_memberships`、`membership_redemptions`、`membership_events` 等）。
- 认证改为云开发身份认证：登录走网关 `/auth/v1/signin`，用户主键（bigint）通过 `cb_user_map` 映射为应用侧 uuid，使既有 RLS 策略继续生效。
- 注册由服务端调用腾讯云用户管理接口建号，用户侧仍为「邮箱 + 密码」。
- 前端数据访问改用 PostgREST 兼容层（`/v1/rdb/rest`），存储改用云开发存储（`/v1/storages`），不再向前端下发任何长期密钥。
- AI 密钥保险箱由 Vercel Blob 迁移到云开发私有存储桶 `heika-private`。
- 网站升级到 3.0.0，修复桌面端作品详情布局，并完善探索页广告与网页端 App 下载入口配置。
- 统一二级页面移动端导航显示，避免旧版悬浮导航残留。
- Android Native 3.0 接入 CloudBase 登录网关及当前 `/api/v1` 业务 API；消息和探索日历也由 CloudBase 服务端 API 统一鉴权。

## 项目结构

- `app/`、`components/`：Next.js App Router 页面、服务端 API 与网站界面。
- `lib/`：共享业务逻辑、数据访问、内容呈现与图片资源处理。
- `cloudbase/migrations/`：当前生效的数据库迁移（云开发 PostgreSQL）。
- `supabase/`：历史迁移，仅作参考，不再对生产环境执行。
- `native-android/`：当前 Kotlin + Jetpack Compose Android App。
- `android/`：旧 WebView 应用参考工程，不作为 Native 3.0 的打包来源。
- `mobile/`：Expo/React Native 辅助工程；HEIKA Native 3.0 APK 以 `native-android/` 工程为准。

## 本地开发

需要 Node.js 20.9 或更高版本：

```bash
npm ci
npm run dev
```

默认打开 `http://localhost:3000`。常用验证命令：

```bash
npm run typecheck
npm test
npm run build
```

Native 3.0 Android 校验与 APK artifact 由 `.github/workflows/android-apk.yml` 在对应分支或 PR 提交上构建。APK 只访问本仓库配置的 HEIKA/CloudBase 服务入口；正式分发仍需配置受保护的 Android 发布签名。

## 技术栈

网站使用 Next.js、React、TypeScript 与原生 CSS；后端业务通过服务端 API 访问腾讯云开发（CloudBase）的 PostgreSQL 与对象存储，身份认证使用云开发身份认证。Android 使用 Kotlin 原生应用容器，并复用网站账号与业务 API。数据库迁移位于 `cloudbase/migrations/`。密钥应通过云托管环境变量或 GitHub Secrets 配置，不得提交到仓库。

### 运行所需环境变量

| 变量 | 说明 |
| --- | --- |
| `TCB_ENV_ID` | 云开发环境 ID |
| `CLOUDBASE_GATEWAY` | 网关地址，形如 `https://<envId>.api.tcloudbasegateway.com` |
| `CLOUDBASE_APIKEY` | 云开发服务端 API Key（仅服务端使用） |
| `TENCENTCLOUD_SECRETID` / `TENCENTCLOUD_SECRETKEY` | 腾讯云子账号密钥，用于注册与改密 |
| `AI_SETTINGS_ENCRYPTION_KEY` | AI 密钥加密密钥（32 字节 base64） |
| `AI_SECRET_BUCKET` | AI 密钥存储桶，默认 `heika-private` |
| `NEXT_PUBLIC_AUTH_REDIRECT_URL` | 认证回跳地址，生产为 `https://moonclean.shop` |
