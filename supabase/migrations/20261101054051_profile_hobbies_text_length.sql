alter table public.profile_attributes
  drop constraint profile_attributes_value_check,
  add constraint profile_attributes_value_check check (length(value) <= 180);
