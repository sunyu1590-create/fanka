package com.heika.nativeapp.feature.notifications;

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
public final class ForegroundNotificationsViewModel_Factory implements Factory<ForegroundNotificationsViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  private final Provider<AuthRepository> authProvider;

  public ForegroundNotificationsViewModel_Factory(Provider<HeikaRepository> repositoryProvider,
      Provider<AuthRepository> authProvider) {
    this.repositoryProvider = repositoryProvider;
    this.authProvider = authProvider;
  }

  @Override
  public ForegroundNotificationsViewModel get() {
    return newInstance(repositoryProvider.get(), authProvider.get());
  }

  public static ForegroundNotificationsViewModel_Factory create(
      Provider<HeikaRepository> repositoryProvider, Provider<AuthRepository> authProvider) {
    return new ForegroundNotificationsViewModel_Factory(repositoryProvider, authProvider);
  }

  public static ForegroundNotificationsViewModel newInstance(HeikaRepository repository,
      AuthRepository auth) {
    return new ForegroundNotificationsViewModel(repository, auth);
  }
}
