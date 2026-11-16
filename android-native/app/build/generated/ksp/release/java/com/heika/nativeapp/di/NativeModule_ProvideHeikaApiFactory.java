package com.heika.nativeapp.di;

import com.heika.nativeapp.data.HeikaApi;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
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
public final class NativeModule_ProvideHeikaApiFactory implements Factory<HeikaApi> {
  private final Provider<OkHttpClient> clientProvider;

  public NativeModule_ProvideHeikaApiFactory(Provider<OkHttpClient> clientProvider) {
    this.clientProvider = clientProvider;
  }

  @Override
  public HeikaApi get() {
    return provideHeikaApi(clientProvider.get());
  }

  public static NativeModule_ProvideHeikaApiFactory create(Provider<OkHttpClient> clientProvider) {
    return new NativeModule_ProvideHeikaApiFactory(clientProvider);
  }

  public static HeikaApi provideHeikaApi(OkHttpClient client) {
    return Preconditions.checkNotNullFromProvides(NativeModule.INSTANCE.provideHeikaApi(client));
  }
}
