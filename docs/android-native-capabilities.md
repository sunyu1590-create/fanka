# HEIKA Android 原生能力接口

Web 业务继续由现有 Next.js 应用承担；只有受精确 HTTPS origin 白名单保护的 Android WebView 主页面能调用 `HeikaNative` Bridge。当前允许 `moonclean.shop`、`www.moonclean.shop` 和 `fanka-two.vercel.app`。

## 通知

| 请求 | 输入 | 返回 | 行为 |
| --- | --- | --- | --- |
| `notifications.status` | 无 | `permission: default/granted/denied`、`enabled` | 读取 Android 运行时授权与系统总开关；不把浏览器 `Notification.permission` 当成 App 状态 |
| `notifications.requestPermission` | 无 | `granted`、`enabled`、`permission` | 仅由用户打开提醒开关时调用；Android 13+ 首次显式请求。用户拒绝后不重复弹窗，引导去系统设置 |
| `notifications.openSettings` | 无 | `opened` | 打开黑卡应用的 Android 通知设置；返回 App 后重新读取真实状态 |

网站内部的消息/评论/每日提醒偏好与 Android 系统总授权是两种状态。网页浏览器继续使用 Web Notifications；Android 环境不创建 `new Notification()`。当前没有 FCM sender、Firebase Android 配置、设备 Token 注册表或推送密钥，因此后台远程推送**尚未接通**，偏好开关只保存用户选择，不代表消息会送达。

接通后台推送时应沿用现有 `dm_messages`、评论和用户提醒偏好，新增 Android FCM token 的账号绑定/解绑 API；Token 仅在认证用户会话内注册，退出/切换账号时撤销旧绑定。推送发送由受信服务端完成，客户端不能持有服务端密钥。完成前不在 Android 假造通知送达。

## 系统分享

`system.share` 接收 `{title, text, url}`。原生端限制标题/正文长度，拒绝非 HTTPS、非白名单 host、未支持的业务路由或带用户信息的 URL，再通过 `ACTION_SEND` 打开 Android 系统分享面板。Bridge 不可用时 Web 端回退到浏览器分享或复制链接。

## 相册和文件

Web `<input type=file accept="image/*">` 使用 AndroidX Photo Picker；多选最多 9 个，与现有发布上限一致。图片/视频混选时使用 Photo Picker 的混合模式；其他文件类型回退到 `ACTION_OPEN_DOCUMENT`。没有新增广泛媒体读取权限，选择结果仍交给现有 Web 上传接口和草稿逻辑处理。

## 本地快捷入口与离线缓存

长按 Android 桌面应用图标会显示「今日翻卡」快捷入口，使用现有受信 `https://moonclean.shop/` 路由回到首页今日卡片，不复制翻卡业务逻辑。发现流和公开详情继续使用现有 IndexedDB 缓存（8 MiB 总上限、单条 768 KiB、最多 7 天）；缓存数据可在页面 Shell 与资源可用时离线恢复。应用不宣称已下载原图，也不保证首次访问/已淘汰内容可离线阅读。

## 页面加载恢复

Bridge 使用 `WebViewCompat.addWebMessageListener` 的精确 origin 规则。即使某个受信页面未完成 Bridge 握手，`onPageCommitVisible` 后也只等待 2 秒；然后记录 `web_bridge_ready_timeout` 并展示已提交页面。此降级不允许未知域名调用 Android 能力。
