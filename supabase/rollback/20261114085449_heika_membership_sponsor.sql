-- Guarded rollback for 20261114085449_heika_membership_sponsor.sql.
-- Run only after stopping web/app writes. It intentionally refuses to delete
-- issued codes, non-legacy entitlements, verified/pending orders, member
-- redemptions, or expanded deck slots.
begin;

do $$
begin
  if exists (select 1 from public.redeem_code_batches)
    or exists (select 1 from public.membership_redemptions)
    or exists (select 1 from public.afdian_orders)
    or exists (select 1 from public.membership_events where event_type <> 'legacy_import')
    or exists (select 1 from public.user_memberships where source <> 'legacy')
    or exists (select 1 from public.daily_cards where slot > 5) then
    raise exception 'Rollback blocked: membership activity or expanded deck data exists; preserve it and use a forward fix instead.';
  end if;

  if exists (
    select 1 from public.membership_plans p
    where not (
      (p.tier='free' and p.name='Free' and p.daily_flip_allowance=5 and p.price_cents=0 and p.currency='CNY' and p.duration_days is null)
      or (p.tier='plus' and p.name='Plus' and p.daily_flip_allowance=9 and p.price_cents=1200 and p.currency='CNY' and p.duration_days=30)
      or (p.tier='pro' and p.name='Pro' and p.daily_flip_allowance=13 and p.price_cents=1600 and p.currency='CNY' and p.duration_days=30)
    )
  ) then
    raise exception 'Rollback blocked: membership plan configuration has been changed; preserve it and use a forward fix instead.';
  end if;
end;
$$;

do $$
declare f record;
begin
  for f in
    select definition from membership_private.rollback_function_defs
    order by array_position(array[
      'public.set_membership_tier(uuid,text)',
      'public.confirm_daily_flip(uuid,text)',
      'public.get_daily_flip_state()',
      'public.get_daily_deck()',
      'public.open_daily_card(integer)',
      'public.open_daily_card_with_result(integer)',
      'public.record_experience_event(text,uuid)',
      'public.my_experience_summary()'
    ],signature)
  loop
    execute f.definition;
  end loop;
end;
$$;

do $$ begin
  if not exists (
    select 1 from membership_private.rollback_function_defs
    where signature='public.open_daily_card_with_result(integer)'
  ) then
    drop function if exists public.open_daily_card_with_result(integer);
  end if;
end;
$$;

drop function if exists public.get_my_membership_status();
drop function if exists public.admin_membership_batches();
drop function if exists public.admin_membership_summary();
drop function if exists public.admin_disable_membership_code(uuid);
drop function if exists public.admin_set_membership_batch_active(uuid,boolean);
drop function if exists public.admin_create_membership_batch(text,integer,text,timestamptz,jsonb);
drop function if exists public.admin_verify_afdian_order(uuid,text);
drop function if exists public.admin_reject_afdian_order(uuid,text);
drop function if exists public.admin_record_afdian_order(text,uuid,text,integer,integer,text);
drop function if exists public.admin_set_membership(uuid,text,integer,text);
drop function if exists public.confirm_membership_redemption(uuid);
drop function if exists public.preview_membership_code(text);

delete from public.membership_events where event_type='legacy_import';
delete from public.user_memberships where source='legacy';

drop table if exists public.membership_redemptions;
drop table if exists public.membership_redemption_previews;
drop table if exists public.membership_redemption_attempts;
drop table if exists public.redeem_codes;
drop table if exists public.redeem_code_batches;
drop table if exists public.membership_events;
drop table if exists public.afdian_orders;
drop table if exists public.user_memberships;
drop table if exists public.membership_plans;
drop schema if exists membership_private cascade;

alter table public.daily_cards drop constraint if exists daily_cards_slot_check;
alter table public.daily_cards add constraint daily_cards_slot_check check (slot between 1 and 5);

commit;
