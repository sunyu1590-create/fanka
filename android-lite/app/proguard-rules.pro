# HEIKA Lite R8 规则：仅保留 WebView 与 JS 接口必需符号。
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class com.heika.lite.LiteBridge {
    public *;
}
-keepattributes JavascriptInterface
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable

# 系统 WebView 相关回调由框架反射调用
-keepclassmembers class com.heika.lite.MainActivity {
    public *;
}

# 移除日志（保留错误）
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
}

-dontwarn android.webkit.**
