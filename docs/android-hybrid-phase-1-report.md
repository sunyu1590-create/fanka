# HEIKA Android 混合架构第一阶段实施报告

## 架构与迁移结果

- Android 使用单 Activity Kotlin 容器和单一 WebView。Web 继续承载翻卡、发现、消息、资料、发布、认证和 Supabase 业务。
- `MainActivity` 管理 WebView 生命周期、页面状态恢复、系统返回、文件选择器、通知权限、Deep Link、加载失败和渲染进程退出恢复。
- `WebViewCore` 只允许 HTTPS 业务源、启用 JavaScript/DOM Storage/标准 HTTP 缓存，禁用混合内容和 file URL 访问；硬件加速开启，第三方 Cookie 关闭。
- WebView 销毁时清除 Activity 回调和文件选择回调；不通过静态变量或 Activity Context 保活。
- 登录继续由现有 Supabase Web 客户端维护，使用同一 Web origin 的 WebView 本地存储和 Cookie；不把访问令牌送进原生层，也不另建 Android 登录系统。
- 内容缓存继续使用浏览器 HTTP cache、DOM Storage 和现有 IndexedDB 草稿文件存储。不新增重复图片缓存或普通文件中的敏感身份数据。

## Bridge 与导航

- AndroidX WebKit 消息监听器限制为精确可信 HTTPS origin、主 frame 和协议版本 1。
- 消息采用固定 allowlist、请求 ID、参数范围校验、有限结果状态和超时；不暴露通用原生方法调用，也不接受可执行 JavaScript 字符串。
- 当前消息覆盖能力查询、Android 通知权限、页面状态、系统返回、通知路由确认及图片失败诊断。
- Web 路由处理详情页、标签页、消息会话和覆盖层返回。原生只在 Web 不消费返回事件后才使用 WebView 历史作为兜底。
- 外部网页、邮件和电话链接通过系统 Intent 打开；除明确允许的私信链接外，其他自定义 Scheme 和 SSL 错误会被拦截。

## 推送、缓存和系统能力边界

- 仓库原有后端没有 FCM sender、设备 Token 表或 Token 注册/解绑 API。因此本阶段只实现 Android 13+ 通知权限、稳定 Intent 消息 ID 去重和页面就绪后的安全业务路由；没有伪造 FCM 收件服务或数据库接口。
- 当前可路由的业务 Deep Link 为 `/?post=<安全整数>`、`/?auth=reset` 和 `/?conversation=<UUID>`。同时兼容旧客户端的 `heika://chat/<conversation-id>`，并在 Web 会话列表加载后确认该会话属于当前登录用户再打开。
- 没有独立原生 `CacheManager`：当前图片、草稿和内容均由 Web 端现有机制管理。原生文件缓存暂不需要，避免重复存储和账号隔离问题。
- 使用系统文件选择器选择图片/视频，不申请广泛存储权限。备份和设备迁移规则排除 WebView 会话及用户本地数据。

## 稳定性与诊断

- Activity 正常重建时仅恢复可信 HTTPS 业务路由；若保存状态指向本地或其他不可信 URL，则丢弃该状态并重新加载 Web 入口。Renderer 异常最多自动重建一次/分钟，之后提供明确重试页。
- 网络超时、主页面加载错误、HTTP 错误、SSL 错误、外链 Scheme、Bridge 错误和资源错误都有独立诊断事件。
- 记录进程启动到 Web 内容可见/Bridge 可交互耗时、内存 trim 事件、前次 ANR/崩溃退出原因；未记录密码、令牌、私信正文。
- 未新增服务端数据表、迁移或用户数据清理操作。

## 文件索引

- 审查和迁移清单：[android-hybrid-phase-1-review.md](android-hybrid-phase-1-review.md)
- Kotlin 容器、Bridge 和诊断：`android/app/src/main/java/com/heika/android/`
- Web 消息协议：[native-bridge.ts](../lib/native-bridge.ts)、`components/Community.tsx`、`components/Messages.tsx`
- GitHub Actions 与构建说明：[android-apk.yml](../.github/workflows/android-apk.yml)、[android-build.md](android-build.md)

## 第二阶段动画协定

本阶段不实现原生动画系统，也不逐帧传输动画数据。未来可以在现有版本化 Bridge 上增加单独 allowlist：

- Web → Android：`animation.request`，字段为 `animationId`、`type`（如 `card.flip`、`card.expand`）、稳定 `objectId`、`fromState`、`toState`。
- Android → Web：`animation.result`，字段为 `animationId`、`status`（`completed`、`cancelled`、`failed`）、最终业务状态和可选错误码。
- 原生动画执行期间由原生独占视觉对象；Web 不同时驱动同一对象。取消、页面销毁及失败都必须产出终态事件。业务真相仍由 Web/服务端持有。

## 构建、测试与验收记录

- `npm test`：17/17 通过；`npm run typecheck`：通过；`npm run build`：通过。Next 构建仍报告项目原有的未使用变量、图片标签和 Hook dependency ESLint 警告。
- `:app:assembleDebug`、`:app:assembleRelease`、`:app:lintDebug`：通过；Android lint 为 0 errors、0 warnings。debug APK 使用 debug key 签名，release APK 未签名。
- 现有 Playwright P0 套件 4 项中 1 项通过、3 项失败：主题变量期望 `#F8F7F4` 实际为 `#FFFFFF`；设置测试找不到“单列阅读”按钮；管理员测试找不到“内容审核”标题。这些是当前 Web 验收失败项，本阶段未改动对应 UI；尚未对原始基线运行同一套件，不能断言其是否早已存在。
- 当前环境的 `adb devices` 无设备，且没有安装 emulator；未能在真实设备完成 Android 13 通知权限、进程回收、弱网、键盘和长时间内存测试。
- GitHub Actions workflow 会在 PR 更新时运行 Web 校验与 Android APK 构建；`HEIKA-debug.apk` 和 `HEIKA-release-unsigned.apk` artifact 可从 [PR #1 的 Checks/Actions](https://github.com/sunyu1590-create/fanka/pull/1) 下载，保留 14 天。
- Android 包名延续旧客户端 `com.heika.community`，修复版本 `2.2.1`、versionCode 7、minSdk 26、targetSdk 35。GitHub debug APK 使用 debug key；若旧安装使用发布密钥签名，则需正式发布签名包才能覆盖升级。当前 release artifact 未签名。
- 弃用 Expo 工程已从 `android/phase-one` 与 `android/phase-two` 当前树清除。`publish-vercel` 仍是 Vercel 生产部署分支，其 47 个旧文件的删除已放入 [draft PR #2](https://github.com/sunyu1590-create/fanka/pull/2)；未合并，避免未经确认触发生产站点重部署。

旧 Expo 客户端的私信提醒依赖其进程中的 Supabase Realtime 订阅并发送本地通知；它不是 FCM 远程推送。真实设备后台推送投递和 Token 账号绑定仍需 Android 设备、Firebase 与后端服务端接口配置；当前后端没有 FCM 服务。

## 回滚

- 默认分支阶段改造可通过移除新建 `android/`、`.github/workflows/android-apk.yml`、`lib/native-bridge.ts`、本报告和构建文档回退；Web Bridge 改动按 Git revert 单独撤销。
- 远端旧 Expo 分支的清理提交为 `19148f61020d5128935f16faa5e2f680e9191e9c` 和 `82eadb2c70d9ba7c26f85f30f422c9d256fc63ad`。清理前历史仍在，可恢复到 `a19f450a51a1a50ad12e18437251579e0a4a0ebc` 和 `d226bcf4218d79640164df8a0154d8a7f7854bae`。
- 当前改造作为独立 draft PR 供审查，尚未合并到默认分支；Web 生产部署和 Supabase 数据不因此改动。
