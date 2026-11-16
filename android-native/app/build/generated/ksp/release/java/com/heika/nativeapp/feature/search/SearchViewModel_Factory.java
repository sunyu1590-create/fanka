package com.heika.nativeapp.feature.search;

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
public final class SearchViewModel_Factory implements Factory<SearchViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  private final Provider<NativePreferences> preferencesProvider;

  public SearchViewModel_Factory(Provider<HeikaRepository> repositoryProvider,
      Provider<NativePreferences> preferencesProvider) {
    this.repositoryProvider = repositoryProvider;
    this.preferencesProvider = preferencesProvider;
  }

  @Override
  public SearchViewModel get() {
    return newInstance(repositoryProvider.get(), preferencesProvider.get());
  }

  public static SearchViewModel_Factory create(Provider<HeikaRepository> repositoryProvider,
      Provider<NativePreferences> preferencesProvider) {
    return new SearchViewModel_Factory(repositoryProvider, preferencesProvider);
  }

  public static SearchViewModel newInstance(HeikaRepository repository,
      NativePreferences preferences) {
    return new SearchViewModel(repository, preferences);
  }
}
