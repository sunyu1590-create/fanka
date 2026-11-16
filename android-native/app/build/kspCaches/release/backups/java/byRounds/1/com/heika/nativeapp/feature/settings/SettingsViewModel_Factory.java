package com.heika.nativeapp.feature.settings;

import com.heika.nativeapp.auth.AuthRepository;
import com.heika.nativeapp.data.HeikaRepository;
import com.heika.nativeapp.ui.HeikaImageCache;
import com.heika.nativeapp.ui.NativePreferences;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Provider;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;

@ScopeMetadata
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
public final class SettingsViewModel_Factory implements Factory<SettingsViewModel> {
  private final Provider<NativePreferences> preferencesProvider;

  private final Provider<HeikaImageCache> imageCacheProvider;

  private final Provider<AuthRepository> authProvider;

  private final Provider<HeikaRepository> repositoryProvider;

  public SettingsViewModel_Factory(Provider<NativePreferences> preferencesProvider,
      Provider<HeikaImageCache> imageCacheProvider, Provider<AuthRepository> authProvider,
      Provider<HeikaRepository> repositoryProvider) {
    this.preferencesProvider = preferencesProvider;
    this.imageCacheProvider = imageCacheProvider;
    this.authProvider = authProvider;
    this.repositoryProvider = repositoryProvider;
  }

  @Override
  public SettingsViewModel get() {
    return newInstance(preferencesProvider.get(), imageCacheProvider.get(), authProvider.get(), repositoryProvider.get());
  }

  public static SettingsViewModel_Factory create(Provider<NativePreferences> preferencesProvider,
      Provider<HeikaImageCache> imageCacheProvider, Provider<AuthRepository> authProvider,
      Provider<HeikaRepository> repositoryProvider) {
    return new SettingsViewModel_Factory(preferencesProvider, imageCacheProvider, authProvider, repositoryProvider);
  }

  public static SettingsViewModel newInstance(NativePreferences preferences,
      HeikaImageCache imageCache, AuthRepository auth, HeikaRepository repository) {
    return new SettingsViewModel(preferences, imageCache, auth, repository);
  }
}
