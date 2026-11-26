-- 013: The "Finance approver" is a single seat (the Finance Manager), not a general option,
--      and the GM/VP (approvers) can always perform the finance step themselves.
-- Idempotent: safe to re-run.

-- 1. Finance (money-check) step accepts: the Finance Manager seat holder, the GM, or the VP.
create or replace function public.is_finance()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.can_approve()
      or coalesce((select is_finance_approver from profiles where id = auth.uid()), false);
$$;

-- 2. At most ONE person in the whole company can hold the Finance approver seat.
--    (A second tick is rejected by the database itself.)
create unique index if not exists profiles_one_finance_approver
  on profiles ((true)) where is_finance_approver;

-- 3. Clearer error message on the finance step.
create or replace function public.decide_office_request(
  p_request_id uuid,
  p_approve boolean,
  p_comment text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_req office_requests%rowtype;
begin
  select * into v_req from office_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_req.status = 'pending_finance' then
    if not public.is_finance() then
      raise exception 'This step is the money check — only the Finance Manager, GM or VP can decide it';
    end if;
    update office_requests
       set status = case when p_approve then 'pending_approval' else 'rejected' end,
           finance_by = auth.uid(), finance_at = now(), finance_comment = p_comment
     where id = p_request_id;
  elsif v_req.status = 'pending_approval' then
    if not public.can_approve() then
      raise exception 'Only the GM or an approver (VP) can give the final approval';
    end if;
    update office_requests
       set status = case when p_approve then 'approved' else 'rejected' end,
           decided_by = auth.uid(), decided_at = now(), decided_comment = p_comment
     where id = p_request_id;
  else
    raise exception 'This request was already decided';
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- ---------- Confirmation (you should see one row, both true) ----------
select
  (select position('can_approve' in prosrc) > 0 from pg_proc
    where proname = 'is_finance')                                        as gm_vp_can_do_finance_step,
  exists (select 1 from pg_indexes
    where indexname = 'profiles_one_finance_approver')                   as only_one_finance_seat;
