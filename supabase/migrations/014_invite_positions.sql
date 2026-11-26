-- ============================================================
-- MD Portal — Migration 014: invites carry the approver flags
-- (the admin picks one "Position" in the UI; role, department and
--  the Approver / Finance-seat flags all ride on the invite code,
--  so nothing needs ticking after the person signs up)
-- Idempotent: safe to run repeatedly in Supabase SQL Editor.
-- ============================================================

alter table invite_codes add column if not exists is_approver boolean not null default false;
alter table invite_codes add column if not exists is_finance_approver boolean not null default false;

-- Refuse creating a Finance-Manager invite while the single Finance seat
-- is taken (by a signed-up profile or by another unused invite).
create or replace function public.guard_invite_finance_seat()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.is_finance_approver then
    if exists (select 1 from profiles where is_finance_approver)
       or exists (select 1 from invite_codes
                   where is_finance_approver and used_by is null and code <> new.code) then
      raise exception 'Finance seat already taken — only one Finance Manager can exist';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invite_finance_seat on invite_codes;
create trigger trg_invite_finance_seat
  before insert or update on invite_codes
  for each row execute function public.guard_invite_finance_seat();

-- Signup handler: copy the flags from the invite onto the new profile.
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

    insert into public.profiles (id, full_name, role, department, job_title,
                                 is_approver, is_finance_approver)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
      v_inv.role,
      v_dept,
      v_inv.job_title,
      coalesce(v_inv.is_approver, false),
      coalesce(v_inv.is_finance_approver, false)
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

-- ---------- Confirmation (you should see one row, all true) ----------
select
  exists (select 1 from information_schema.columns
          where table_name = 'invite_codes' and column_name = 'is_approver')  as invite_flags_added,
  exists (select 1 from pg_trigger
          where tgname = 'trg_invite_finance_seat')                           as finance_seat_guarded,
  (select position('is_finance_approver' in prosrc) > 0 from pg_proc
    where proname = 'handle_new_user')                                        as signup_copies_flags;
