package com.heika.nativeapp.feature.detail;

import com.heika.nativeapp.auth.AuthRepository;
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
public final class PostDetailViewModel_Factory implements Factory<PostDetailViewModel> {
  private final Provider<HeikaRepository> repositoryProvider;

  private final Provider<AuthRepository> authProvider;

  private final Provider<NativePreferences> preferencesProvider;

  public PostDetailViewModel_Factory(Provider<HeikaRepository> repositoryProvider,
      Provider<AuthRepository> authProvider, Provider<NativePreferences> preferencesProvider) {
    this.repositoryProvider = repositoryProvider;
    this.authProvider = authProvider;
    this.preferencesProvider = preferencesProvider;
  }

  @Override
  public PostDetailViewModel get() {
    return newInstance(repositoryProvider.get(), authProvider.get(), preferencesProvider.get());
  }

  public static PostDetailViewModel_Factory create(Provider<HeikaRepository> repositoryProvider,
      Provider<AuthRepository> authProvider, Provider<NativePreferences> preferencesProvider) {
    return new PostDetailViewModel_Factory(repositoryProvider, authProvider, preferencesProvider);
  }

  public static PostDetailViewModel newInstance(HeikaRepository repository, AuthRepository auth,
      NativePreferences preferences) {
    return new PostDetailViewModel(repository, auth, preferences);
  }
}
