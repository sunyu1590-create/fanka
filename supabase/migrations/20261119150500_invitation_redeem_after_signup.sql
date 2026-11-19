-- 允许已登录用户在注册后补填入驻邀请码。
--
-- 背景：20261119100000 中的 version 只允许邀请码在 signup 阶段使用
-- （`if b.code_kind='invitation' and not p_signup then raise ...`）。用户注册时
-- 若漏填、粘贴不完整或被前端截断，这个码就永久无法兑换，只能作废重发。
--
-- 本次只去掉这一条阶段限制，其余约束全部保留：
--   * 一码一用（status='unused' + for update 行锁）
--   * 批次必须 active 且未过期
--   * 同一账号不能重复获得同一枚徽章
--   * 认证码仍然只能在注册后兑换
-- 因此放开阶段后不会产生重复领取或越权兑换。
--
-- 该函数已在 2026-11-19 直接对生产库执行过同一份定义（CREATE OR REPLACE 幂等），
-- 此处补档，保证从零重建数据库时行为一致。

create or replace function public.redeem_access_code(p_code_hash text, p_user_id uuid, p_signup boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.access_codes%rowtype; b public.access_code_batches%rowtype; badge public.profile_badge_types%rowtype;
  v_start timestamptz; v_end timestamptz; v_tier text;
begin
  if p_code_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid access code'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id) then raise exception 'profile not found'; end if;
  select * into c from public.access_codes where code_hash=p_code_hash for update;
  if not found or c.status<>'unused' then raise exception 'access code is unavailable'; end if;
  select * into b from public.access_code_batches where id=c.batch_id for update;
  if not found or not b.active or (b.expires_at is not null and b.expires_at<=now()) then raise exception 'access code is unavailable'; end if;
  if b.code_kind='certification' and p_signup then raise exception 'certification code must be redeemed after registration'; end if;
  if b.code_kind='invitation' and not exists(select 1 from public.profile_badge_types where id=b.badge_id and slug='invited-member') then
    raise exception 'invitation badge is invalid';
  end if;
  select * into badge from public.profile_badge_types where id=b.badge_id and active;
  if not found then raise exception 'badge is unavailable'; end if;
  if exists(select 1 from public.user_badge_awards a where a.user_id=p_user_id and a.badge_id=b.badge_id and a.revoked_at is null) then
    raise exception 'account already has this certification';
  end if;
  update public.access_codes set status='redeemed',redeemed_by=p_user_id,redeemed_at=now() where id=c.id;
  insert into public.user_badge_awards(user_id,badge_id,source,source_code_id,granted_by)
    values(p_user_id,b.badge_id,case b.code_kind when 'invitation' then 'invite_code' else 'certification_code' end,c.id,b.created_by);
  v_tier:=null;
  if b.code_kind='invitation' then
    select tier,expires_at into v_tier,v_end from public.user_memberships where user_id=p_user_id for update;
    if v_tier in ('plus','pro') and (v_end is null or v_end>now()) then
      v_start:=coalesce((select starts_at from public.user_memberships where user_id=p_user_id),now());
      if v_end is null then v_end:=now()+make_interval(days=>b.reward_days); else v_end:=greatest(v_end,now())+make_interval(days=>b.reward_days); end if;
    else
      v_start:=now(); v_end:=now()+make_interval(days=>b.reward_days);
    end if;
    insert into public.user_memberships(user_id,tier,starts_at,expires_at,pending_tier,pending_days,source,updated_by,updated_at)
      values(p_user_id,'pro',v_start,v_end,null,0,'invite',b.created_by,now())
      on conflict(user_id) do update set tier='pro',starts_at=excluded.starts_at,expires_at=excluded.expires_at,
        pending_tier=null,pending_days=0,source='invite',updated_by=excluded.updated_by,updated_at=now();
    update public.profiles set membership_tier='pro' where id=p_user_id;
    insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
      values(p_user_id,b.created_by,'invite_reward','pro','invite',jsonb_build_object('days',b.reward_days,'expiresAt',v_end,'batchId',b.id,'codeId',c.id));
    v_tier:='pro';
  end if;
  return jsonb_build_object('kind',b.code_kind,'batchLabel',b.label,'badge',jsonb_build_object('id',badge.id,'slug',badge.slug,'label',badge.label,'color',badge.color),
    'tier',v_tier,'rewardDays',b.reward_days,'expiresAt',v_end);
end;
$$;

revoke all on function public.redeem_access_code(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.redeem_access_code(text,uuid,boolean) to service_role;
