# HEIKA Evolution · 执行日志

> 只记录已执行并已验证的工程动作；未验证项明确标注。

## 2026-11-28 · 批次 A：Web 2.71.0 动效令牌下沉

| 项 | 结果 |
| --- | --- |
| 静态页生成 | 104/104 成功 |
| 首建耗时 | 构建层 12 DONE 222.0s |
| 镜像 | fanka:2.71.0 = fanka:latest = 7aa818f73976（641MB） |
| 线上校验 | moonclean.shop 200；容器内与线上 sw.js 均 VERSION 2.71.0 |
| 变更范围 | 11 个 CSS 文件 42 处硬编码过渡改语义令牌 + 3 项缺陷修复 |

### Dockerfile 缓存改造验证

- 新增 docker/dockerfile:1 语法声明；npm ci 与 npm run build 分别挂载 /root/.npm、/app/.next/cache 缓存。
- 同版本重建 20/20 层全部 CACHED，镜像导出 1.7s（对比全量约 11 分钟）。

## 2026-11-28 · 批次 B：Android 2.35.0 / vc104

| 项 | 结果 |
| --- | --- |
| Gradle | BUILD SUCCESSFUL in 7m 40s（54 tasks） |
| 产物 | app-release.apk 30M |
| 签名 | apksigner verify 通过，CN=HEIKA；cert SHA-256 c978400e…bb1f |
| badging | com.heika.community / versionCode 104 / versionName 2.35.0 / compileSdk 35 |
| SHA-256 | 516a4cac77174e20ecd1acd91ce31b7f7572cc203ed4d063d28e0e36e6cb56d6 |
| 分发 | /home/ubuntu/downloads/heika-native-2.35.0-code104.apk 与 heika-native-latest.apk 软链 |

## 2026-11-28 · 批次 C：工程优化与清理

- ESLint：15 文件 +63/-24，清除 34 个未使用 import，关闭 no-img-element，新增 vars/argsIgnorePattern 为下划线前缀；47 条 unused-vars 保留为 warn。
- ai-worker：失败指数退避 2s→4s→8s→16s→30s 封顶，成功即重置。
- 磁盘：删除旧镜像与 7.52GB BuildKit 缓存，27G/72% → 20G/52%。
- Git：commit fb99aa7 已推送。

## 2026-11-28 14:00+ · 批次 D：本轮新增（待办闭环 + P0 修复）

### D1 ai-worker 恢复确认（待办 1 闭环）

- docker inspect：StartedAt 2026-11-28T05:43:58Z，RestartCount 为 0。
- 日志总数仅 1 行：request failed (TypeError), retry in 4000ms，即容器启动瞬间 app 尚未就绪那一次。
- 源码确认：ai-task-worker.mjs 成功路径不打印日志，只有失败才输出。
- 独立验证：容器内用自身环境变量请求内部端点，返回 HTTP 200 且 data.processed 为 false。
- 结论：退避生效并已恢复正常轮询，无持续 TypeError。

### D2 manifest.json 核对（待办 2 闭环 + 新问题）

- native 条目 2.35.0 / code 104 / size 30673387 / sha256 516a4cac…56d6 与 APK 完全一致。
- 发现缺陷：webview 条目指向 heika-webview-latest.apk，该文件在 downloads 目录不存在，线上对应地址返回 404，下载页仍渲染「兼容版」按钮，用户点击必然失败。
- 处置：备份 /tmp/manifest.json.bak.2350，用一次性 Node 脚本移除 webview 键（仅此一项，保留原缩进），校验 JSON 合法且 native 完整。
- 线上复核：下载页 200，页面中 heika-webview 引用数为 0，正文出现 2.35.0 与 build 104；app-version 接口返回 version 2.35.0 / code 104 / apk 直链正确；APK 直链 200 且 content-length 30673387 与 manifest 一致。
- 影响面确认：app-version 路由只读取 manifest.native，移除 webview 不影响客户端版本检查。

### D3 桌面文章详情页正文宽度实测（强制验收项）

工具准备：安装 Playwright 1.64.1 的 Chromium；首启失败定位到缺 libgbm.so.1；安装 libgbm1 后 ldd 缺失库归零，无头浏览器可正常启动。

测量中发现真正的 P0 缺陷：全新无痕上下文打开 /p/1000160 时，页面被首访兴趣引导整页替换（app、detail、detail-article-column 均不存在，可见文本为首访引导文案）。根因：Community.tsx 的 deepLink 判断只检查 window.location.search 的查询参数键，而作品分享链接是路径形式 /p/<id>（无查询参数），因此被判为非深链，新设备必然先撞引导页。

修复：deepLink 增加路径首段白名单 p / post / series / download / membership / link-warning。改动前备份 /tmp/Community.tsx.bak.onboarding，grep 计数确认目标块唯一，编辑返回 replace_count 为 1。

### D4 版本递增与发布

- package.json 2.71.0 → 2.72.0；public/sw.js 的 VERSION 同步为 2.72.0（备份 /tmp/package.json.bak.271、/tmp/sw.js.bak.271）。
- lib/release-notes.ts 新增 2.72.0 条目（2 条，均为本轮真实修复）。
- 校验：tsc --noEmit 退出码 0，无类型错误；单文件 ESLint 为 0 error / 36 warning（均为既有告警）。

### D5 构建与部署

| 项 | 结果 |
| --- | --- |
| 构建参 | 从 .env 注入 3 项 NEXT_PUBLIC + APP_VERSION=2.72.0 |
| 编译 | Compiled successfully in 58s |
| 静态页 | Generating static pages 104/104 |
| 构建层 | 15 DONE 287.3s |
| 新镜像 | fanka:2.72.0 = fanka:latest = 2dfe01fe61a3（641MB） |
| 部署 | docker compose up -d --no-deps app ai-worker metrics-agent，三容器 Recreated 并 Started |
| 回滚点 | fanka:2.71.0（7aa818f73976）、fanka:rollback-chat2-2baa063（d05390eeb0a0）均保留 |

### D6 线上验收

- 首页 200；线上 sw.js 首行为 VERSION 2.72.0。
- 容器内健康检查：ok 为 true，database 5–20ms，media_storage 13–14ms。
- ai-worker 重启后仍仅 1 行启动期日志，内部端点返回 200。
- 正文宽度三断点实测（全新上下文，onboardBlocked 均为 false）：

| 视口 | detail-body 宽 | 正文列 | Markdown | 封面 | 侧栏 | 段落宽 | 横向溢出 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1280 | 1217（56 + 747.9 + 300） | 748 | 748 | 748 | 300 | 748×3 | 无（scrollW 1280） |
| 1440 | 1369（200 + 44 + 706.7 + 280） | 707 | 707 | 707 | 280 | 707×3 | 无（scrollW 1440） |
| 1920 | 1638（200 + 52 + 760 + 300） | 760 | 760 | 760 | 300 | 760×3 | 无（scrollW 1920） |

结论：三档桌面视口正文实际阅读宽度 707–760 CSS px，落在 680–760 目标区间；封面宽度与正文列解耦，侧栏与目录占用独立网格列，未压缩正文。

### D7 提交

- commit c28ac76（4 files, +15/-3）已推送 fb99aa7..c28ac76 到 main。
- 变更文件：components/Community.tsx、lib/release-notes.ts、package.json、public/sw.js。未纳入 Caddyfile.bak.cc30（本地备份，非本次改动）。

### D8 全站真实巡检（375 / 1440）

| 视口 | 路径 | 状态 | 横向溢出 | 引导拦截 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 375 | / | 200 | 无 | 是（首页本身需要） | — |
| 375 | /download | 200 | 无 | 否 | — |
| 375 | /p/1000160 | 200 | 无 | 否 | 有 401（内部接口匿名访问，符合既有约定） |
| 375 | /series | 404 | 无 | 否 | 该路径本无根页面，仅 series/[id]/cover |
| 375 | /membership | 200 | 无 | 否 | — |
| 1440 | / | 200 | 无 | 是 | — |
| 1440 | /download | 200 | 无 | 否 | — |
| 1440 | /p/1000160 | 200 | 无 | 否 | 同上 401 |

### D9 磁盘二次回收

- 排查：docker system df 显示镜像 5.206GB（可回收 629.9MB）、构建缓存 4.36GB（可回收 3.719GB）；/tmp 179M（含 cmdline-tools.zip 147M、多份 kotlin 守护日志）。
- 处置：删除 /tmp 中 SDK 安装包、kotlin 日志、本轮临时脚本与截图日志；按 48 小时窗口清理构建缓存。
- 结果：48 小时内的 npm 与 .next 缓存被保留，磁盘维持 25G/65%，未进一步下降，可回收空间主要集中于仍在有效期内的构建缓存。

## 已知遗留

1. /series 无根页面（404），若需要合集广场入口需新建路由；深链白名单中的 series 仅用于 series/[id]/cover 编辑器。
2. Caddyfile 存在未提交本地修改；Caddyfile.bak.cc30 为备份文件未纳入版本管理。
3. Git 提交作者为服务器自动值 root@localhost.localdomain。
4. 47 条既有 unused-vars 告警尚未逐文件清理。
5. APK 真机安装验证仍缺设备条件。
