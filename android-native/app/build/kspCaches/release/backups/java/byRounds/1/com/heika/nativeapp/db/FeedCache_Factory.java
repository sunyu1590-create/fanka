package com.heika.nativeapp.db;

import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
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
public final class FeedCache_Factory implements Factory<FeedCache> {
  private final Provider<HeikaCacheDao> daoProvider;

  public FeedCache_Factory(Provider<HeikaCacheDao> daoProvider) {
    this.daoProvider = daoProvider;
  }

  @Override
  public FeedCache get() {
    return newInstance(daoProvider.get());
  }

  public static FeedCache_Factory create(Provider<HeikaCacheDao> daoProvider) {
    return new FeedCache_Factory(daoProvider);
  }

  public static FeedCache newInstance(HeikaCacheDao dao) {
    return new FeedCache(dao);
  }
}
