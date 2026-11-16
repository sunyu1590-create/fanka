package com.heika.nativeapp.data;

import com.heika.nativeapp.auth.AuthRepository;
import com.heika.nativeapp.db.FeedCache;
import com.heika.nativeapp.db.HeikaCacheDao;
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
public final class HeikaRepository_Factory implements Factory<HeikaRepository> {
  private final Provider<HeikaApi> apiProvider;

  private final Provider<AuthRepository> authProvider;

  private final Provider<FeedCache> cacheProvider;

  private final Provider<HeikaCacheDao> cacheDaoProvider;

  public HeikaRepository_Factory(Provider<HeikaApi> apiProvider,
      Provider<AuthRepository> authProvider, Provider<FeedCache> cacheProvider,
      Provider<HeikaCacheDao> cacheDaoProvider) {
    this.apiProvider = apiProvider;
    this.authProvider = authProvider;
    this.cacheProvider = cacheProvider;
    this.cacheDaoProvider = cacheDaoProvider;
  }

  @Override
  public HeikaRepository get() {
    return newInstance(apiProvider.get(), authProvider.get(), cacheProvider.get(), cacheDaoProvider.get());
  }

  public static HeikaRepository_Factory create(Provider<HeikaApi> apiProvider,
      Provider<AuthRepository> authProvider, Provider<FeedCache> cacheProvider,
      Provider<HeikaCacheDao> cacheDaoProvider) {
    return new HeikaRepository_Factory(apiProvider, authProvider, cacheProvider, cacheDaoProvider);
  }

  public static HeikaRepository newInstance(HeikaApi api, AuthRepository auth, FeedCache cache,
      HeikaCacheDao cacheDao) {
    return new HeikaRepository(api, auth, cache, cacheDao);
  }
}
