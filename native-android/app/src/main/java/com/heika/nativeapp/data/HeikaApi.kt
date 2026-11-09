package com.heika.nativeapp.data

import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PATCH
import retrofit2.http.Url

interface HeikaApi {
    @GET suspend fun get(
        @Url url: String,
        @Header("Authorization") authorization: String? = null,
    ): Response<ResponseBody>

    @POST suspend fun post(
        @Url url: String,
        @Header("Authorization") authorization: String? = null,
        @Body body: RequestBody,
    ): Response<ResponseBody>

    @PATCH suspend fun patch(
        @Url url: String,
        @Header("Authorization") authorization: String? = null,
        @Body body: RequestBody,
    ): Response<ResponseBody>
}
