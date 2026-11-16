package com.heika.nativeapp;

import com.heika.nativeapp.auth.AuthRepository;
import com.heika.nativeapp.ui.HeikaImageCache;
import dagger.MembersInjector;
import dagger.internal.DaggerGenerated;
import dagger.internal.InjectedFieldSignature;
import dagger.internal.Provider;
import dagger.internal.QualifierMetadata;
import javax.annotation.processing.Generated;

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
public final class HeikaApplication_MembersInjector implements MembersInjector<HeikaApplication> {
  private final Provider<AuthRepository> authRepositoryProvider;

  private final Provider<HeikaImageCache> imageCacheProvider;

  public HeikaApplication_MembersInjector(Provider<AuthRepository> authRepositoryProvider,
      Provider<HeikaImageCache> imageCacheProvider) {
    this.authRepositoryProvider = authRepositoryProvider;
    this.imageCacheProvider = imageCacheProvider;
  }

  public static MembersInjector<HeikaApplication> create(
      Provider<AuthRepository> authRepositoryProvider,
      Provider<HeikaImageCache> imageCacheProvider) {
    return new HeikaApplication_MembersInjector(authRepositoryProvider, imageCacheProvider);
  }

  @Override
  public void injectMembers(HeikaApplication instance) {
    injectAuthRepository(instance, authRepositoryProvider.get());
    injectImageCache(instance, imageCacheProvider.get());
  }

  @InjectedFieldSignature("com.heika.nativeapp.HeikaApplication.authRepository")
  public static void injectAuthRepository(HeikaApplication instance,
      AuthRepository authRepository) {
    instance.authRepository = authRepository;
  }

  @InjectedFieldSignature("com.heika.nativeapp.HeikaApplication.imageCache")
  public static void injectImageCache(HeikaApplication instance, HeikaImageCache imageCache) {
    instance.imageCache = imageCache;
  }
}
