package com.heika.nativeapp.ui;

import android.content.Context;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Provider;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import okhttp3.OkHttpClient;

@ScopeMetadata("javax.inject.Singleton")
@QualifierMetadata("dagger.hilt.android.qualifiers.ApplicationContext")
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
public final class HeikaImageCache_Factory implements Factory<HeikaImageCache> {
  private final Provider<Context> contextProvider;

  private final Provider<OkHttpClient> clientProvider;

  private final Provider<NativePreferences> preferencesProvider;

  public HeikaImageCache_Factory(Provider<Context> contextProvider,
      Provider<OkHttpClient> clientProvider, Provider<NativePreferences> preferencesProvider) {
    this.contextProvider = contextProvider;
    this.clientProvider = clientProvider;
    this.preferencesProvider = preferencesProvider;
  }

  @Override
  public HeikaImageCache get() {
    return newInstance(contextProvider.get(), clientProvider.get(), preferencesProvider.get());
  }

  public static HeikaImageCache_Factory create(Provider<Context> contextProvider,
      Provider<OkHttpClient> clientProvider, Provider<NativePreferences> preferencesProvider) {
    return new HeikaImageCache_Factory(contextProvider, clientProvider, preferencesProvider);
  }

  public static HeikaImageCache newInstance(Context context, OkHttpClient client,
      NativePreferences preferences) {
    return new HeikaImageCache(context, client, preferences);
  }
}
