-- ============================================================
-- MD Portal — Migration 008: job titles (separate from system roles)
-- Idempotent: safe to run repeatedly in Supabase SQL Editor.
--
-- The ROLE (admin/manager/sales_rep/...) is the permission level.
-- The JOB TITLE (General Manager, VP, Business Development Manager…)
-- is what people see. Invite codes carry both, so a new account
-- lands with the right title and the right permissions.
-- ============================================================

alter table profiles add column if not exists job_title text;
alter table invite_codes add column if not exists job_title text;

-- Only admin may change titles (like role/department/active)
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.department is distinct from old.department
       or new.job_title is distinct from old.job_title then
      raise exception 'Only admin can change role, job title, department or active status';
    end if;
  end if;
  return new;
end;
$$;

-- Signup via invite now carries the job title through
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_role user_role;
  v_dept text;
  v_title text;
begin
  if v_code <> '' then
    update invite_codes
      set used_by = new.id, used_at = now()
      where code = v_code and used_by is null
      returning role, department, job_title into v_role, v_dept, v_title;
    if not found then
      raise exception 'Invalid or already-used invite code';
    end if;
    insert into public.profiles (id, full_name, role, department, job_title)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
      v_role,
      v_dept,
      v_title
    );
  elsif new.email_confirmed_at is not null then
    insert into public.profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  else
    raise exception 'Sign-up requires an invite code';
  end if;
  return new;
end;
$$;

-- The one existing admin is the GM
update profiles set job_title = 'General Manager'
  where role = 'admin' and coalesce(job_title, '') = '';

notify pgrst, 'reload schema';
