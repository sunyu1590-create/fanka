# 黑卡 HEIKA

黑卡 HEIKA 是一个围绕每日翻卡、兴趣发现与社区交流构建的内容产品。用户可以探索推荐内容、阅读帖子与 AI 资源、收藏和评分内容，并参与评论、私信、发布及会员相关功能。

## 当前版本

- 网站：`2.40.7`（`publish-vercel` 同步到 `main`）
- Android：原生应用工程保留在 `android/`，应用 ID 为 `com.heika.community`；当前底包版本为 `2.2.3`。
- 网站生产域名：`https://moonclean.shop`

## 最近更新

- 网站升级到 2.40.7，包含发现内容、AI 空间、会员、通知、资料和社区 API 的持续完善。
- 更新全局动效与页面视觉一致性，优化公开主页及玻璃质感底部导航。
- 保留 Android 原生关于页、通知权限与偏好设置、缓存刷新能力。
- 保留首页已翻开卡片的冷启动恢复修复：账号隔离持久化、稳定图片引用、网络恢复后的内容同步与图片重试。

## 项目结构

- `app/`、`components/`：Next.js App Router 页面、服务端 API 与网站界面。
- `lib/`：共享业务逻辑、数据访问、内容呈现与图片资源处理。
- `supabase/`：数据库迁移、策略及相关配置。
- `android/`：Kotlin Android 应用、WebView 容器及原生系统能力。
- `mobile/`：Expo/React Native 辅助工程；APK 正式构建以 `android/` 原生工程为准。

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

Android APK 由 `.github/workflows/android-apk.yml` 中的 GitHub Actions 工作流构建。构建应使用最新成功的 Android 原生源代码版本，并从 `publish-vercel` 获取网站代码；不要从落后的 `main` 版本单独选取网站源代码。

## 技术栈

网站使用 Next.js、React、TypeScript 与原生 CSS；后端业务通过服务端 API 访问 Supabase。Android 使用 Kotlin 原生应用容器，并复用网站账号与业务 API。数据库迁移位于 `supabase/migrations/`。密钥应通过部署环境变量或 GitHub Secrets 配置，不得提交到仓库。
