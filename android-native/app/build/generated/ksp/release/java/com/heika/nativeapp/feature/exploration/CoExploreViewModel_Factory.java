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
public final class CoExploreViewModel_Factory implements Factory<CoExploreViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  private final Provider<AuthRepository> authProvider;

  public CoExploreViewModel_Factory(Provider<HeikaRepository> repositoryProvider,
      Provider<AuthRepository> authProvider) {
    this.repositoryProvider = repositoryProvider;
    this.authProvider = authProvider;
  }

  @Override
  public CoExploreViewModel get() {
    return newInstance(repositoryProvider.get(), authProvider.get());
  }

  public static CoExploreViewModel_Factory create(Provider<HeikaRepository> repositoryProvider,
      Provider<AuthRepository> authProvider) {
    return new CoExploreViewModel_Factory(repositoryProvider, authProvider);
  }

  public static CoExploreViewModel newInstance(HeikaRepository repository, AuthRepository auth) {
    return new CoExploreViewModel(repository, auth);
  }
}
