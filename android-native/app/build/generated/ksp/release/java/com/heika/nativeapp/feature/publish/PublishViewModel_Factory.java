package com.heika.nativeapp.feature.publish;

import android.content.Context;
import com.heika.nativeapp.auth.AuthRepository;
import com.heika.nativeapp.data.HeikaRepository;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Provider;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;

@ScopeMetadata
@QualifierMetadata("dagger.hilt.android.qualifiers.ApplicationContext")
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
public final class PublishViewModel_Factory implements Factory<PublishViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  private final Provider<AuthRepository> authProvider;

  private final Provider<Context> contextProvider;

  public PublishViewModel_Factory(Provider<HeikaRepository> repositoryProvider,
      Provider<AuthRepository> authProvider, Provider<Context> contextProvider) {
    this.repositoryProvider = repositoryProvider;
    this.authProvider = authProvider;
    this.contextProvider = contextProvider;
  }

  @Override
  public PublishViewModel get() {
    return newInstance(repositoryProvider.get(), authProvider.get(), contextProvider.get());
  }

  public static PublishViewModel_Factory create(Provider<HeikaRepository> repositoryProvider,
      Provider<AuthRepository> authProvider, Provider<Context> contextProvider) {
    return new PublishViewModel_Factory(repositoryProvider, authProvider, contextProvider);
  }

  public static PublishViewModel newInstance(HeikaRepository repository, AuthRepository auth,
      Context context) {
    return new PublishViewModel(repository, auth, context);
  }
}
