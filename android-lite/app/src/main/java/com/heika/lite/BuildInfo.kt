package com.heika.lite

/**
 * 客户端版本常量集中定义。
 *
 * 不使用 AGP 生成的 BuildConfig 原始类型字段（int/boolean）：
 * 在当前 Kotlin 2.1.20 + AGP 8.10.1 组合下，引用这些字段会被解析为
 * error type，触发 `Cannot access class 'Int'` 编译错误。
 * 这里用 Kotlin 常量，语义一致且不依赖生成代码。
 */
object BuildInfo {
    /** Android versionCode，发布新包时与 app/build.gradle.kts 同步递增。 */
    const val VERSION_CODE = 1

    /** 轻量客户端 Native Bridge 协议版本。 */
    const val PROTOCOL_VERSION = 2

    /** 客户端显示名称。 */
    const val VERSION_NAME = "1.0.0"
}
