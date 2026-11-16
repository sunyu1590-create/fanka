package com.heika.nativeapp.feature.settings;

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
public final class AdminCenterViewModel_Factory implements Factory<AdminCenterViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  public AdminCenterViewModel_Factory(Provider<HeikaRepository> repositoryProvider) {
    this.repositoryProvider = repositoryProvider;
  }

  @Override
  public AdminCenterViewModel get() {
    return newInstance(repositoryProvider.get());
  }

  public static AdminCenterViewModel_Factory create(Provider<HeikaRepository> repositoryProvider) {
    return new AdminCenterViewModel_Factory(repositoryProvider);
  }

  public static AdminCenterViewModel newInstance(HeikaRepository repository) {
    return new AdminCenterViewModel(repository);
  }
}
