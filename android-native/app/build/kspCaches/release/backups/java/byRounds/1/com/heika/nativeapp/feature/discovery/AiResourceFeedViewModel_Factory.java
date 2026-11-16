package com.heika.nativeapp.feature.discovery;

import com.heika.nativeapp.data.HeikaRepository;
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
public final class AiResourceFeedViewModel_Factory implements Factory<AiResourceFeedViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  private final Provider<NativePreferences> preferencesProvider;

  public AiResourceFeedViewModel_Factory(Provider<HeikaRepository> repositoryProvider,
      Provider<NativePreferences> preferencesProvider) {
    this.repositoryProvider = repositoryProvider;
    this.preferencesProvider = preferencesProvider;
  }

  @Override
  public AiResourceFeedViewModel get() {
    return newInstance(repositoryProvider.get(), preferencesProvider.get());
  }

  public static AiResourceFeedViewModel_Factory create(Provider<HeikaRepository> repositoryProvider,
      Provider<NativePreferences> preferencesProvider) {
    return new AiResourceFeedViewModel_Factory(repositoryProvider, preferencesProvider);
  }

  public static AiResourceFeedViewModel newInstance(HeikaRepository repository,
      NativePreferences preferences) {
    return new AiResourceFeedViewModel(repository, preferences);
  }
}
