package com.heika.nativeapp.di;

import com.heika.nativeapp.db.HeikaCacheDao;
import com.heika.nativeapp.db.HeikaCacheDatabase;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.Provider;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;

@ScopeMetadata("javax.inject.Singleton")
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
public final class NativeModule_ProvideCacheDaoFactory implements Factory<HeikaCacheDao> {
  private final Provider<HeikaCacheDatabase> databaseProvider;

  public NativeModule_ProvideCacheDaoFactory(Provider<HeikaCacheDatabase> databaseProvider) {
    this.databaseProvider = databaseProvider;
  }

  @Override
  public HeikaCacheDao get() {
    return provideCacheDao(databaseProvider.get());
  }

  public static NativeModule_ProvideCacheDaoFactory create(
      Provider<HeikaCacheDatabase> databaseProvider) {
    return new NativeModule_ProvideCacheDaoFactory(databaseProvider);
  }

  public static HeikaCacheDao provideCacheDao(HeikaCacheDatabase database) {
    return Preconditions.checkNotNullFromProvides(NativeModule.INSTANCE.provideCacheDao(database));
  }
}
