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
        .connectTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(25, java.util.concurrent.TimeUnit.SECONDS)
        .writeTimeout(25, java.util.concurrent.TimeUnit.SECONDS)
        .callTimeout(35, java.util.concurrent.TimeUnit.SECONDS)
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
