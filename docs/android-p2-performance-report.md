# HEIKA Android P2 性能与构建审查

## 基线与范围

- 本次以仓库远端 `main` 的 `2cc2d607`（2026-11-08）为起点。该提交包含现有 Android WebView 容器、P0/P1 原生桥接和发现页图片优化；本阶段没有重写业务页。
- Android 配置沿用 `applicationId com.heika.community`、versionCode `8`、versionName `2.2.2`、JDK 17、AGP 8.10.1、Kotlin 2.1.20、compile/target SDK 35。CI 使用 Gradle 8.11.1。
- Android WebView 启动地址固定为 `https://moonclean.shop/`；Bridge 与 WebView 精确允许 `moonclean.shop`、`www.moonclean.shop` 和仓库既有文档记录的备用 `fanka-two.vercel.app`，Actions 不再接受任意 URL 覆写。
- 本地容器没有 Android SDK、Gradle、adb 或模拟器，无法在本地构建或采集 Android 冷启动、PSS、帧率及 WebView 崩溃数据。GitHub Actions run #24 已完成 Android 编译和 APK 构建；设备指标仍待 Android 设备验证。

## 代码审查结果

| 模块 | 已有实现 | P2 修复或状态 |
| --- | --- | --- |
| WebView | 单个 Activity/WebView、系统栏 Insets、页面状态保存、受限渲染进程重启、FrameMetrics 日志、SSL 错误拒绝 | 销毁 WebView 或处理渲染器退出时显式移除 WebMessageListener、取消 Bridge 排队消息并释放代理引用 |
| 启动遮罩 | Android 12+ 系统 SplashScreen 和原生图标资源 | 启动期间显示复用应用图标的原生遮罩；Bridge ready 后 180ms 淡出；无 Bridge 时在首帧可见后退出，保留 20 秒超时错误页 |
| 图片 | 发现流请求 640px Unsplash 图；私有上传图片可按已发布内容生成 640×960 WebP，限制 5 MiB 输入和 5000 万解码像素；CSS 已有懒加载/内容可视区优化 | 保留现有缩略图链路；无真实服务器/CDN或 Android 网络样本，未凭空改动详情原图策略 |
| 内容缓存 | IndexedDB 公共内容缓存，单条 768 KiB、总量 8 MiB、24 小时默认新鲜期、7 天最长期限、LRU 淘汰 | 写入改为单批串行，等待 IndexedDB 事务提交；修复替换过期条目时容量被重复扣减的问题 |
| 列表与动画 | 发现流分页、缓存恢复；翻卡与详情共享动画；Native Card Transition；已有动画协调器 | 追加分页改用 Set 去重，收藏/评分派生 ID 按依赖缓存；保留视觉与业务规则 |
| 构建 | 原工作流运行 Web 单测、类型检查、生产构建以及 Android debug/release assemble | 增加 Android lint、单元测试任务和 Kotlin/Java 编译任务；产物包含版本/Commit/run 元数据 |

## 主页启动故障 P0 修复

- 已复核启动代码：`bridgeSupported` 表示当前 Android WebView 是否支持 WebMessageListener，并不表示网站脚本一定成功完成 Bridge 握手。之前 `onPageCommitVisible` 在该值为 true 时不关闭遮罩；若线上最终 origin 与唯一配置的 apex 不同，或页面脚本未发出 `bridge.ready`，网页即使已经提交也会一直被遮挡，最终落入 20 秒“暂时无法连接”提示。
- 已改为仅在精确允许的三个 HEIKA HTTPS origin 内导航和注入 Bridge。首屏提交后若 2 秒内没有 Bridge ready，会记录 `web_bridge_ready_timeout` 并显示已提交的网页；真实主文档网络错误、HTTP 错误与 SSL 错误仍显示重试页，并增加只含 host/错误码的阶段日志。
- 本地网络出口代理对 `moonclean.shop` 返回 `403 CONNECT tunnel failed`，DNS 查询不可用，因此这里无法确认手机实际命中的最终重定向 host；允许名单基于仓库已有生产/备用域名记录。该修复同时保证未知域名仍不会获得原生 Bridge。

## 同机 Web 端基线

比较远端基线提交和本次工作树的生产构建，使用同一台机器、同一 Chromium、360×800 CSS 像素、2×设备像素比、相同 API mock 与图片 fixture，各运行 5 次，报告中位数。它用于观察 Web 渲染，不代表 Android WebView 或线上网络表现。

| 指标 | 远端基线 | 本次工作树 |
| --- | ---: | ---: |
| 导航可交互 | 904 ms | 910 ms |
| 发现页首卡片可见 | 1,023 ms | 1,036 ms |
| 首字节时间 | 9 ms | 9 ms |
| 首次内容绘制 | 540 ms | 600 ms |
| 传输字节（mock 页面） | 286,294 B | 286,981 B |
| JS heap 样本中位数 | 7.1 MiB | 7.1 MiB |
| DOM 节点 | 214 | 214 |
| 12 张首屏图片 | 12/12 已加载 | 12/12 已加载 |

这组整页数据采于后续信息流/启动遮罩优化之前，结果处于相同量级，不能据此宣称有启动或渲染提速。Android 真机性能前后对比尚无数据。

信息流合并另做了独立算法基准：50,000 条已有 ID、追加 24 条（含尾部重复 ID），31 次运行中位数从原先逐条扫描的 7.147 ms 降至 Set 合并的 3.666 ms。此数据只衡量去重函数，不代表 React 页面或 Android WebView 的端到端帧率。

## 验证

- `npm test`：25/25 通过，包含启动可信域与 Bridge 超时恢复回归测试。
- `npm run typecheck`：通过。
- `npm run build`：通过；Next.js 报告现存 ESLint warning（未使用变量、Hook 依赖和部分 `<img>`），没有构建错误。
- `CI=1 npx playwright test --reporter=line`：7/7 通过。
- `git diff --check`：通过。
- GitHub Actions run #24：Web validation 与 Android build 两个 job 均通过；Android lint、Android 单测任务、Kotlin/Java debug 编译、debug/release assemble 和 Artifact 上传均成功。
- 中间 run #22 因提交时 Community 文件被截断而在 TypeScript 阶段失败；已恢复完整文件并重新应用改动，最终 run #24 全部通过。
- APK Artifact：[`heika-android-v2.2.2-12679cd5…`](https://github.com/sunyu1590-create/fanka/actions/runs/42441265970/artifacts/13601253064)，包含 `HEIKA-debug.apk`、`HEIKA-release-unsigned.apk` 与 `BUILD-METADATA.txt`，保留至 2026-11-22 11:08 CST。元数据记录构建 SHA `12679cd5bdaea712caeaf7829e8fa8d49988b657`；Release 产物未配置签名时不是正式可安装发布包。
- Pull Request：[PR #3](https://github.com/sunyu1590-create/fanka/pull/3)。

## 未验证风险

- 仍需在 Android 设备上测冷/热启动、长时间滚动后的 PSS、FrameMetrics、后台恢复、弱网、WebView renderer exit 和系统 WebView 版本兼容性。
- `FrameMetrics` 和退出原因诊断已存在，但目前没有本次真机日志样本。
- 图片代理回退到已签名原图的路径仍会受源文件大小和远端存储时延影响；本次没有生产流量或 CDN 命中数据。

## 后续建议

1. 在低端 Android 设备和 Android 14/15 设备各跑一轮启动、滚动、图片和后台恢复基准，并保存匿名化的 frame-window/PSS 结果。
2. 用线上 CDN 访问日志核查 feed thumbnail 命中率与原图回退比例，再决定是否调整缓存头或缩略图尺寸。
3. 对长时间浏览场景采集 WebView renderer 内存与 JS heap 趋势，确认后再决定是否需要更细的列表虚拟化。
