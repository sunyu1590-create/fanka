package com.heika.nativeapp.auth;

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
public final class AccountViewModel_Factory implements Factory<AccountViewModel> {
  private final Provider<AuthRepository> authProvider;

  private final Provider<HeikaRepository> repositoryProvider;

  public AccountViewModel_Factory(Provider<AuthRepository> authProvider,
      Provider<HeikaRepository> repositoryProvider) {
    this.authProvider = authProvider;
    this.repositoryProvider = repositoryProvider;
  }

  @Override
  public AccountViewModel get() {
    return newInstance(authProvider.get(), repositoryProvider.get());
  }

  public static AccountViewModel_Factory create(Provider<AuthRepository> authProvider,
      Provider<HeikaRepository> repositoryProvider) {
    return new AccountViewModel_Factory(authProvider, repositoryProvider);
  }

  public static AccountViewModel newInstance(AuthRepository auth, HeikaRepository repository) {
    return new AccountViewModel(auth, repository);
  }
}
