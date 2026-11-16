package com.heika.nativeapp.feature.exploration;

import com.heika.nativeapp.auth.AuthRepository;
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
public final class ExplorationCalendarViewModel_Factory implements Factory<ExplorationCalendarViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  private final Provider<AuthRepository> authProvider;

  public ExplorationCalendarViewModel_Factory(Provider<HeikaRepository> repositoryProvider,
      Provider<AuthRepository> authProvider) {
    this.repositoryProvider = repositoryProvider;
    this.authProvider = authProvider;
  }

  @Override
  public ExplorationCalendarViewModel get() {
    return newInstance(repositoryProvider.get(), authProvider.get());
  }

  public static ExplorationCalendarViewModel_Factory create(
      Provider<HeikaRepository> repositoryProvider, Provider<AuthRepository> authProvider) {
    return new ExplorationCalendarViewModel_Factory(repositoryProvider, authProvider);
  }

  public static ExplorationCalendarViewModel newInstance(HeikaRepository repository,
      AuthRepository auth) {
    return new ExplorationCalendarViewModel(repository, auth);
  }
}
