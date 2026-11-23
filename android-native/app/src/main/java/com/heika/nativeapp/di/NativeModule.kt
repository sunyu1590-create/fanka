package com.heika.nativeapp.di

import android.content.Context
import androidx.room.Room
import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.data.HeikaApi
import com.heika.nativeapp.db.HeikaCacheDao
import com.heika.nativeapp.db.HeikaCacheDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import okhttp3.OkHttpClient
import retrofit2.Retrofit

@Module
@InstallIn(SingletonComponent::class)
object NativeModule {
    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(25, java.util.concurrent.TimeUnit.SECONDS)
        // 图片单张最大 4 MB，弱网写入要留足时间，否则会在 20 秒被直接掐断。
        .writeTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
        // 上传的整体耗时（含服务端生成缩略图）需要比普通接口宽松。
        .callTimeout(90, java.util.concurrent.TimeUnit.SECONDS)
        // 默认每个域名只允许 5 个并发连接。首屏一次要拉十几个接口，
        // 国内网络往返高，排队会让页面慢好几秒，这里放宽到 16。
        .dispatcher(okhttp3.Dispatcher().apply {
            maxRequests = 64
            maxRequestsPerHost = 16
        })
        .connectionPool(okhttp3.ConnectionPool(12, 5, java.util.concurrent.TimeUnit.MINUTES))
        .retryOnConnectionFailure(true)
        .build()

    @Provides
    @Singleton
    fun provideHeikaApi(client: OkHttpClient): HeikaApi = Retrofit.Builder()
        .baseUrl("${BuildConfig.API_BASE_URL}/")
        .client(client)
        .build()
        .create(HeikaApi::class.java)

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): HeikaCacheDatabase =
        Room.databaseBuilder(context, HeikaCacheDatabase::class.java, "heika-native-cache.db").build()

    @Provides
    @Singleton
    fun provideCacheDao(database: HeikaCacheDatabase): HeikaCacheDao = database.cacheDao()
}
