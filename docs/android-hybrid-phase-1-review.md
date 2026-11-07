# HEIKA Android 混合架构第一阶段审查

审查基于当前 `work` 分支和 `/workspace/fanka` 工作树。审查在 Android 代码修改之前完成。

## 架构审查

| 分类 | 现状 | 处理决定 |
| --- | --- | --- |
| Android 工程 | 没有 Android 目录、Gradle 工程、Activity、WebView 或 Manifest | 新建单 Activity Kotlin 容器；WebView 由 Activity 持有并按生命周期销毁/恢复 |
| Web 工程 | Next.js 15 App Router、React 19、TypeScript；`Community.tsx` 承载翻卡、发现、资料、评论、私信、发布和页面动画 | 保留成熟的 Web 业务，不重复实现原生业务界面 |
| Web 入口 | Vercel 项目 `fanka` 的生产域名为 `https://moonclean.shop/`；备用域名为 `https://fanka-two.vercel.app/` | 默认加载生产域名；Bridge 来源精确匹配构建时业务源 |
| 身份认证 | `browserDb()` 创建 Supabase JS 客户端；Web 端读取 Supabase Auth 会话并在 API 请求中使用 Bearer Token | 沿用 WebView 自己的 Web 存储和 Supabase 会话刷新；不向原生层暴露 Token |
| 内容和草稿缓存 | 页面有 `localStorage` 状态，发布图片草稿使用 IndexedDB；没有 Service Worker | 保留现有 Web 缓存；WebView 使用标准 HTTP 缓存，不增加重复原生图片缓存 |
| 图片和文件 | 页面直接加载图片；Web 发布使用文件输入、IndexedDB 备份和现有 API 上传 | 原生仅提供系统文件选择器给 WebView 文件输入；文件内容仍由 Web 业务上传 |
| 推送 | 有通知偏好和浏览器通知权限 UI；没有 FCM 依赖、设备令牌表/接口、消息推送服务 | 实现 Android 通知权限桥和通知/深链路由入口；第一阶段不虚构 FCM 服务端、Token 同步或业务通知 |
| 后端 | 有 Supabase 迁移和 API 路由；本阶段未发现需要新增的推送接口 | 不改生产数据库，不新增登录体系 |
| 诊断 | Web 有 Node/Playwright 测试；无 Android 崩溃或性能组件 | 加入本地崩溃摘要、启动/首屏计时、渲染进程和内存事件日志 |
| GitHub 构建 | 默认 `main` 起初没有 Android 工程或构建 workflow；远端 `android/phase-one`、`android/phase-two` 分支还包含 Expo `mobile/` 工程及旧 `build-android-apk.yml` | 已从两个遗留分支当前版本删除 `mobile/` 和旧 workflow；新 APK workflow 只在当前混合架构代码上构建 |

## 迁移清单

1. 保留 Web 客户端和 Supabase 会话、翻卡、消息、内容、资料及草稿逻辑。
2. 新建轻量 Android Kotlin 容器和单一 WebView 核心。
3. 使用受可信 origin 限定的 AndroidX WebKit 消息监听器；只提供通知权限、页面状态、返回和业务路由等有限消息类型。
4. 允许可信 HTTPS 业务页面在 WebView 内导航；对其他 HTTPS/HTTP、邮件和电话链接采用系统外部跳转；拒绝任意自定义 Scheme、明文混合内容和 SSL 错误继续访问。
5. 处理系统返回、进程重建、WebView renderer 终止、加载失败、Android 13 通知权限、文件选择器和前后台状态。
6. 保持 WebView 的标准 HTTP 缓存、本地存储和 IndexedDB；不复制会话或写入新敏感缓存。
7. 清理旧 Expo App 与 APK workflow；增加 GitHub Actions 构建 debug/release APK 并上传 artifact；不执行发布签名或 Play Store 发布。
8. 运行 Web 测试、类型检查、生产构建，并在可用时运行 Android 构建；设备测试限制单独记录。

## 风险与边界

- `README.md` 将当前状态描述为纯浏览器演示、未接 Auth；`docs/upgrade-status.md` 则称生产 Vercel/Supabase 已部署并应用迁移。文档对生产状态不一致，本阶段未读取任何密钥值，也不修改数据库；发布前需以当前生产配置和数据库状态复核。
- Android App 依赖网络和 `moonclean.shop` 部署状态；离线时显示可重试错误页。
- 仓库没有 FCM 凭据或服务端设备绑定协议，Android 13 通知权限本身不能产生远程推送。后台接收和退出/切换账号后的 Token 解绑需要后续后端与 Firebase 配置。
- 使用系统文件选择器，无额外共享存储权限；当前没有专门的相机采集或下载管理实现。
- 本环境未发现 Android SDK、ADB 或模拟器，不能在此运行真实设备生命周期、键盘、通知权限或弱网验收。
- GitHub Actions 产物是供安装验证的 APK，不含发布签名；对外发布需要由项目所有者配置 Android 签名密钥和发布流程。
- 远端旧分支的清理通过新提交完成，提交前的历史仍可用于回滚；新 workflow 对应的混合架构分支单独构建，不复用 Expo 构建链。

## 回滚

删除新增的 `android/`、`.github/workflows/android-apk.yml`、`lib/native-bridge.ts`、本文件及 `docs/android-build.md` 即可回到默认分支本阶段前状态。旧 Expo 分支内容可分别通过恢复到清理前的提交 `a19f450a51a1a50ad12e18437251579e0a4a0ebc`、`d226bcf4218d79640164df8a0154d8a7f7854bae` 撤回。Web 的 Supabase schema 和生产数据不会被更改。
