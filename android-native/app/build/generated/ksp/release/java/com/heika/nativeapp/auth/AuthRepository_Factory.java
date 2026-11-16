package com.heika.nativeapp.auth;

import com.heika.nativeapp.data.HeikaApi;
import dagger.Lazy;
import dagger.internal.DaggerGenerated;
import dagger.internal.DoubleCheck;
import dagger.internal.Factory;
import dagger.internal.Provider;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import okhttp3.OkHttpClient;

@ScopeMetadata("javax.inject.Singleton")
@QualifierMetadata
@DaggerGenerated
@Generated(
    value = "dagger.internal.codegen.ComponentProcessor",
    comments = "https://dagger.dev"
)
@SuppressWarnings({
    "unchecked",
    "rawtypes",
    "KotlinInternal",
    "KotlinInternalInJava",
    "cast",
    "deprecation",
    "nullness:initialization.field.uninitialized"
})
public final class AuthRepository_Factory implements Factory<AuthRepository> {
  private final Provider<SecureSessionStore> storeProvider;

  private final Provider<HeikaApi> apiProvider;

  private final Provider<OkHttpClient> httpClientProvider;

  public AuthRepository_Factory(Provider<SecureSessionStore> storeProvider,
      Provider<HeikaApi> apiProvider, Provider<OkHttpClient> httpClientProvider) {
    this.storeProvider = storeProvider;
    this.apiProvider = apiProvider;
    this.httpClientProvider = httpClientProvider;
  }

  @Override
  public AuthRepository get() {
    return newInstance(storeProvider.get(), DoubleCheck.lazy(apiProvider), httpClientProvider.get());
  }

  public static AuthRepository_Factory create(Provider<SecureSessionStore> storeProvider,
      Provider<HeikaApi> apiProvider, Provider<OkHttpClient> httpClientProvider) {
    return new AuthRepository_Factory(storeProvider, apiProvider, httpClientProvider);
  }

  public static AuthRepository newInstance(SecureSessionStore store, Lazy<HeikaApi> api,
      OkHttpClient httpClient) {
    return new AuthRepository(store, api, httpClient);
  }
}
