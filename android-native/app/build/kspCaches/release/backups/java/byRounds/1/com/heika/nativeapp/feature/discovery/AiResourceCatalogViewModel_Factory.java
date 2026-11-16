package com.heika.nativeapp.feature.discovery;

import com.heika.nativeapp.data.HeikaRepository;
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
public final class AiResourceCatalogViewModel_Factory implements Factory<AiResourceCatalogViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  public AiResourceCatalogViewModel_Factory(Provider<HeikaRepository> repositoryProvider) {
    this.repositoryProvider = repositoryProvider;
  }

  @Override
  public AiResourceCatalogViewModel get() {
    return newInstance(repositoryProvider.get());
  }

  public static AiResourceCatalogViewModel_Factory create(
      Provider<HeikaRepository> repositoryProvider) {
    return new AiResourceCatalogViewModel_Factory(repositoryProvider);
  }

  public static AiResourceCatalogViewModel newInstance(HeikaRepository repository) {
    return new AiResourceCatalogViewModel(repository);
  }
}
