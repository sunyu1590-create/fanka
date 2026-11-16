package com.heika.nativeapp;

import android.app.Activity;
import android.app.Service;
import android.view.View;
import androidx.fragment.app.Fragment;
import androidx.lifecycle.SavedStateHandle;
import androidx.lifecycle.ViewModel;
import com.heika.nativeapp.auth.AccountViewModel;
import com.heika.nativeapp.auth.AccountViewModel_HiltModules;
import com.heika.nativeapp.auth.AccountViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.auth.AccountViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.auth.AuthRepository;
import com.heika.nativeapp.auth.SecureSessionStore;
import com.heika.nativeapp.data.HeikaApi;
import com.heika.nativeapp.data.HeikaRepository;
import com.heika.nativeapp.db.FeedCache;
import com.heika.nativeapp.db.HeikaCacheDao;
import com.heika.nativeapp.db.HeikaCacheDatabase;
import com.heika.nativeapp.di.NativeModule_ProvideCacheDaoFactory;
import com.heika.nativeapp.di.NativeModule_ProvideDatabaseFactory;
import com.heika.nativeapp.di.NativeModule_ProvideHeikaApiFactory;
import com.heika.nativeapp.di.NativeModule_ProvideOkHttpClientFactory;
import com.heika.nativeapp.feature.NativeActionViewModel;
import com.heika.nativeapp.feature.NativeActionViewModel_HiltModules;
import com.heika.nativeapp.feature.NativeActionViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.NativeActionViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.detail.PostDetailViewModel;
import com.heika.nativeapp.feature.detail.PostDetailViewModel_HiltModules;
import com.heika.nativeapp.feature.detail.PostDetailViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.detail.PostDetailViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.discovery.AiResourceCatalogViewModel;
import com.heika.nativeapp.feature.discovery.AiResourceCatalogViewModel_HiltModules;
import com.heika.nativeapp.feature.discovery.AiResourceCatalogViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.discovery.AiResourceCatalogViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.discovery.AiResourceFeedViewModel;
import com.heika.nativeapp.feature.discovery.AiResourceFeedViewModel_HiltModules;
import com.heika.nativeapp.feature.discovery.AiResourceFeedViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.discovery.AiResourceFeedViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.discovery.DiscoveryAdViewModel;
import com.heika.nativeapp.feature.discovery.DiscoveryAdViewModel_HiltModules;
import com.heika.nativeapp.feature.discovery.DiscoveryAdViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.discovery.DiscoveryAdViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.discovery.DiscoveryViewModel;
import com.heika.nativeapp.feature.discovery.DiscoveryViewModel_HiltModules;
import com.heika.nativeapp.feature.discovery.DiscoveryViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.discovery.DiscoveryViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.exploration.CoExploreViewModel;
import com.heika.nativeapp.feature.exploration.CoExploreViewModel_HiltModules;
import com.heika.nativeapp.feature.exploration.CoExploreViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.exploration.CoExploreViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.exploration.ExplorationCalendarViewModel;
import com.heika.nativeapp.feature.exploration.ExplorationCalendarViewModel_HiltModules;
import com.heika.nativeapp.feature.exploration.ExplorationCalendarViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.exploration.ExplorationCalendarViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.exploration.ExplorationChainsViewModel;
import com.heika.nativeapp.feature.exploration.ExplorationChainsViewModel_HiltModules;
import com.heika.nativeapp.feature.exploration.ExplorationChainsViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.exploration.ExplorationChainsViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.exploration.ExplorationViewModel;
import com.heika.nativeapp.feature.exploration.ExplorationViewModel_HiltModules;
import com.heika.nativeapp.feature.exploration.ExplorationViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.exploration.ExplorationViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.home.HomeViewModel;
import com.heika.nativeapp.feature.home.HomeViewModel_HiltModules;
import com.heika.nativeapp.feature.home.HomeViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.home.HomeViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.messages.MessagesViewModel;
import com.heika.nativeapp.feature.messages.MessagesViewModel_HiltModules;
import com.heika.nativeapp.feature.messages.MessagesViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.messages.MessagesViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.notifications.ForegroundNotificationsViewModel;
import com.heika.nativeapp.feature.notifications.ForegroundNotificationsViewModel_HiltModules;
import com.heika.nativeapp.feature.notifications.ForegroundNotificationsViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.notifications.ForegroundNotificationsViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.notifications.NotificationsViewModel;
import com.heika.nativeapp.feature.notifications.NotificationsViewModel_HiltModules;
import com.heika.nativeapp.feature.notifications.NotificationsViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.notifications.NotificationsViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.profile.ProfileViewModel;
import com.heika.nativeapp.feature.profile.ProfileViewModel_HiltModules;
import com.heika.nativeapp.feature.profile.ProfileViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.profile.ProfileViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.publish.PublishViewModel;
import com.heika.nativeapp.feature.publish.PublishViewModel_HiltModules;
import com.heika.nativeapp.feature.publish.PublishViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.publish.PublishViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.search.SearchViewModel;
import com.heika.nativeapp.feature.search.SearchViewModel_HiltModules;
import com.heika.nativeapp.feature.search.SearchViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.search.SearchViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.settings.AdminCenterViewModel;
import com.heika.nativeapp.feature.settings.AdminCenterViewModel_HiltModules;
import com.heika.nativeapp.feature.settings.AdminCenterViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.settings.AdminCenterViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.feature.settings.SettingsViewModel;
import com.heika.nativeapp.feature.settings.SettingsViewModel_HiltModules;
import com.heika.nativeapp.feature.settings.SettingsViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.feature.settings.SettingsViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.ui.AppUpdateViewModel;
import com.heika.nativeapp.ui.AppUpdateViewModel_HiltModules;
import com.heika.nativeapp.ui.AppUpdateViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.ui.AppUpdateViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import com.heika.nativeapp.ui.HeikaImageCache;
import com.heika.nativeapp.ui.NativePreferences;
import com.heika.nativeapp.ui.NetworkRegionNoticeViewModel;
import com.heika.nativeapp.ui.NetworkRegionNoticeViewModel_HiltModules;
import com.heika.nativeapp.ui.NetworkRegionNoticeViewModel_HiltModules_BindsModule_Binds_LazyMapKey;
import com.heika.nativeapp.ui.NetworkRegionNoticeViewModel_HiltModules_KeyModule_Provide_LazyMapKey;
import dagger.hilt.android.ActivityRetainedLifecycle;
import dagger.hilt.android.ViewModelLifecycle;
import dagger.hilt.android.internal.builders.ActivityComponentBuilder;
import dagger.hilt.android.internal.builders.ActivityRetainedComponentBuilder;
import dagger.hilt.android.internal.builders.FragmentComponentBuilder;
import dagger.hilt.android.internal.builders.ServiceComponentBuilder;
import dagger.hilt.android.internal.builders.ViewComponentBuilder;
import dagger.hilt.android.internal.builders.ViewModelComponentBuilder;
import dagger.hilt.android.internal.builders.ViewWithFragmentComponentBuilder;
import dagger.hilt.android.internal.lifecycle.DefaultViewModelFactories;
import dagger.hilt.android.internal.lifecycle.DefaultViewModelFactories_InternalFactoryFactory_Factory;
import dagger.hilt.android.internal.managers.ActivityRetainedComponentManager_LifecycleModule_ProvideActivityRetainedLifecycleFactory;
import dagger.hilt.android.internal.managers.SavedStateHandleHolder;
import dagger.hilt.android.internal.modules.ApplicationContextModule;
import dagger.hilt.android.internal.modules.ApplicationContextModule_ProvideContextFactory;
import dagger.internal.DaggerGenerated;
import dagger.internal.DoubleCheck;
import dagger.internal.LazyClassKeyMap;
import dagger.internal.MapBuilder;
import dagger.internal.Preconditions;
import dagger.internal.Provider;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import javax.annotation.processing.Generated;
import okhttp3.OkHttpClient;

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
public final class DaggerHeikaApplication_HiltComponents_SingletonC {
  private DaggerHeikaApplication_HiltComponents_SingletonC() {
  }

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private ApplicationContextModule applicationContextModule;

    private Builder() {
    }

    public Builder applicationContextModule(ApplicationContextModule applicationContextModule) {
      this.applicationContextModule = Preconditions.checkNotNull(applicationContextModule);
      return this;
    }

    public HeikaApplication_HiltComponents.SingletonC build() {
      Preconditions.checkBuilderRequirement(applicationContextModule, ApplicationContextModule.class);
      return new SingletonCImpl(applicationContextModule);
    }
  }

  private static final class ActivityRetainedCBuilder implements HeikaApplication_HiltComponents.ActivityRetainedC.Builder {
    private final SingletonCImpl singletonCImpl;

    private SavedStateHandleHolder savedStateHandleHolder;

    private ActivityRetainedCBuilder(SingletonCImpl singletonCImpl) {
      this.singletonCImpl = singletonCImpl;
    }

    @Override
    public ActivityRetainedCBuilder savedStateHandleHolder(
        SavedStateHandleHolder savedStateHandleHolder) {
      this.savedStateHandleHolder = Preconditions.checkNotNull(savedStateHandleHolder);
      return this;
    }

    @Override
    public HeikaApplication_HiltComponents.ActivityRetainedC build() {
      Preconditions.checkBuilderRequirement(savedStateHandleHolder, SavedStateHandleHolder.class);
      return new ActivityRetainedCImpl(singletonCImpl, savedStateHandleHolder);
    }
  }

  private static final class ActivityCBuilder implements HeikaApplication_HiltComponents.ActivityC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private Activity activity;

    private ActivityCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
    }

    @Override
    public ActivityCBuilder activity(Activity activity) {
      this.activity = Preconditions.checkNotNull(activity);
      return this;
    }

    @Override
    public HeikaApplication_HiltComponents.ActivityC build() {
      Preconditions.checkBuilderRequirement(activity, Activity.class);
      return new ActivityCImpl(singletonCImpl, activityRetainedCImpl, activity);
    }
  }

  private static final class FragmentCBuilder implements HeikaApplication_HiltComponents.FragmentC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private Fragment fragment;

    private FragmentCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
    }

    @Override
    public FragmentCBuilder fragment(Fragment fragment) {
      this.fragment = Preconditions.checkNotNull(fragment);
      return this;
    }

    @Override
    public HeikaApplication_HiltComponents.FragmentC build() {
      Preconditions.checkBuilderRequirement(fragment, Fragment.class);
      return new FragmentCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, fragment);
    }
  }

  private static final class ViewWithFragmentCBuilder implements HeikaApplication_HiltComponents.ViewWithFragmentC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl;

    private View view;

    private ViewWithFragmentCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        FragmentCImpl fragmentCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
      this.fragmentCImpl = fragmentCImpl;
    }

    @Override
    public ViewWithFragmentCBuilder view(View view) {
      this.view = Preconditions.checkNotNull(view);
      return this;
    }

    @Override
    public HeikaApplication_HiltComponents.ViewWithFragmentC build() {
      Preconditions.checkBuilderRequirement(view, View.class);
      return new ViewWithFragmentCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, fragmentCImpl, view);
    }
  }

  private static final class ViewCBuilder implements HeikaApplication_HiltComponents.ViewC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private View view;

    private ViewCBuilder(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        ActivityCImpl activityCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
    }

    @Override
    public ViewCBuilder view(View view) {
      this.view = Preconditions.checkNotNull(view);
      return this;
    }

    @Override
    public HeikaApplication_HiltComponents.ViewC build() {
      Preconditions.checkBuilderRequirement(view, View.class);
      return new ViewCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, view);
    }
  }

  private static final class ViewModelCBuilder implements HeikaApplication_HiltComponents.ViewModelC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private SavedStateHandle savedStateHandle;

    private ViewModelLifecycle viewModelLifecycle;

    private ViewModelCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
    }

    @Override
    public ViewModelCBuilder savedStateHandle(SavedStateHandle handle) {
      this.savedStateHandle = Preconditions.checkNotNull(handle);
      return this;
    }

    @Override
    public ViewModelCBuilder viewModelLifecycle(ViewModelLifecycle viewModelLifecycle) {
      this.viewModelLifecycle = Preconditions.checkNotNull(viewModelLifecycle);
      return this;
    }

    @Override
    public HeikaApplication_HiltComponents.ViewModelC build() {
      Preconditions.checkBuilderRequirement(savedStateHandle, SavedStateHandle.class);
      Preconditions.checkBuilderRequirement(viewModelLifecycle, ViewModelLifecycle.class);
      return new ViewModelCImpl(singletonCImpl, activityRetainedCImpl, savedStateHandle, viewModelLifecycle);
    }
  }

  private static final class ServiceCBuilder implements HeikaApplication_HiltComponents.ServiceC.Builder {
    private final SingletonCImpl singletonCImpl;

    private Service service;

    private ServiceCBuilder(SingletonCImpl singletonCImpl) {
      this.singletonCImpl = singletonCImpl;
    }

    @Override
    public ServiceCBuilder service(Service service) {
      this.service = Preconditions.checkNotNull(service);
      return this;
    }

    @Override
    public HeikaApplication_HiltComponents.ServiceC build() {
      Preconditions.checkBuilderRequirement(service, Service.class);
      return new ServiceCImpl(singletonCImpl, service);
    }
  }

  private static final class ViewWithFragmentCImpl extends HeikaApplication_HiltComponents.ViewWithFragmentC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl;

    private final ViewWithFragmentCImpl viewWithFragmentCImpl = this;

    ViewWithFragmentCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        FragmentCImpl fragmentCImpl, View viewParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
      this.fragmentCImpl = fragmentCImpl;


    }
  }

  private static final class FragmentCImpl extends HeikaApplication_HiltComponents.FragmentC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl = this;

    FragmentCImpl(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        ActivityCImpl activityCImpl, Fragment fragmentParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;


    }

    @Override
    public DefaultViewModelFactories.InternalFactoryFactory getHiltInternalFactoryFactory() {
      return activityCImpl.getHiltInternalFactoryFactory();
    }

    @Override
    public ViewWithFragmentComponentBuilder viewWithFragmentComponentBuilder() {
      return new ViewWithFragmentCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl, fragmentCImpl);
    }
  }

  private static final class ViewCImpl extends HeikaApplication_HiltComponents.ViewC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final ViewCImpl viewCImpl = this;

    ViewCImpl(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        ActivityCImpl activityCImpl, View viewParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;


    }
  }

  private static final class ActivityCImpl extends HeikaApplication_HiltComponents.ActivityC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl = this;

    ActivityCImpl(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        Activity activityParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;


    }

    @Override
    public void injectMainActivity(MainActivity mainActivity) {
      injectMainActivity2(mainActivity);
    }

    @Override
    public DefaultViewModelFactories.InternalFactoryFactory getHiltInternalFactoryFactory() {
      return DefaultViewModelFactories_InternalFactoryFactory_Factory.newInstance(getViewModelKeys(), new ViewModelCBuilder(singletonCImpl, activityRetainedCImpl));
    }

    @Override
    public Map<Class<?>, Boolean> getViewModelKeys() {
      return LazyClassKeyMap.<Boolean>of(MapBuilder.<String, Boolean>newMapBuilder(22).put(AccountViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, AccountViewModel_HiltModules.KeyModule.provide()).put(AdminCenterViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, AdminCenterViewModel_HiltModules.KeyModule.provide()).put(AiResourceCatalogViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, AiResourceCatalogViewModel_HiltModules.KeyModule.provide()).put(AiResourceFeedViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, AiResourceFeedViewModel_HiltModules.KeyModule.provide()).put(AppUpdateViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, AppUpdateViewModel_HiltModules.KeyModule.provide()).put(CoExploreViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, CoExploreViewModel_HiltModules.KeyModule.provide()).put(DiscoveryAdViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, DiscoveryAdViewModel_HiltModules.KeyModule.provide()).put(DiscoveryViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, DiscoveryViewModel_HiltModules.KeyModule.provide()).put(ExplorationCalendarViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, ExplorationCalendarViewModel_HiltModules.KeyModule.provide()).put(ExplorationChainsViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, ExplorationChainsViewModel_HiltModules.KeyModule.provide()).put(ExplorationViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, ExplorationViewModel_HiltModules.KeyModule.provide()).put(ForegroundNotificationsViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, ForegroundNotificationsViewModel_HiltModules.KeyModule.provide()).put(HomeViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, HomeViewModel_HiltModules.KeyModule.provide()).put(MessagesViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, MessagesViewModel_HiltModules.KeyModule.provide()).put(NativeActionViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, NativeActionViewModel_HiltModules.KeyModule.provide()).put(NetworkRegionNoticeViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, NetworkRegionNoticeViewModel_HiltModules.KeyModule.provide()).put(NotificationsViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, NotificationsViewModel_HiltModules.KeyModule.provide()).put(PostDetailViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, PostDetailViewModel_HiltModules.KeyModule.provide()).put(ProfileViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, ProfileViewModel_HiltModules.KeyModule.provide()).put(PublishViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, PublishViewModel_HiltModules.KeyModule.provide()).put(SearchViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, SearchViewModel_HiltModules.KeyModule.provide()).put(SettingsViewModel_HiltModules_KeyModule_Provide_LazyMapKey.lazyClassKeyName, SettingsViewModel_HiltModules.KeyModule.provide()).build());
    }

    @Override
    public ViewModelComponentBuilder getViewModelComponentBuilder() {
      return new ViewModelCBuilder(singletonCImpl, activityRetainedCImpl);
    }

    @Override
    public FragmentComponentBuilder fragmentComponentBuilder() {
      return new FragmentCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl);
    }

    @Override
    public ViewComponentBuilder viewComponentBuilder() {
      return new ViewCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl);
    }

    private MainActivity injectMainActivity2(MainActivity instance) {
      MainActivity_MembersInjector.injectImageCache(instance, singletonCImpl.heikaImageCacheProvider.get());
      MainActivity_MembersInjector.injectPreferences(instance, singletonCImpl.nativePreferencesProvider.get());
      return instance;
    }
  }

  private static final class ViewModelCImpl extends HeikaApplication_HiltComponents.ViewModelC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ViewModelCImpl viewModelCImpl = this;

    Provider<AccountViewModel> accountViewModelProvider;

    Provider<AdminCenterViewModel> adminCenterViewModelProvider;

    Provider<AiResourceCatalogViewModel> aiResourceCatalogViewModelProvider;

    Provider<AiResourceFeedViewModel> aiResourceFeedViewModelProvider;

    Provider<AppUpdateViewModel> appUpdateViewModelProvider;

    Provider<CoExploreViewModel> coExploreViewModelProvider;

    Provider<DiscoveryAdViewModel> discoveryAdViewModelProvider;

    Provider<DiscoveryViewModel> discoveryViewModelProvider;

    Provider<ExplorationCalendarViewModel> explorationCalendarViewModelProvider;

    Provider<ExplorationChainsViewModel> explorationChainsViewModelProvider;

    Provider<ExplorationViewModel> explorationViewModelProvider;

    Provider<ForegroundNotificationsViewModel> foregroundNotificationsViewModelProvider;

    Provider<HomeViewModel> homeViewModelProvider;

    Provider<MessagesViewModel> messagesViewModelProvider;

    Provider<NativeActionViewModel> nativeActionViewModelProvider;

    Provider<NetworkRegionNoticeViewModel> networkRegionNoticeViewModelProvider;

    Provider<NotificationsViewModel> notificationsViewModelProvider;

    Provider<PostDetailViewModel> postDetailViewModelProvider;

    Provider<ProfileViewModel> profileViewModelProvider;

    Provider<PublishViewModel> publishViewModelProvider;

    Provider<SearchViewModel> searchViewModelProvider;

    Provider<SettingsViewModel> settingsViewModelProvider;

    ViewModelCImpl(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        SavedStateHandle savedStateHandleParam, ViewModelLifecycle viewModelLifecycleParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;

      initialize(savedStateHandleParam, viewModelLifecycleParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final SavedStateHandle savedStateHandleParam,
        final ViewModelLifecycle viewModelLifecycleParam) {
      this.accountViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 0);
      this.adminCenterViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 1);
      this.aiResourceCatalogViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 2);
      this.aiResourceFeedViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 3);
      this.appUpdateViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 4);
      this.coExploreViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 5);
      this.discoveryAdViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 6);
      this.discoveryViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 7);
      this.explorationCalendarViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 8);
      this.explorationChainsViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 9);
      this.explorationViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 10);
      this.foregroundNotificationsViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 11);
      this.homeViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 12);
      this.messagesViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 13);
      this.nativeActionViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 14);
      this.networkRegionNoticeViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 15);
      this.notificationsViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 16);
      this.postDetailViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 17);
      this.profileViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 18);
      this.publishViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 19);
      this.searchViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 20);
      this.settingsViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 21);
    }

    @Override
    public Map<Class<?>, javax.inject.Provider<ViewModel>> getHiltViewModelMap() {
      return LazyClassKeyMap.<javax.inject.Provider<ViewModel>>of(MapBuilder.<String, javax.inject.Provider<ViewModel>>newMapBuilder(22).put(AccountViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (accountViewModelProvider))).put(AdminCenterViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (adminCenterViewModelProvider))).put(AiResourceCatalogViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (aiResourceCatalogViewModelProvider))).put(AiResourceFeedViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (aiResourceFeedViewModelProvider))).put(AppUpdateViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (appUpdateViewModelProvider))).put(CoExploreViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (coExploreViewModelProvider))).put(DiscoveryAdViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (discoveryAdViewModelProvider))).put(DiscoveryViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (discoveryViewModelProvider))).put(ExplorationCalendarViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (explorationCalendarViewModelProvider))).put(ExplorationChainsViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (explorationChainsViewModelProvider))).put(ExplorationViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (explorationViewModelProvider))).put(ForegroundNotificationsViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (foregroundNotificationsViewModelProvider))).put(HomeViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (homeViewModelProvider))).put(MessagesViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (messagesViewModelProvider))).put(NativeActionViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (nativeActionViewModelProvider))).put(NetworkRegionNoticeViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (networkRegionNoticeViewModelProvider))).put(NotificationsViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (notificationsViewModelProvider))).put(PostDetailViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (postDetailViewModelProvider))).put(ProfileViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (profileViewModelProvider))).put(PublishViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (publishViewModelProvider))).put(SearchViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (searchViewModelProvider))).put(SettingsViewModel_HiltModules_BindsModule_Binds_LazyMapKey.lazyClassKeyName, ((Provider) (settingsViewModelProvider))).build());
    }

    @Override
    public Map<Class<?>, Object> getHiltViewModelAssistedMap() {
      return Collections.<Class<?>, Object>emptyMap();
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final ActivityRetainedCImpl activityRetainedCImpl;

      private final ViewModelCImpl viewModelCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
          ViewModelCImpl viewModelCImpl, int id) {
        this.singletonCImpl = singletonCImpl;
        this.activityRetainedCImpl = activityRetainedCImpl;
        this.viewModelCImpl = viewModelCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // com.heika.nativeapp.auth.AccountViewModel
          return (T) new AccountViewModel(singletonCImpl.authRepositoryProvider.get(), singletonCImpl.heikaRepositoryProvider.get());

          case 1: // com.heika.nativeapp.feature.settings.AdminCenterViewModel
          return (T) new AdminCenterViewModel(singletonCImpl.heikaRepositoryProvider.get());

          case 2: // com.heika.nativeapp.feature.discovery.AiResourceCatalogViewModel
          return (T) new AiResourceCatalogViewModel(singletonCImpl.heikaRepositoryProvider.get());

          case 3: // com.heika.nativeapp.feature.discovery.AiResourceFeedViewModel
          return (T) new AiResourceFeedViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.nativePreferencesProvider.get());

          case 4: // com.heika.nativeapp.ui.AppUpdateViewModel
          return (T) new AppUpdateViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.nativePreferencesProvider.get(), ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 5: // com.heika.nativeapp.feature.exploration.CoExploreViewModel
          return (T) new CoExploreViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get());

          case 6: // com.heika.nativeapp.feature.discovery.DiscoveryAdViewModel
          return (T) new DiscoveryAdViewModel(singletonCImpl.heikaRepositoryProvider.get());

          case 7: // com.heika.nativeapp.feature.discovery.DiscoveryViewModel
          return (T) new DiscoveryViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.nativePreferencesProvider.get());

          case 8: // com.heika.nativeapp.feature.exploration.ExplorationCalendarViewModel
          return (T) new ExplorationCalendarViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get());

          case 9: // com.heika.nativeapp.feature.exploration.ExplorationChainsViewModel
          return (T) new ExplorationChainsViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get());

          case 10: // com.heika.nativeapp.feature.exploration.ExplorationViewModel
          return (T) new ExplorationViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get());

          case 11: // com.heika.nativeapp.feature.notifications.ForegroundNotificationsViewModel
          return (T) new ForegroundNotificationsViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get());

          case 12: // com.heika.nativeapp.feature.home.HomeViewModel
          return (T) new HomeViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get());

          case 13: // com.heika.nativeapp.feature.messages.MessagesViewModel
          return (T) new MessagesViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get());

          case 14: // com.heika.nativeapp.feature.NativeActionViewModel
          return (T) new NativeActionViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get());

          case 15: // com.heika.nativeapp.ui.NetworkRegionNoticeViewModel
          return (T) new NetworkRegionNoticeViewModel(singletonCImpl.provideHeikaApiProvider.get(), singletonCImpl.nativePreferencesProvider.get(), ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 16: // com.heika.nativeapp.feature.notifications.NotificationsViewModel
          return (T) new NotificationsViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get());

          case 17: // com.heika.nativeapp.feature.detail.PostDetailViewModel
          return (T) new PostDetailViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get(), singletonCImpl.nativePreferencesProvider.get());

          case 18: // com.heika.nativeapp.feature.profile.ProfileViewModel
          return (T) new ProfileViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get());

          case 19: // com.heika.nativeapp.feature.publish.PublishViewModel
          return (T) new PublishViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.authRepositoryProvider.get(), ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 20: // com.heika.nativeapp.feature.search.SearchViewModel
          return (T) new SearchViewModel(singletonCImpl.heikaRepositoryProvider.get(), singletonCImpl.nativePreferencesProvider.get());

          case 21: // com.heika.nativeapp.feature.settings.SettingsViewModel
          return (T) new SettingsViewModel(singletonCImpl.nativePreferencesProvider.get(), singletonCImpl.heikaImageCacheProvider.get(), singletonCImpl.authRepositoryProvider.get(), singletonCImpl.heikaRepositoryProvider.get());

          default: throw new AssertionError(id);
        }
      }
    }
  }

  private static final class ActivityRetainedCImpl extends HeikaApplication_HiltComponents.ActivityRetainedC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl = this;

    Provider<ActivityRetainedLifecycle> provideActivityRetainedLifecycleProvider;

    ActivityRetainedCImpl(SingletonCImpl singletonCImpl,
        SavedStateHandleHolder savedStateHandleHolderParam) {
      this.singletonCImpl = singletonCImpl;

      initialize(savedStateHandleHolderParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final SavedStateHandleHolder savedStateHandleHolderParam) {
      this.provideActivityRetainedLifecycleProvider = DoubleCheck.provider(new SwitchingProvider<ActivityRetainedLifecycle>(singletonCImpl, activityRetainedCImpl, 0));
    }

    @Override
    public ActivityComponentBuilder activityComponentBuilder() {
      return new ActivityCBuilder(singletonCImpl, activityRetainedCImpl);
    }

    @Override
    public ActivityRetainedLifecycle getActivityRetainedLifecycle() {
      return provideActivityRetainedLifecycleProvider.get();
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final ActivityRetainedCImpl activityRetainedCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
          int id) {
        this.singletonCImpl = singletonCImpl;
        this.activityRetainedCImpl = activityRetainedCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // dagger.hilt.android.ActivityRetainedLifecycle
          return (T) ActivityRetainedComponentManager_LifecycleModule_ProvideActivityRetainedLifecycleFactory.provideActivityRetainedLifecycle();

          default: throw new AssertionError(id);
        }
      }
    }
  }

  private static final class ServiceCImpl extends HeikaApplication_HiltComponents.ServiceC {
    private final SingletonCImpl singletonCImpl;

    private final ServiceCImpl serviceCImpl = this;

    ServiceCImpl(SingletonCImpl singletonCImpl, Service serviceParam) {
      this.singletonCImpl = singletonCImpl;


    }
  }

  private static final class SingletonCImpl extends HeikaApplication_HiltComponents.SingletonC {
    private final ApplicationContextModule applicationContextModule;

    private final SingletonCImpl singletonCImpl = this;

    Provider<SecureSessionStore> secureSessionStoreProvider;

    Provider<OkHttpClient> provideOkHttpClientProvider;

    Provider<HeikaApi> provideHeikaApiProvider;

    Provider<AuthRepository> authRepositoryProvider;

    Provider<NativePreferences> nativePreferencesProvider;

    Provider<HeikaImageCache> heikaImageCacheProvider;

    Provider<HeikaCacheDatabase> provideDatabaseProvider;

    Provider<HeikaCacheDao> provideCacheDaoProvider;

    Provider<FeedCache> feedCacheProvider;

    Provider<HeikaRepository> heikaRepositoryProvider;

    SingletonCImpl(ApplicationContextModule applicationContextModuleParam) {
      this.applicationContextModule = applicationContextModuleParam;
      initialize(applicationContextModuleParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final ApplicationContextModule applicationContextModuleParam) {
      this.secureSessionStoreProvider = DoubleCheck.provider(new SwitchingProvider<SecureSessionStore>(singletonCImpl, 1));
      this.provideOkHttpClientProvider = DoubleCheck.provider(new SwitchingProvider<OkHttpClient>(singletonCImpl, 3));
      this.provideHeikaApiProvider = DoubleCheck.provider(new SwitchingProvider<HeikaApi>(singletonCImpl, 2));
      this.authRepositoryProvider = DoubleCheck.provider(new SwitchingProvider<AuthRepository>(singletonCImpl, 0));
      this.nativePreferencesProvider = DoubleCheck.provider(new SwitchingProvider<NativePreferences>(singletonCImpl, 5));
      this.heikaImageCacheProvider = DoubleCheck.provider(new SwitchingProvider<HeikaImageCache>(singletonCImpl, 4));
      this.provideDatabaseProvider = DoubleCheck.provider(new SwitchingProvider<HeikaCacheDatabase>(singletonCImpl, 9));
      this.provideCacheDaoProvider = DoubleCheck.provider(new SwitchingProvider<HeikaCacheDao>(singletonCImpl, 8));
      this.feedCacheProvider = DoubleCheck.provider(new SwitchingProvider<FeedCache>(singletonCImpl, 7));
      this.heikaRepositoryProvider = DoubleCheck.provider(new SwitchingProvider<HeikaRepository>(singletonCImpl, 6));
    }

    @Override
    public void injectHeikaApplication(HeikaApplication heikaApplication) {
      injectHeikaApplication2(heikaApplication);
    }

    @Override
    public Set<Boolean> getDisableFragmentGetContextFix() {
      return Collections.<Boolean>emptySet();
    }

    @Override
    public ActivityRetainedComponentBuilder retainedComponentBuilder() {
      return new ActivityRetainedCBuilder(singletonCImpl);
    }

    @Override
    public ServiceComponentBuilder serviceComponentBuilder() {
      return new ServiceCBuilder(singletonCImpl);
    }

    private HeikaApplication injectHeikaApplication2(HeikaApplication instance) {
      HeikaApplication_MembersInjector.injectAuthRepository(instance, authRepositoryProvider.get());
      HeikaApplication_MembersInjector.injectImageCache(instance, heikaImageCacheProvider.get());
      return instance;
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, int id) {
        this.singletonCImpl = singletonCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // com.heika.nativeapp.auth.AuthRepository
          return (T) new AuthRepository(singletonCImpl.secureSessionStoreProvider.get(), DoubleCheck.lazy(singletonCImpl.provideHeikaApiProvider), singletonCImpl.provideOkHttpClientProvider.get());

          case 1: // com.heika.nativeapp.auth.SecureSessionStore
          return (T) new SecureSessionStore(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 2: // com.heika.nativeapp.data.HeikaApi
          return (T) NativeModule_ProvideHeikaApiFactory.provideHeikaApi(singletonCImpl.provideOkHttpClientProvider.get());

          case 3: // okhttp3.OkHttpClient
          return (T) NativeModule_ProvideOkHttpClientFactory.provideOkHttpClient();

          case 4: // com.heika.nativeapp.ui.HeikaImageCache
          return (T) new HeikaImageCache(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule), singletonCImpl.provideOkHttpClientProvider.get(), singletonCImpl.nativePreferencesProvider.get());

          case 5: // com.heika.nativeapp.ui.NativePreferences
          return (T) new NativePreferences(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 6: // com.heika.nativeapp.data.HeikaRepository
          return (T) new HeikaRepository(singletonCImpl.provideHeikaApiProvider.get(), singletonCImpl.authRepositoryProvider.get(), singletonCImpl.feedCacheProvider.get(), singletonCImpl.provideCacheDaoProvider.get());

          case 7: // com.heika.nativeapp.db.FeedCache
          return (T) new FeedCache(singletonCImpl.provideCacheDaoProvider.get());

          case 8: // com.heika.nativeapp.db.HeikaCacheDao
          return (T) NativeModule_ProvideCacheDaoFactory.provideCacheDao(singletonCImpl.provideDatabaseProvider.get());

          case 9: // com.heika.nativeapp.db.HeikaCacheDatabase
          return (T) NativeModule_ProvideDatabaseFactory.provideDatabase(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          default: throw new AssertionError(id);
        }
      }
    }
  }
}
