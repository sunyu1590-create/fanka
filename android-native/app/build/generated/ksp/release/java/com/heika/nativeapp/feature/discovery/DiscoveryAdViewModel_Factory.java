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
public final class DiscoveryAdViewModel_Factory implements Factory<DiscoveryAdViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  public DiscoveryAdViewModel_Factory(Provider<HeikaRepository> repositoryProvider) {
    this.repositoryProvider = repositoryProvider;
  }

  @Override
  public DiscoveryAdViewModel get() {
    return newInstance(repositoryProvider.get());
  }

  public static DiscoveryAdViewModel_Factory create(Provider<HeikaRepository> repositoryProvider) {
    return new DiscoveryAdViewModel_Factory(repositoryProvider);
  }

  public static DiscoveryAdViewModel newInstance(HeikaRepository repository) {
    return new DiscoveryAdViewModel(repository);
  }
}
