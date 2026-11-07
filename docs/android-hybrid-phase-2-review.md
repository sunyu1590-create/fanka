# HEIKA Android 混合架构第二阶段审查与实施清单

## 审查范围与第一阶段现状

- Android 是 Kotlin 单 Activity + 单 WebView 容器；`MainActivity` 处理系统返回、生命周期、页面恢复、文件选择器、通知路由和 WebView renderer 重建。WebView 的 `onPause` / `onResume` 与 `app.lifecycle` Bridge 事件已存在。
- `NativeBridge` 使用 AndroidX WebKit 的来源受限消息监听器，仅接受可信 HTTPS 主 frame 和协议版本 1。现有消息涵盖通知权限、页面状态、系统返回、通知导航和图片错误；**没有**原生动画请求接口或原生动画视图。
- Web 业务是 Next.js 15 / React 19。翻卡业务结果仍由 `/api/demo/cards` 和已有状态逻辑决定；本阶段只调整显示动画和测量，不改变翻卡次数、解锁或推荐规则。
- Android 诊断已有启动/首屏计时、renderer 退出、崩溃摘要、历史退出原因和内存 trim 日志；尚无窗口帧时长统计、Web 长任务统计或动画事务结果统计。
- 运行 `/tmp/heika-android-sdk/platform-tools/adb devices -l` 未发现设备；当前环境没有可用的 Android emulator。因此不能建立真实设备的 60/120Hz 基线，也不能声称帧率、掉帧或内存峰值已改善。

## 动画与渲染路径审查

| 场景 | 当前实现 | 审查结论 |
| --- | --- | --- |
| 翻卡窗口展开/收起 | `Community.tsx` 读取来源卡片 `DOMRect`，通过 Web Animations API 动画 `transform` 和圆角 | 保留 Web 实现；业务 DOM 与内容均由 Web 持有，没有证据支持为此创建重复原生视图 |
| 卡片 3D 翻转 | `.flip-inner` 通过 CSS `rotateY(180deg)` 翻面；前后面共用一个阶段容器 | 保留 CSS 3D。阶段容器当前没有从来源卡片继承宽高比例，长短屏可能出现起终比例变化 |
| 详情打开/返回 | 详情面板使用 `transform`；图片使用临时 DOM clone | 保留 Web 共享元素视觉；clone 当前逐帧改 `left/top/width/height`，会触发布局/绘制，是明确的优化点 |
| 生命周期中断 | WebView 会发 `app.lifecycle`，页面也能收到浏览器 visibility 事件；动画没有统一事务/生命周期协调器 | 增加轻量协调器：唯一事务 ID、互斥对象 key、超时终态、取消/强制收尾；前后台切换时收敛到明确状态 |
| 翻卡遮罩与庆祝效果 | Android 与 Web 共用全屏 `backdrop-filter: blur(14px) saturate(115%)`；翻开时最多创建 112 个装饰粒子 | 作为高开销候选观察。没有真实设备测量前不按机型猜性能等级，也不删除品牌效果 |
| 业务弹层 | `.modal-backdrop` 使用 7px 背景模糊，弹层进出使用 12px 内容模糊 | 为 Android WebView 提供轻量专用过渡：静态 3px 背景模糊，弹层内容只动画透明度与 transform；桌面及普通浏览器继续使用现有样式 |
| 评论、导航、提示 | 由现有 Web DOM/CSS 控制；没有原生底部弹层或原生通知动画 | 继续使用 Web；本阶段不重复实现业务 UI |
| 长列表与图片 | Web 当前使用分页、IntersectionObserver 和懒加载；详情图片共享使用 `decode()` | 未发现应立即引入大型虚拟列表框架的证据；本阶段先记录长任务/帧统计，避免盲目改数据渲染 |

## 技术选择

本阶段以方案 A（优化 Web CSS 3D 与 Web Animations API）为默认实现。现有翻卡结果、内容与详情都在 Web 端；原生视图交接需要额外截图/资源状态、坐标和窗口 Insets 同步，并会重复渲染同一个对象。没有真实 Android 设备可用于 A/B 测量，故不将原生方案宣称为更快，也不迁移业务视图。

第二阶段实现轻量 Web 动画协调器，并把第一阶段已有的 Android 前后台事件用于中断收尾。详情图片过渡改为固定 clone 上的 `translate3d + scale`，避免动画每帧改变布局几何。翻卡阶段容器按来源卡片实际比例设置目标宽高，避免同一张卡在打开时被非等比缩放。Android WebView 中的业务弹层和通知改用透明度、位移及静态轻模糊，避免原有较重的动态滤镜。另加入低开销 Android 窗口帧时长聚合日志；它用于后续真实设备对比，不等同于 WebView compositor 的完整帧率指标。

## 实施清单

1. 新增 `lib/animation-coordinator.ts`：事务 ID、优先级、互斥 key、完成/取消/超时状态、动画清理和生命周期收敛；不传输逐帧数据。
2. 接入卡片打开/收起、详情打开/返回的 WAAPI 动画，防止旧事务回调影响新页面；系统减少动态效果时直接完成到稳定状态。
3. 将详情图片共享元素从位置/尺寸动画改为 transform 动画，统一 clone 资源清理。
4. 由来源卡片 `DOMRect` 推导翻卡窗口宽高比，让前后面保持同一实际盒子尺寸。
5. 监听 `app.lifecycle`、`visibilitychange` 和 `pagehide`，前后台切换时取消并收尾可见动画，释放临时 clone。
6. Android WebView 下将通知和业务弹层动画限定为 opacity/transform，并减少模糊半径；动画内容不逐帧经 Bridge 同步。
7. 为 Android 窗口帧时长聚合 60/120Hz deadline 参考值、p50/p90 近似桶及超时帧计数；只在汇总窗口写日志，不逐帧写日志。
8. 运行 Web 单元测试、类型检查、生产构建、Playwright 可运行场景，以及 Android assemble/lint；记录没有设备可执行的真实机测试项。
9. 更新实施报告，分开记录本地构建、浏览器验证和真实 Android 设备验证；不填写未测性能值。

## 风险与回滚

- 远程业务入口导致本环境无法代表不同 Android GPU、WebView 版本和刷新率；帧数据必须在具体设备上采集。
- 详情共享元素 clone 使用 CSS transform 时，边框圆角和 `object-fit` 在极端不同宽高比下可能有可见差异；需用 60Hz/120Hz 设备及小屏、平板做视觉检查。
- 修改范围限定在 Web 动画协调、翻卡/详情动画、Android 帧诊断和本报告；不改后端 schema、认证、推送、翻卡规则或发布流程。
- 回滚通过撤销第二阶段提交恢复第一阶段代码；本报告及动画协调器是新增文件，Android 帧指标 listener 可独立删除。
