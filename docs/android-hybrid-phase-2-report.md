# 黑卡 HEIKA Android 第二阶段实施报告

日期：2026-11-07

## 实施结论

已完成针对翻卡展开/收起、详情图片衔接、Android 弹层与提示动画的低复杂度优化，并加入 Web 动画事务收尾和 Android 窗口帧时长聚合诊断。业务结果、翻卡额度、内容读取与详情状态继续由现有 Web 和服务端逻辑管理。

本阶段采用优化 Web CSS 3D 与 Web Animations API 的方案。当前环境没有 Android 真机或模拟器，无法对 Web 与原生动画做有效帧率、内存或交接延迟对比，因此没有迁移为原生卡片视图，也没有声称达到 60/120Hz 或性能目标。

## 第一阶段架构兼容性审查

审查记录见 [第二阶段审查与实施清单](android-hybrid-phase-2-review.md)。实际代码显示：

- Android 使用 Kotlin 单 Activity 和稳定的单 WebView 容器；生命周期、系统返回、文件选择、通知导航及 renderer 异常恢复已有实现。
- AndroidX WebKit 消息监听限定可信来源。桥接提供生命周期事件；本次补充加入来源受限的卡片图片转场协议，没有逐帧通信接口。
- 翻卡内容与解锁结果由现有 Web 状态和服务端接口管理；页面中的卡片、详情及评论也由 Web 渲染。
- 翻卡采用 CSS 3D，展开/收起和详情图片使用 Web Animations API。审查发现详情图片 clone 原先逐帧改变 `left/top/width/height`，翻卡遮罩和弹层使用较重的动态模糊。
- Android 已有启动、首屏、崩溃、renderer 退出和内存 trim 诊断；缺少帧时长统计，本阶段已补充窗口帧样本聚合。
- Web 列表已有分页、懒加载及可见性触发加载。没有设备基线证明需要引入新的虚拟列表或原生业务界面。

## 采用的动画方案

翻卡继续由 Web CSS 3D 独占控制。详情图片共享转场采用可选的 Android 小图快照：用户按下卡片时，Web 通过固定消息类型发送图片矩形和像素密度；Android `PixelCopy` 只截取可见图片所在的矩形，并由临时 `ImageView` 独立完成一次位移/缩放。Web 端不会同时对同一张图片运行共享转场。设备能力、截图结果或桥接调用不满足条件时，Web transform 动画作为回退。没有整页截图、常驻原生卡片、敏感凭证透传或逐帧 Bridge。缺少真机 A/B 数据，因此该方案只适用于这段图片转场，不能据此宣称原生整体更快。

`AnimationCoordinator` 在 Web 层按动画对象 key 管理单个事务，分配事务 ID，提供完成、取消、超时、失败和释放路径。事务记录优先级（P0–P3）；当前接入的翻卡与详情事务均为 P0。它不承担业务状态，也不逐帧传输动画数据。

## 完成的修改

- [lib/animation-coordinator.ts](../lib/animation-coordinator.ts)：新增轻量动画事务协调器，防止同一对象动画重入；超时、取消和页面离开时进入可恢复终态。
- [components/Community.tsx](../components/Community.tsx)：接入翻卡展开/收起和详情打开/返回事务；应用进入后台、页面隐藏或销毁时收敛动画；减少动态效果时直接完成到稳定状态；清理 WAAPI 动画和临时图片 clone。翻卡容器根据来源卡片的实际矩形设置宽高比例。浏览器回退动画使用 `translate3d + scale`，不逐帧改变布局尺寸。通知提示去重并限制待显示队列。
- [lib/native-bridge.ts](../lib/native-bridge.ts)：设置 WebView 标识供原生专属样式使用；并定义固定类型、版本化参数、矩形校验、事务 ID、超时和显式释放的卡片转场协议，不提供任意原生方法调用。
- [NativeCardTransition.kt](../android/app/src/main/java/com/heika/android/NativeCardTransition.kt)、[NativeBridge.kt](../android/app/src/main/java/com/heika/android/NativeBridge.kt) 与 [MainActivity.kt](../android/app/src/main/java/com/heika/android/MainActivity.kt)：实现可选的小图 PixelCopy 转场和生命周期清理。只截可见图片区域，限制截图边长与像素数；转场使用原生属性动画，不逐帧更新消息。进后台、渲染器异常、Activity 销毁及显式释放时清理位图和临时视图。
- [app/design-system.css](../app/design-system.css)：Android WebView 翻卡遮罩、详情头部和业务弹层使用更轻的模糊；弹层、通知进入/退出只使用透明度与 transform。卡片正反面共用同一阶段尺寸。
- [android/app/src/main/java/com/heika/android/MainActivity.kt](../android/app/src/main/java/com/heika/android/MainActivity.kt) 与 [Diagnostics.kt](../android/app/src/main/java/com/heika/android/Diagnostics.kt)：Activity resumed 时采集窗口 `TOTAL_DURATION`，每 900 帧汇总刷新率、帧预算桶近似 p50/p90、超预算帧数、被丢弃的指标报告和最大帧耗时；不逐帧写日志。60Hz 下约每 15 秒、120Hz 下约每 7.5 秒形成一组样本。
- [tests/e2e/p0-acceptance.spec.ts](../tests/e2e/p0-acceptance.spec.ts)：新增 Android WebView 翻卡/详情和轻量弹层断言，覆盖后台中断收尾、卡片宽高比例、共享图片 transform keyframes 及弹层不使用动态 blur。

### 动画与交互归属

| 交互 | 执行层 | 本阶段结果 |
| --- | --- | --- |
| 翻卡确认后的内容与额度 | Web + 现有服务端 | 业务逻辑未改；动画只处理视觉状态 |
| 翻卡 3D 翻面、窗口展开/收起 | Web CSS 3D + WAAPI | 同一阶段尺寸，按来源卡片比例过渡；生命周期中断后收敛 |
| 详情打开/返回及图片共享元素 | Android 小图属性动画；不支持时 Web WAAPI 回退 | 页面与业务仍由同一 WebView 管理；图片不逐帧跨桥同步，列表和滚动锚点保留 |
| 页面导航、评论列表 | 现有 Web 路由和 DOM | 未复制为原生业务界面；未发现基线数据支持更大范围改写 |
| 系统通知接收和目标路由 | 第一阶段 Android 推送/Bridge | 本阶段只处理页面提示动画，不改推送和服务端协议 |
| 原生卡片翻转 | 未启用 | 翻卡继续使用 Web CSS 3D；本次只将详情图片衔接交由可选原生快照动画 |

动画事务 ID 和最终状态可作为后续原生转场协议的基础。当前没有单独添加未使用的 NativeTransition API；如第二阶段后续真机基准证明某一场景需要原生视图，应定义对象 ID、事务 ID、最终状态及取消/失败事件，禁止逐帧 Bridge 更新，并继续保持 Web 业务结果为准。

## 性能数据与限制

代码路径已消除详情图片动画中的逐帧布局几何更新，并降低 WebView 中若干模糊开销；浏览器专项测试验证了使用的动画属性。这些是实现层面的改进，**不是实测帧率或内存收益**。本环境没有连接设备：`adb devices -l` 未发现真机，且没有可用模拟器。

新增的 Android `FrameMetrics` 是宿主窗口级聚合指标，可用于后续真实设备对比；它不等同于 WebView compositor 专项 FPS，也没有提供 JavaScript long task、GPU overdraw 或进程内存峰值的完整剖析。因此以下项目尚未实测：60Hz/120Hz 核心动画帧耗时、掉帧比例、动画峰值内存、Web/Native 交接延迟、长时间运行内存趋势以及各厂商 WebView 差异。

## 构建和测试结果

| 验证 | 结果 |
| --- | --- |
| `npm test` | 17/17 通过 |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过；存在 lint 警告（未使用变量、React Hook 依赖、`<img>` 优化建议），没有构建错误 |
| 新增翻卡/详情/原生弹层专项 Playwright | 1/1 通过 |
| 完整 `npx playwright test --reporter=line` | 7/7 通过 |
| `:app:assembleDebug`、`:app:assembleRelease`、`:app:lintDebug` | 均通过 |
| Android 真机/模拟器 | 未运行：环境没有连接设备或可用模拟器 |

本地 Debug APK 已生成：[app-debug.apk](../android/app/build/outputs/apk/debug/app-debug.apk)。Release 构建产物为未签名 APK，构建通过不表示已完成签名或发布。

### GitHub Actions 构建

- 分支：`codex/heika-android-phase-2`；没有更新 `main`。
- 提交：[`340cdc6`](https://github.com/sunyu1590-create/fanka/commit/340cdc6254541aaad255b2084560bd0edff85197)。
- Workflow：[`HEIKA Android APK #14`](https://github.com/sunyu1590-create/fanka/actions/runs/42366514943)，Web 验证、Android Debug/Release 组装和 artifact 上传均成功。
- Artifact：`heika-android-apk`（约 4.4 MB），包含 `HEIKA-debug.apk` 和 `HEIKA-release-unsigned.apk`，保留至 2026-11-21。可在 workflow 页面下载。

## 遗留风险与下一步

- 应在至少一台 60Hz 和一台 90/120Hz Android 设备上录制翻卡、详情返回、评论/弹层和大图列表的帧时长与内存，再与原版本比较。
- 对 `FrameMetrics` 汇总日志和 Android Studio / Perfetto WebView/GPU 轨迹进行对照，确认窗口帧桶能代表目标页面的实际体验。
- 原生截图转场和 Web 回退需在极端宽高比、图片加载中断及低内存设备上做真机视觉验证。
- 评论正文仍在详情页内联渲染，没有独立评论弹层；本阶段没有为了动画另建原生评论面板。

## 用户反馈后的转场与本地缓存补充

用户反馈详情打开掉帧、退出时一级页面闪动后，复查发现 `openPost` 还会更新根组件中的 `state.viewed`。推荐排序明确忽略该字段，所以这次更新只触发大型 `Community` 根组件重新渲染，没有业务收益。现已移除这次状态写入，保留服务端浏览记录请求。详情关闭不再请求或重载发现流，仍使用同一个 WebView 和内存中的列表；返回时通过 `sessionStorage` 保存的轻量卡片锚点校正滚动位置，图片/文本高度改变时也回到原卡片附近。

最终动画选择为**Web 翻卡 + Android 可选图片转场**：翻卡继续使用已经顺畅的 Web CSS 3D。Android 详情转场仅在触按时尝试通过 `PixelCopy` 截取可见图片所在的小矩形；Activity 用短生命周期 `ImageView` 独立执行缩放/位移动画。它不复制整页、不将截图写入磁盘，也不经 Bridge 逐帧传位置。打开详情后暂留小图快照供返回复用；关闭时释放，进后台、渲染器异常或 Activity 销毁时清理。截图未就绪、Bridge 不可用、减少动态效果或坐标不合规时，回退至 Web transform 动画。

本地优先数据范围：

- IndexedDB 保存公开发现流分页、公开话题页、公开评论首页和按 ID 获取的公开内容；打开相关页面时先呈现未过期本地内容，再用网络更新。用户设置、阅读偏好、翻卡进度、最近搜索和未发布草稿优先保存在本地；敏感用户数据没有塞进公共内容缓存。
- 缓存总量上限 8 MiB、单条上限 768 KiB、超过 7 天的内容失效；发现流、话题与评论分别按 5 分钟、10 分钟、2 分钟标记新鲜度，仍会后台重新验证。
- 写入延后到浏览器空闲时间。图片二进制仍由 WebView/浏览器标准 HTTP 缓存管理，避免重复存储。
- 现有账户偏好、翻卡进度和草稿仍沿用本地持久化；服务端仍是每日翻卡额度和翻开结果的事实来源。认证凭证、私信内容和评论个人点赞状态不进入公共缓存。

### 本次补充验证

| 验证 | 结果 |
| --- | --- |
| 公共发现流离线重启缓存 Playwright | 通过；重启后断开内容 API 仍展示本地首屏 |
| 翻卡与详情转场 Playwright | 通过；Fake Bridge 下 Web 回退路径完成 |
| `npm test` | 17/17 通过 |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过；存在仓库已有的 `<img>`、unused 和 Hook dependency lint 警告 |
| 完整 Playwright | 7/7 通过；覆盖离线缓存重启、翻卡/详情、可信 NativeBridge 协议、话题返回和发布编辑 |
| Android `compileDebugKotlin` | 通过 |
| `:app:assembleDebug :app:assembleRelease :app:lintDebug` | 通过；版本 2.2.2 / versionCode 8 |
| Android 真机/模拟器帧率与内存 A/B | 未测；当前环境没有连接设备或启动模拟器，不能把设计预期写成性能数据 |

从详情页打开话题时，发现深链 `?post=…` 会在话题页加载后再次触发详情恢复，造成详情遮罩挡住话题页。现已消费该深链并在进入话题时清理详情 URL 状态；系统返回优先返回原详情。页面立即切换并显示轻量加载态，数据再从本地缓存或网络填充。

本地回归中的 UI 断言按真实页面语义校正：浅色背景为暖白 `#F8F7F4`；偏好项按 `radio` 语义查询；管理页标题使用实际的“管理后台”；发布页标题按 `.composer-topbar strong` 查询。

## 回滚方式

工作区同时包含第一阶段和第二阶段改动，部分文件（尤其 `Community.tsx`、`design-system.css`、`MainActivity.kt` 和 `Diagnostics.kt`）混有两个阶段的变更。当前没有独立的第二阶段提交；不要对这些文件执行整文件 checkout/reset，否则会连带删除第一阶段实现。

若已将本阶段单独提交，使用 `git revert <第二阶段提交>` 回滚。当前工作区需按第二阶段改动块选择性撤销：协调器与专项测试可删除对应新增文件/用例；Web 生命周期事务、图片 transform、原生 CSS 样式和 Android 帧采集分别按本报告列出的文件和实现位置回退。审查清单和本报告可保留作记录。
