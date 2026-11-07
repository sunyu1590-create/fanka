# 黑卡 HEIKA Android 第二阶段实施报告

日期：2026-11-07

## 实施结论

已完成针对翻卡展开/收起、详情图片衔接、Android 弹层与提示动画的低复杂度优化，并加入 Web 动画事务收尾和 Android 窗口帧时长聚合诊断。业务结果、翻卡额度、内容读取与详情状态继续由现有 Web 和服务端逻辑管理。

本阶段采用优化 Web CSS 3D 与 Web Animations API 的方案。当前环境没有 Android 真机或模拟器，无法对 Web 与原生动画做有效帧率、内存或交接延迟对比，因此没有迁移为原生卡片视图，也没有声称达到 60/120Hz 或性能目标。

## 第一阶段架构兼容性审查

审查记录见 [第二阶段审查与实施清单](android-hybrid-phase-2-review.md)。实际代码显示：

- Android 使用 Kotlin 单 Activity 和稳定的单 WebView 容器；生命周期、系统返回、文件选择、通知导航及 renderer 异常恢复已有实现。
- AndroidX WebKit 消息监听限定可信来源。桥接已提供生命周期事件，但没有动画事务或逐帧通信接口。
- 翻卡内容与解锁结果由现有 Web 状态和服务端接口管理；页面中的卡片、详情及评论也由 Web 渲染。
- 翻卡采用 CSS 3D，展开/收起和详情图片使用 Web Animations API。审查发现详情图片 clone 原先逐帧改变 `left/top/width/height`，翻卡遮罩和弹层使用较重的动态模糊。
- Android 已有启动、首屏、崩溃、renderer 退出和内存 trim 诊断；缺少帧时长统计，本阶段已补充窗口帧样本聚合。
- Web 列表已有分页、懒加载及可见性触发加载。没有设备基线证明需要引入新的虚拟列表或原生业务界面。

## 采用的动画方案

保留现有 Web 动画作为唯一控制者。没有增加原生卡片副本或网页截图交接，也没有逐帧调用 Bridge。理由是卡片业务状态、内容和 DOM 本来就在 Web 层；创建常驻原生视图会增加坐标、资源准备、生命周期及状态回传成本，当前没有真机 A/B 结果支持这一成本。

`AnimationCoordinator` 在 Web 层按动画对象 key 管理单个事务，分配事务 ID，提供完成、取消、超时、失败和释放路径。事务记录优先级（P0–P3）；当前接入的翻卡与详情事务均为 P0。它不承担业务状态，也不逐帧传输动画数据。

## 完成的修改

- [lib/animation-coordinator.ts](../lib/animation-coordinator.ts)：新增轻量动画事务协调器，防止同一对象动画重入；超时、取消和页面离开时进入可恢复终态。
- [components/Community.tsx](../components/Community.tsx)：接入翻卡展开/收起和详情打开/返回事务；应用进入后台、页面隐藏或销毁时收敛动画；减少动态效果时直接完成到稳定状态；清理 WAAPI 动画和临时图片 clone。翻卡容器根据来源卡片的实际矩形设置宽高比例。详情共享图片改为 `translate3d + scale`，不再逐帧改变布局尺寸。通知提示去重并限制待显示队列。
- [lib/native-bridge.ts](../lib/native-bridge.ts)：在可信原生桥接安装期间设置 WebView 标识，供原生专属样式使用；没有新增敏感原生能力或动画逐帧消息。
- [app/design-system.css](../app/design-system.css)：Android WebView 翻卡遮罩、详情头部和业务弹层使用更轻的模糊；弹层、通知进入/退出只使用透明度与 transform。卡片正反面共用同一阶段尺寸。
- [android/app/src/main/java/com/heika/android/MainActivity.kt](../android/app/src/main/java/com/heika/android/MainActivity.kt) 与 [Diagnostics.kt](../android/app/src/main/java/com/heika/android/Diagnostics.kt)：Activity resumed 时采集窗口 `TOTAL_DURATION`，每 900 帧汇总刷新率、帧预算桶近似 p50/p90、超预算帧数、被丢弃的指标报告和最大帧耗时；不逐帧写日志。60Hz 下约每 15 秒、120Hz 下约每 7.5 秒形成一组样本。
- [tests/e2e/p0-acceptance.spec.ts](../tests/e2e/p0-acceptance.spec.ts)：新增 Android WebView 翻卡/详情和轻量弹层断言，覆盖后台中断收尾、卡片宽高比例、共享图片 transform keyframes 及弹层不使用动态 blur。

### 动画与交互归属

| 交互 | 执行层 | 本阶段结果 |
| --- | --- | --- |
| 翻卡确认后的内容与额度 | Web + 现有服务端 | 业务逻辑未改；动画只处理视觉状态 |
| 翻卡 3D 翻面、窗口展开/收起 | Web CSS 3D + WAAPI | 同一阶段尺寸，按来源卡片比例过渡；生命周期中断后收敛 |
| 详情打开/返回及图片共享元素 | Web WAAPI | 图片几何过渡改为 transform；保留原列表和滚动状态逻辑 |
| 页面导航、评论列表 | 现有 Web 路由和 DOM | 未复制为原生业务界面；未发现基线数据支持更大范围改写 |
| 系统通知接收和目标路由 | 第一阶段 Android 推送/Bridge | 本阶段只处理页面提示动画，不改推送和服务端协议 |
| 原生卡片翻转 | 未启用 | 没有设备 A/B 数据证明其比 Web 方案稳定或更快 |

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
| 完整 `npx playwright test --reporter=list` | 2 通过、3 失败；详情见下方 |
| `:app:assembleDebug`、`:app:assembleRelease`、`:app:lintDebug` | 均通过 |
| Android 真机/模拟器 | 未运行：环境没有连接设备或可用模拟器 |

完整 Playwright 套件的三个失败为：

1. 浅色主题测试期待 `--bg: #F8F7F4`，当前实际值为 `#FFFFFF`；当前 CSS 的 canonical light token 与该测试期待值不一致。
2. 发现页/软键盘流程等待可访问名称恰为“单列阅读”的按钮，超时未找到。
3. 管理员流程等待名为“内容审核”的 heading，页面未提供该 heading。

这些断言不涉及本阶段的动画协调器和 transform 改动；由于本阶段开始前未保存这三项测试的独立基线，不能断言它们此前已失败，需另行核查测试预期与当前 UI。新增的两项相关验收（原有翻卡/详情测试和新专项）均通过。

本地 Debug APK 已生成：[app-debug.apk](../android/app/build/outputs/apk/debug/app-debug.apk)。Release 构建产物为未签名 APK，构建通过不表示已完成签名或发布。

## 遗留风险与下一步

- 应在至少一台 60Hz 和一台 90/120Hz Android 设备上录制翻卡、详情返回、评论/弹层和大图列表的帧时长与内存，再与原版本比较。
- 对 `FrameMetrics` 汇总日志和 Android Studio / Perfetto WebView/GPU 轨迹进行对照，确认窗口帧桶能代表目标页面的实际体验。
- 处理完整 Playwright 中的三项 UI/主题断言差异，确认产品预期后再修改页面或测试。
- 详情 clone 的 transform 与圆角过渡需在极端宽高比、图片加载中断及低内存设备上做视觉验证。
- 评论正文仍在详情页内联渲染，没有独立评论弹层；本阶段没有为了动画另建原生评论面板。

## 回滚方式

工作区同时包含第一阶段和第二阶段改动，部分文件（尤其 `Community.tsx`、`design-system.css`、`MainActivity.kt` 和 `Diagnostics.kt`）混有两个阶段的变更。当前没有独立的第二阶段提交；不要对这些文件执行整文件 checkout/reset，否则会连带删除第一阶段实现。

若已将本阶段单独提交，使用 `git revert <第二阶段提交>` 回滚。当前工作区需按第二阶段改动块选择性撤销：协调器与专项测试可删除对应新增文件/用例；Web 生命周期事务、图片 transform、原生 CSS 样式和 Android 帧采集分别按本报告列出的文件和实现位置回退。审查清单和本报告可保留作记录。
