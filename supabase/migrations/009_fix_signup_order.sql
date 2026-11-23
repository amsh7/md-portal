-- ============================================================
-- MD Portal — Migration 009: fix invite signup (FK order bug)
-- Idempotent: safe to run repeatedly in Supabase SQL Editor.
--
-- Bug: handle_new_user marked the invite code used (used_by = new user)
-- BEFORE inserting the new user's profile row, violating the
-- invite_codes.used_by → profiles(id) foreign key (23503), so every
-- invite signup failed. Fix: validate+lock the code, insert the
-- profile first, then mark the code used.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_inv invite_codes%rowtype;
begin
  if v_code <> '' then
    select * into v_inv from invite_codes
      where code = v_code and used_by is null
      for update;
    if not found then
      raise exception 'Invalid or already-used invite code';
    end if;
    insert into public.profiles (id, full_name, role, department, job_title)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
      v_inv.role,
      v_inv.department,
      v_inv.job_title
    );
    update invite_codes
      set used_by = new.id, used_at = now()
      where code = v_inv.code;
  elsif new.email_confirmed_at is not null then
    -- created by the admin in the Supabase dashboard (Auto Confirm ticked)
    insert into public.profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  else
    raise exception 'Sign-up requires an invite code';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
