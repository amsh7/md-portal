-- ============================================================
-- MD Portal — Migration 010: fix invite signup (department type)
-- Idempotent: safe to run repeatedly in Supabase SQL Editor.
--
-- Second signup bug: profiles.department is the enum department_t,
-- but invite_codes.department is text; plpgsql refuses to insert a
-- text variable into an enum column (42804), so invite signups still
-- failed after migration 009. Fix: cast safely, ignoring any value
-- that is not a real department label.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_inv invite_codes%rowtype;
  v_dept department_t;  -- stays null unless the invite names a valid department
begin
  if v_code <> '' then
    select * into v_inv from invite_codes
      where code = v_code and used_by is null
      for update;
    if not found then
      raise exception 'Invalid or already-used invite code';
    end if;

    if v_inv.department is not null
       and v_inv.department = any (enum_range(null::department_t)::text[]) then
      v_dept := v_inv.department::department_t;
    end if;

    insert into public.profiles (id, full_name, role, department, job_title)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
      v_inv.role,
      v_dept,
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
