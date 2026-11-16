package com.heika.nativeapp.ui;

import android.content.Context;
import com.heika.nativeapp.data.HeikaApi;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Provider;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;

@ScopeMetadata
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
public final class NetworkRegionNoticeViewModel_Factory implements Factory<NetworkRegionNoticeViewModel> {
  private final Provider<HeikaApi> apiProvider;

  private final Provider<NativePreferences> preferencesProvider;

  private final Provider<Context> contextProvider;

  public NetworkRegionNoticeViewModel_Factory(Provider<HeikaApi> apiProvider,
      Provider<NativePreferences> preferencesProvider, Provider<Context> contextProvider) {
    this.apiProvider = apiProvider;
    this.preferencesProvider = preferencesProvider;
    this.contextProvider = contextProvider;
  }

  @Override
  public NetworkRegionNoticeViewModel get() {
    return newInstance(apiProvider.get(), preferencesProvider.get(), contextProvider.get());
  }

  public static NetworkRegionNoticeViewModel_Factory create(Provider<HeikaApi> apiProvider,
      Provider<NativePreferences> preferencesProvider, Provider<Context> contextProvider) {
    return new NetworkRegionNoticeViewModel_Factory(apiProvider, preferencesProvider, contextProvider);
  }

  public static NetworkRegionNoticeViewModel newInstance(HeikaApi api,
      NativePreferences preferences, Context context) {
    return new NetworkRegionNoticeViewModel(api, preferences, context);
  }
}
