# EXECUTION_LOG · 实际开发执行记录

> 记录格式：时间 | 动作 | 工具/方式 | 结果 | 备注

---

## 2026-11-28

### 阶段一：全应用审计与建立基线

| 时间 | 动作 | 结果 |
|---|---|---|
| 08:19 | 生产基线确认（git/version/docker/df） | HEAD d49f9d6 与远程一致；2.69.0；容器全健康；磁盘 46% |
| 08:19 | 页面/API/组件结构扫描 | 6 页面 / 200 API / 100+ 组件 |
| 08:19 | 三端工程有效性澄清 | android-native=正式底包(103/2.34.0)；android/ 与 mobile/ 为遗留 reference |
| 08:19 | 建立工程档案目录 docs/heika-evolution/ | 成功 |
| 08:20 | 写入 MASTER_PLAN.md | 成功（12 阶段 + 3 风险登记） |
| 08:20 | 写入 AUDIT_REPORT.md | 成功 |
| 08:21 | 写入 ISSUE_TRACKER.md | 成功（R1-R3 风险 + H1-H15 历史回归清单） |
| 08:21 | 数据库规模基线（psql 只读） | 141 表；http_access_logs 39.5 万行最大；业务表规模小 |
| 08:22 | 容器资源基线（docker stats） | 总内存 617MiB/1.918GiB；CPU 全空闲水位 |
| 08:22 | 异常信号排查①：宿主 curl 3000 返回 000 | 确认为正常架构（3000 仅 expose，经 Caddy 内网） |
| 08:22 | 异常信号排查②：internal/health 401 | 鉴权正确生效，应用存活 |
| 08:23 | 异常信号排查③：ai-worker TypeError | 启动后 0.4s 单次握手失败，近 1000 行无复发，重启 0 次，判定非持续故障 |
| 08:23 | 任务队列健康检查 | ai_task_items: 161 completed/0 卡死/5 review；upload_tasks: 73 ready 无积压 |
| 08:23 | 写入 PERFORMANCE_BASELINE.md | 成功 |
| 08:24 | API 方法导出提取 | 199 条 + app/dl/[file] = 200；admin 97 / internal 4 / 用户端 98 |
| 08:24 | 零引用候选第一轮扫描 | 8 个候选（auth/bootstrap, deck/open, me/* x6） |
| 08:25 | 零引用候选 Android 交叉验证 | 5 个为 APP 专用（非废弃）；deck/open、me/bookmarks、me/interests 待阶段六深查 |
| 08:25 | 写入 API_INVENTORY.md | 成功 |

### 阶段一结论

- 基线完整建立，五份档案就绪。
- 无 P0 级生产故障；ai-worker TypeError 与 localhost:3000 000 均已澄清为正常/非故障。
- 历史遗留问题 H1-H15 中，H1/H8/H9 代码层已修复待浏览器验收，其余 12 项待验证。

### 执行环境备注

- 终端会话发生切换：1e545040 → ba575290（同一台机器，已更新引用）。
- 服务器无浏览器环境：H2-H7、H10-H14 等需真实浏览器操作的验证项，采用代码层审计 + HTTP 接口验证替代，浏览器实测仍需用户配合（与原 2.69.0 待办一致）。

## Android 2.35.0 (build 104) 交付 — 2026-11-28

- 构建条件：JDK 17.0.21；SDK /opt/android-sdk（android-35、build-tools 35.0.0）；Gradle 8.11.1 缓存 1.6G；keystore heika（SHA-256 C9:78:40:0E…BB:1F，有效期至 2056）
- 版本：versionCode 103→104、versionName 2.34.0→2.35.0，README 同步；备份 /tmp/build.gradle.kts.bak.vc103
- 构建：assembleRelease --no-daemon，BUILD SUCCESSFUL in 7m40s，54 tasks（24 executed / 30 up-to-date），lintVitalRelease 通过
- 产物：30,673,387 字节，sha256 516a4cac77174e20ecd1acd91ce31b7f7572cc203ed4d063d28e0e36e6cb56d6；com.heika.community vc104/2.35.0，minSdk 26、targetSdk 35，四 ABI；apksigner v2 通过且证书与 release keystore 一致
- 发布：/home/ubuntu/downloads 新增 heika-native-2.35.0-code104.apk 并切换 latest；manifest 更新 2.35.0/104；旧包保留可回滚（备份 /tmp/manifest.json.bak.vc103）
- 验收：/api/v1/app-version 返回 2.35.0/104；HEAD /dl/heika-native-latest.apk 200 + 30673387 字节；/download 渲染 2.35.0 与 build 104
- Git：c105e5d 已推送 origin/main（f99bb10..c105e5d）
- 遗留：HeikaMarkdown.kt:527 LocalClipboardManager 弃用，待改用 LocalClipboard
