# HEIKA Android 稳定性审计报告

审计日期：2026-11-07
审计对象：`com.heika.community`，Expo SDK 58 / React Native 0.88.1
审计范围：源码、Android 配置、动画和渲染、页面生命周期、图片/列表、实时数据、缓存/数据库安全顾问、可用自动化检查。
验证约定：**已证实**表示源码或提供的 tombstone 直接证明；**高概率**表示与堆栈和执行路径吻合但未复现；**待验证**表示需要目标机、对照实验或额外日志。

## 结论摘要

已证实崩溃发生在 Android `libhwui.so` 的 `android::uirenderer::computeTransformImpl`，系统给出的原因是线程栈接近耗尽、疑似栈溢出，重复帧约 512 层。该证据把问题范围指向原生渲染变换链，但**没有证明**具体由翻卡、路由、模糊、React Native Fabric 或小米驱动中的哪一项引起。

当前源码中最需要设备对照的组合是：启动页首页卡片的 3D 透视/`rotateY`、Stack 页面过渡，以及包住整个导航树的 Expo 原生 `BlurTargetView`。当前工作树已经包含一项候选缓解：Stack 页面过渡使用 opacity fade，翻卡改为 opacity 揭示，动画仍保留；这能减少已知变换，但没有在出现崩溃的 Xiaomi Android 17 / HyperOS 4 设备上验证，因此不能称为根因已定位或崩溃已修复。

此环境没有 Android SDK、`adb`、模拟器或真机连接。JS 检查和 Android JS bundle 导出通过；原生 APK 构建、崩溃压力矩阵、帧时间/纹理/内存测量均未执行。已修复可由静态代码确认的消息刷新并发/卸载回调风险。按用户给定的完成标准，本次结果是**审计完成、代码层候选缓解已准备、设备验证未完成**，不满足“崩溃已验证消失”的最终完成标准。

## 1. 已确认问题及潜在风险清单

| ID | 状态 / 优先级 | 位置 | 触发条件 | 关联模块 | 统一处理建议 |
|---|---|---|---|---|---|
| R1 | 已证实 / P0 | 用户提供的 `HEIKA_Codex_崩溃排查任务.md` tombstone 摘要 | 进程启动约 4 秒内；RenderThread 发生 SIGSEGV / SEGV_MAPERR | Android HWUI | 用相同设备对原版、只改卡片变换版、只改路由版及组合版做冷启动对照；收集 tombstone、版本、GPU/ROM 信息。 |
| R2 | 高概率 / P0 | [home.tsx](../mobile/src/app/(tabs)/home.tsx#L201) | 首页创建多张卡片，含 3D `perspective` + `rotateY` 两个面、`backfaceVisibility` | 翻卡动画 × HWUI RenderNode | 当前候选用 680ms opacity 揭示保留翻卡反馈并移除透视矩阵；在目标机做单变量 A/B 后再决定长期方案。 |
| R3 | 高概率 / P0 | [_layout.tsx](../mobile/src/app/_layout.tsx#L15) | 冷启动初始路由或快速进出二级页 | 路由过渡 × Native Screens × HWUI | 当前候选 Stack 过渡为 opacity fade；确认目标机是否能消除签名，并回归滑动返回与快速导航。 |
| R4 | 高概率 / P0 | [native-blur.tsx](../mobile/src/lib/native-blur.tsx#L8)、[根布局](../mobile/src/app/_layout.tsx#L77)、[底栏](../mobile/src/app/(tabs)/_layout.tsx#L27) | 所有页面均处于自定义原生 `BlurTargetView` 子树，悬浮底栏又用 `BlurView` 采样该子树；页面转场卸载期间涉及 `startViewTransition` | 原生 ViewGroup 子节点代理 × Native Screens × 动画 | 用“仅关闭原生 BlurTarget/BlurView”诊断构建进行单变量对照；若签名消失，再把模糊目标缩小到 Tabs 范围或更换实现。现在不凭源码直接删除模糊。 |
| R5 | 部分修复 / P1 | [messages.tsx](../mobile/src/app/(tabs)/messages.tsx#L32)、[chat/[id].tsx](../mobile/src/app/chat/[id].tsx#L58) | Realtime、前台恢复和 30 秒轮询可能同时触发刷新；聊天订阅恢复时会再次拉取最近 60 条 | Realtime × AppState × 列表状态 | 消息列表已加 single-flight 和最多一次排队刷新，卸载后不再更新组件，身份切换时丢弃旧账号响应。聊天生命周期已加守卫；聊天查询的订阅恢复与前台恢复仍可能重复读取，需设备网络日志确认。此项不能解释现有 RenderThread tombstone。 |
| R6 | 部分修复 / P1 | [chat/[id].tsx](../mobile/src/app/chat/[id].tsx#L68)、[chat/[id].tsx](../mobile/src/app/chat/[id].tsx#L149) | 实时异步回调未在每个 await 后核验订阅仍有效；发送成功后有未登记清理的 40ms timeout | 页面卸载 × realtime × timer | 已在 realtime 图片签名等待后检查订阅活性；AppState 加载加入卸载守卫；发送滚动 timeout 由 ref 管理并在卸载时清除。尚未单独去重前台/重连触发的重复初始同步。 |
| R7 | 已证实 / P1 | [NativeImage.tsx](../mobile/src/components/NativeImage.tsx#L13) | 列表图片加载/失败切换、URI 更新 | 图片解码 × 短暂 blurRadius × opacity animation | 目前有失败占位，使用 RN `Animated.Image`；未配置显式磁盘/内存缓存策略。监测图片密集滚动时 Native/Graphics Heap 和掉帧，必要时评估 `expo-image`。 |
| R8 | 已证实 / P1 | [discover.tsx](../mobile/src/app/(tabs)/discover.tsx#L206) | 无限瀑布流分页中 | FlatList × 每行两个贴文 × 动态布局动画 | `FlatList` 提供虚拟化，内容使用 cursor/页码；每行有 `FadeInDown + LinearTransition`。记录已挂载行数、请求去重和长列表帧耗时。 |
| R9 | 已证实 / P1 | [gradle.properties](../mobile/android/gradle.properties#L39) | 所有设备启动 | Fabric/New Architecture + Hermes + Reanimated 4 | 这是当前运行配置，不是故障证据。若 opacity/Blur A/B 无法隔离，建立仅切换 New Architecture 的诊断 APK 对照，不先在生产关闭 Fabric。 |
| R10 | 已证实 / P1 | 工程依赖：`mobile/package.json` | 构建/运行 | Expo SDK 58、RN 0.88.1、Reanimated 4.7.1、expo-blur 58.0.5、react-native-screens 4.30.1 | 依赖版本已锁定；本次环境未能联网执行远程兼容性检查，无法证明该组合对特定 HyperOS GPU 驱动没有已知问题。CI 原生构建仍须验证。 |
| R11 | 已证实 / P1 | 工程全局检索 `mobile/src`、`app.json`、Gradle | 运行时异常或 native crash | 错误监控 | 未发现 Crashlytics、Sentry 或 Bugsnag 集成。当前缺少可对照的版本、设备、路由和动画状态遥测。 |
| R12 | 已证实 / P1（只读数据库审计） | Supabase advisors，项目 `sauknappipwkxloaovms` | RLS/索引规则评估 | 数据库权限/查询 | Security advisor 报告 5 张启用 RLS 但没有 policy 的表，并提示可执行的 `SECURITY DEFINER` 函数；Performance advisor 报告 27 个未索引 FK。此次仅查看建议，没有改生产 schema、数据、策略或索引；需在独立数据库审阅这些 API/RPC 的访问路径后再制定迁移。与 RenderThread 崩溃没有直接因果证据。 |

## 2. 根因分析与证据对应表

| 判断 | 状态 | 证据 | 限制 |
|---|---|---|---|
| 发生的是 native RenderThread 崩溃，而非普通 JS exception/OOM | 已证实 | tombstone：SIGSEGV/SEGV_MAPERR、`libhwui.so`、`computeTransformImpl`、约 512 帧、栈接近栈顶 | 未拿到每一次崩溃的完整 tombstone 与 build fingerprint。 |
| 出错代码根因是某一个 CSS 动画或 WebView | 不成立 | 原生端是 Expo + React Native；依赖树没有 `react-native-webview`、Capacitor；堆栈没有业务帧 | 候选仍可能是 RN 生成的原生 View/动画树。 |
| 首页 3D 翻卡是触发源 | 高概率、待设备验证 | 冷启动首页直接挂载卡片面；静态存在透视和旋转变换，与 HWUI 变换计算路径吻合 | 无对照构建与目标机复现，尚不能断因果。当前本地候选移除了这些变换。 |
| 根导航动画是触发源 | 高概率、待设备验证 | 初始栈与页面切换使用 screen transition；症状在启动后数秒出现，Expo native screens 负责屏幕转场 | 缺少崩溃前动画帧和设备录屏。当前候选只保留 opacity 转场。 |
| Expo BlurTargetView 的代理层级是触发源 | 高概率、待设备验证 | 原生模块把 React 子节点代理给内部 BlurTarget，并重载 add/remove/child count、`startViewTransition` 等 ViewGroup 方法；该 target 包住全局 Stack | SDK 自身注释说明已为 Native Screens/手势协调维护这些代理语义；没有缺陷证明或 A/B 结果。 |
| Xiaomi/HyperOS/GPU 驱动本身缺陷 | 待验证 | 目前报告指向 Xiaomi cas / Android 17 / HyperOS 4；只有该环境的系统栈摘要 | 需要同 APK 在另一 Android 版本或另一 GPU 设备上对照，以及 MIUI bugreport 的完整 Build fingerprint/GPU 信息。 |

因此目前的正式根因状态：**已定位到 HWUI 变换递归栈异常；应用代码中的具体触发因素待验证**。

## 3. 全面范围审计结果

### Android 原生层

- `MainActivity.kt` 使用 Expo 的 `ReactActivityDelegateWrapper`、Fabric delegate，`onCreate` 调用 `super.onCreate(null)`；没有自定义 RenderNode、Matrix 或 View 变换代码。
- `MainApplication.kt` 为 Expo 默认 ReactHost 加一个 `HeikaSecureStoragePackage`。该原生模块只提供 Android Keystore AES/GCM + SharedPreferences，不创建 View，不碰 RenderThread。
- Android Manifest 使用 `singleTask`、portrait、`adjustResize`、edge-to-edge；未发现重复 Activity、重复 `ReactRootView` 或自定义硬件加速开关。
- Fabric、新架构、Hermes 已启用；ABI 包含 armeabi-v7a、arm64-v8a、x86、x86_64。实际设备 native crash 应确认是 arm64 tombstone。
- Android 项目由 Expo Prebuild 生成；不应直接编辑生成的 `mobile/android` 文件来修正配置。

### WebView / 混合应用容器

- 确认没有 WebView / Capacitor；是本地 React Native 原生组件树，JS bundle 随 APK 打包。
- 先前“Unable to load script”属于开发 bundle 未打包/连接 Metro 的构建配置问题，和本次 `libhwui.so` SIGSEGV 是不同故障类别。release APK 不能依赖 Metro。

### 动画 / 组件 / 路由

- 动画主要通过 Reanimated：淡入、列表布局过渡、按压缩放、进度条、翻卡。未发现 `withRepeat` 或显式 `requestAnimationFrame` 循环。
- 翻卡原先存在两个绝对定位的面、3D 透视旋转和背面隐藏；现在本地候选保留定时缓动的正反面 opacity reveal。
- Root Stack 现在本地候选为 fade；没有删全局动画。
- `Tabs` 设置 `freezeOnBlur`，有利于降低后台页面更新；同时要求确保恢复时实时订阅不重复。
- 全局没有发现显式 React Error Boundary。JS 渲染错误目前无集中兜底/遥测，但不会捕获原生 SIGSEGV。
- 列表 key 多数基于 post/comment/message 主键；未发现明显的不稳定随机 key。

### 内存、图片、列表

- 首页每日卡数量小；发现页 FlatList 分页加载；聊天首屏拉取 60 条并支持显式更早消息分页；没有发现图片转 base64 后长期批量保留的列表路径。
- 图片压缩只在发布、资料编辑、聊天上传时创建临时 base64；RN Image 通过 URI 显示，异常使用统一占位。
- AsyncStorage 缓存通过 key + TTL 读取，但本地缓存没有统一容量/过期清扫上限，长期运行可能积累失效数据；当前没有 heap dump 证明内存泄漏。
- 没有 Java/Kotlin OOM、Native OOM、GPU texture exhaustion 证据。现有 tombstone 指向 native 线程栈溢出，不能把它误判成普通 heap OOM。

### 数据库、缓存与后台恢复

- Supabase SDK 在 JS 模块内单例初始化，Auth session listener 有 unsubscribe；发现页请求有 generation 和 active guard。
- 消息页把 Realtime、30 秒轮询和 AppState 回前台刷新叠加，缺请求合并；聊天页 Realtime subscribe 成功与 AppState active 都可能拉取相同窗口。该处已确认有重复请求/状态竞态风险，未证明造成 native crash。
- 数据库 advisors 为只读；没有访问或修改生产行数据。安全 advisor 的表策略告警需要单独核实 server route/RPC 授权模型，避免因“无 RLS policy”一项盲目添加/改动 policy。
- 通知桥接有 ID 去重和订阅清理；深链/通知目标只接受格式正确的会话 UUID。

## 4. 关联问题及依赖关系

```text
Stack route transition ─┐
3D flip / animated card ─┼─> React Native View / RenderNode transform tree ─> HWUI computeTransformImpl
Root BlurTarget proxy ──┘              ▲
                                        │
Native Screens removal transition ─────┘

Realtime events ─┬─> inbox/chat fetch ─> React state ─> list layout animations
AppState resume ─┤
30s polling ──────┘
```

优先验证依赖顺序：

1. 固定设备/ROM/GPU、APK、数据和启动入口；先复现原始 APK。
2. 单独去掉首页 3D 变换；其他组件与动画配置保持原样。
3. 从原始 APK 单独改 Root Stack transition；与第 2 组隔离比较。
4. 单独关闭原生 BlurTarget/BlurView；观察崩溃是否消失及转场是否异常。
5. 在上述单变量中确定是否需组合；最后才检查 Fabric/New Architecture 对照。
6. 对候选修复运行同一组压力脚本，并在另一 Android 版本/机型复核。

消息数据请求合并属于独立修复批次，不与 P0 渲染改动混在同一次因果验证里。

## 5. 统一修复设计与修改文件

### 当前本地候选修改（未提交）

- `mobile/src/app/_layout.tsx`：路由 transition 从 `fade_from_bottom` 改为 opacity-only `fade`。
- `mobile/src/app/(tabs)/home.tsx`：翻卡从 `perspective + rotateY` 改为正反面 opacity reveal，保留 680ms easing 动效。
- `mobile/app.json`、`mobile/package.json`、`mobile/package-lock.json`、`.github/workflows/build-android-apk.yml`：候选版本 2.1.1 / versionCode 5 对齐。

以上是**缓解候选，不是设备验证后的最终根因修复**。版本号随候选变更尚未发布；没有提交或部署本次审计报告。

### 后续集中修复顺序

1. P0：用真实设备单变量 A/B 找到变换树触发源；据结果保留三种动画设计意图，通过更浅原生层级/opacity/clip/共享元素方案替换具体危险路径。
2. P0：若 BlurTarget 与转场组合是触发条件，缩小 target 容器或调整原生模糊实现；不先移除全局玻璃视觉。
3. P1：为 messages/chat 数据获取做 single-flight、generation guard、AppState 恢复去重；在每个异步回调边界验证生命周期，清理计时器/订阅。
4. P1：加入错误监控，包含 app version、Android SDK、设备厂商/型号、当前 route、当前动画阶段、`isLowRamDevice` 等非敏感信息；不采集消息正文。
5. P1：按测试数据设置缓存上限、图片预加载预算和长列表窗口；只有发现内存/纹理证据后才调参数。
6. 数据库顾问告警另立只读 schema/API 权限审查；经评审和备份后再写迁移。

## 6. 实际修改记录

- 已创建 Git 回滚检查点分支：`audit/android-stability-checkpoint-b05e7e6`，基于 `b05e7e6`。
- 审计开始前工作树已存在上述 6 个文件的未提交候选修改；未发现生产数据库被写入。
- 本次新增 `messages.tsx` 请求合并、待执行刷新折叠、卸载守卫及账号切换旧响应丢弃；新增 `chat/[id].tsx` realtime/AppState 生命周期守卫和延迟滚动 timer 清理。
- 没有新增 Android 原生配置或数据库修改，也没有把候选渲染补丁标为已确认根因修复。
- 新增本审计报告文件。

提交与构建记录：`1385748e45609808396b427c9a6c7073f3032dce`（`Audit Android stability and guard message lifecycle`），已推送至 `android/phase-two`。GitHub Actions run [#13](https://github.com/sunyu1590-create/fanka/actions/runs/42351345421) 成功；APK 签名、包名、版本均通过校验，artifact 已上传。报告状态于 2026-11-07 更新。

## 7. 自动化、构建与真机测试报告

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 通过，exit 0 |
| `npm run lint` | 通过，exit 0 |
| `npx expo export --platform android` | 通过；Android bundle 生成约 7.5 MB Hermes bundle |
| `npm audit --audit-level=low` | 通过，0 vulnerabilities |
| `npx expo-doctor` | 18/20 检查通过；2 项远程检查因环境 DNS/网络失败（`exp.host` 与 React Native Directory），不是代码检查通过 |
| Java / Gradle wrapper | Java 21、Gradle 9.4.1 可运行 |
| Release 原生 APK 构建 | GitHub Actions run #13 成功；Gradle `assembleRelease`、APK v2 签名校验、版本验证和 artifact 上传均通过 |
| APK 元数据 | `com.heika.community`, `versionCode=5`, `versionName=2.1.1`, `compileSdk=37` |
| APK SHA-256 | `9060acb77095d43ea1d9153af4adc345fd08926f1f1ca567d2bfb0e148313b78` |
| APK 签名一致性 | 本次 APK SHA-256 signer `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`，与上一份成功构建 APK 一致 |
| APK artifact | `heika-android-preview-apk`，约 21.4 MB，保留至 2026-12-07；[GitHub Actions 下载页](https://github.com/sunyu1590-create/fanka/actions/runs/42351345421) |
| 本地原生 Gradle 构建 | 未运行：本地环境无 Android SDK（`ANDROID_HOME` 未设置）；CI 完成 Release 原生构建 |
| `adb` 真机/模拟器 | 未运行：当前环境没有 `adb` 或设备 |
| 冷/热启动、翻卡、导航、滚动、断网、通知、长时运行压力矩阵 | 未执行；不能报告为通过 |
| Android 版本对照、Debug/Release 对照 | 未执行 |
| Native crash / ANR / Heap / GPU texture / FPS 采样 | 未执行 |

### 可执行 adb 复测命令（连接 Xiaomi 目标机后）

先安装候选 APK，在电脑端打开终端并确认 `adb devices` 显示设备：

```bash
adb logcat -c
adb shell am force-stop com.heika.community
adb shell monkey -p com.heika.community 1
adb logcat -b crash -v threadtime
```

重复启动 100 次（每轮间隔 2 秒，保留系统处理时间）：

```bash
for i in $(seq 1 100); do
  adb shell am force-stop com.heika.community
  adb shell monkey -p com.heika.community 1
  sleep 2
done
```

导出测试期间 crash buffer 和进程内存：

```bash
adb logcat -b crash -d -v threadtime > heika-crash-log.txt
adb shell dumpsys meminfo com.heika.community > heika-meminfo.txt
adb bugreport heika-bugreport.zip
```

单靠 shell 循环不能覆盖“翻卡 200 次 / 详情 200 次 / 评论反复打开”等 UI 场景；这些需要手动记录或使用 UIAutomator/Maestro 固定脚本。每组记录 APK SHA-256、`adb shell getprop ro.build.fingerprint`、Android SDK、HyperOS 版本和 GPU 型号。出现崩溃后立即保存 `/data/tombstones` 对应 tombstone（普通应用通常无权读取，使用完整 bugreport 或系统日志导出）。

## 8. 剩余风险与后续监控建议

- P0 尚未闭环：需用最初发生崩溃的 Xiaomi Android 17 / HyperOS 4 设备完成原版和候选对照；未拿到完整 tombstone、GPU 信息与目标机复测记录前，不能保证不再崩溃。
- 当前候选将 3D 翻卡视觉改为淡入揭示，会改变动画表现；是否接受需结合设备验证和原设计目标评估。它保留翻卡交互和揭晓节奏，但不是 3D 翻面。
- BlurTargetView / 原生 BlurView 仍在树中，尚未被排除或确认。
- 聊天/消息刷新存在重复请求，图片缓存没有容量上限，缺少崩溃遥测；这些是已证实的工程风险，不等同于本次崩溃根因。
- 生产数据库 advisors 给出权限与索引建议；本次没有改生产数据，应在后续独立评审中检查函数定义、调用入口、RLS 和索引使用计划。
- 建议发布前建立 7 天 crash-free session 监控、相同签名告警和可回滚 APK；但目前未接入监控，也未发布。

**最终验证状态：代码静态检查通过；HWUI 崩溃根因未到应用组件级别确认；目标真机回归未完成。**
