# 首位管理员引导

注册流程开放，但不会自动把首个注册者提升为管理员，避免公开站点被抢先注册后取得管理权限。

1. 在生产站点注册准备作为站点所有者的账号，并完成邮箱验证。
2. 在 Supabase Dashboard 的 SQL Editor 中，以数据库所有者身份运行下面的语句，把邮箱替换为该账号自己的邮箱：

```sql
select public.bootstrap_first_admin(id)
from auth.users
where lower(email) = lower('owner@example.com')
order by created_at asc
limit 1;
```

3. 重新登录站点。管理员入口会出现在「我的 → 设置 → 安全管理」。

引导函数只允许数据库所有者调用，并且只在尚无管理员时成功一次。后续管理员可以在管理后台搜索账号并调整成员/管理员角色；数据库会拒绝移除最后一位管理员。
