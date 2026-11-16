package com.heika.nativeapp;

import com.heika.nativeapp.ui.HeikaImageCache;
import com.heika.nativeapp.ui.NativePreferences;
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
public final class MainActivity_MembersInjector implements MembersInjector<MainActivity> {
  private final Provider<HeikaImageCache> imageCacheProvider;

  private final Provider<NativePreferences> preferencesProvider;

  public MainActivity_MembersInjector(Provider<HeikaImageCache> imageCacheProvider,
      Provider<NativePreferences> preferencesProvider) {
    this.imageCacheProvider = imageCacheProvider;
    this.preferencesProvider = preferencesProvider;
  }

  public static MembersInjector<MainActivity> create(Provider<HeikaImageCache> imageCacheProvider,
      Provider<NativePreferences> preferencesProvider) {
    return new MainActivity_MembersInjector(imageCacheProvider, preferencesProvider);
  }

  @Override
  public void injectMembers(MainActivity instance) {
    injectImageCache(instance, imageCacheProvider.get());
    injectPreferences(instance, preferencesProvider.get());
  }

  @InjectedFieldSignature("com.heika.nativeapp.MainActivity.imageCache")
  public static void injectImageCache(MainActivity instance, HeikaImageCache imageCache) {
    instance.imageCache = imageCache;
  }

  @InjectedFieldSignature("com.heika.nativeapp.MainActivity.preferences")
  public static void injectPreferences(MainActivity instance, NativePreferences preferences) {
    instance.preferences = preferences;
  }
}
