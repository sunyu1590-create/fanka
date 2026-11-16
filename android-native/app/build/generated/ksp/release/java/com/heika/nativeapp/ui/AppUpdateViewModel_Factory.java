package com.heika.nativeapp.ui;

import android.content.Context;
import com.heika.nativeapp.data.HeikaRepository;
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
public final class AppUpdateViewModel_Factory implements Factory<AppUpdateViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  private final Provider<NativePreferences> preferencesProvider;

  private final Provider<Context> contextProvider;

  public AppUpdateViewModel_Factory(Provider<HeikaRepository> repositoryProvider,
      Provider<NativePreferences> preferencesProvider, Provider<Context> contextProvider) {
    this.repositoryProvider = repositoryProvider;
    this.preferencesProvider = preferencesProvider;
    this.contextProvider = contextProvider;
  }

  @Override
  public AppUpdateViewModel get() {
    return newInstance(repositoryProvider.get(), preferencesProvider.get(), contextProvider.get());
  }

  public static AppUpdateViewModel_Factory create(Provider<HeikaRepository> repositoryProvider,
      Provider<NativePreferences> preferencesProvider, Provider<Context> contextProvider) {
    return new AppUpdateViewModel_Factory(repositoryProvider, preferencesProvider, contextProvider);
  }

  public static AppUpdateViewModel newInstance(HeikaRepository repository,
      NativePreferences preferences, Context context) {
    return new AppUpdateViewModel(repository, preferences, context);
  }
}
