package com.heika.nativeapp.di;

import android.content.Context;
import com.heika.nativeapp.db.HeikaCacheDatabase;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.Provider;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;

@ScopeMetadata("javax.inject.Singleton")
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
public final class NativeModule_ProvideDatabaseFactory implements Factory<HeikaCacheDatabase> {
  private final Provider<Context> contextProvider;

  public NativeModule_ProvideDatabaseFactory(Provider<Context> contextProvider) {
    this.contextProvider = contextProvider;
  }

  @Override
  public HeikaCacheDatabase get() {
    return provideDatabase(contextProvider.get());
  }

  public static NativeModule_ProvideDatabaseFactory create(Provider<Context> contextProvider) {
    return new NativeModule_ProvideDatabaseFactory(contextProvider);
  }

  public static HeikaCacheDatabase provideDatabase(Context context) {
    return Preconditions.checkNotNullFromProvides(NativeModule.INSTANCE.provideDatabase(context));
  }
}
