-- ============================================================
-- MD Portal — Migration 006: deleting drafts and unused records
-- Idempotent: safe to run repeatedly in Supabase SQL Editor.
--
-- 1. Admin may delete a purchase order while it is still a DRAFT
--    (never after approval — it is a numbered business record then).
-- 2. A quotation can only be deleted while it is still a DRAFT,
--    no matter who tries (sent/accepted/rejected ones are records).
-- Document numbers are never reused after a delete — by design.
--
-- Hospitals, contacts, deals, products and warehouses were already
-- deletable by admin under RLS; the app now has buttons for that.
-- Anything with stock/invoice history stays protected by foreign
-- keys — the app shows a friendly message instead.
-- ============================================================

-- 1. Draft POs: admin-only delete
drop policy if exists po_delete on purchase_orders;
create policy po_delete on purchase_orders for delete to authenticated
  using (public.is_admin() and status = 'draft');

-- 1b. Patch the line guards from migration 005: when a permitted parent
-- delete cascades to the lines, the parent row is already gone (status
-- lookup returns null) — allow that instead of blocking the cascade.
create or replace function public.guard_po_lines()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_status po_status;
begin
  select status into v_status from purchase_orders
    where id = coalesce(new.po_id, old.po_id);
  if v_status is null then
    return coalesce(new, old);  -- cascade from a parent delete already permitted above
  end if;
  if v_status = 'draft' then
    return coalesce(new, old);
  end if;
  -- after draft, the only change allowed is received_qty (receiving)
  if tg_op = 'UPDATE'
     and new.po_id = old.po_id and new.product_id = old.product_id
     and new.qty = old.qty and new.unit_price = old.unit_price then
    return new;
  end if;
  raise exception 'PO lines can only be edited while the PO is a draft';
end;
$$;

create or replace function public.guard_quotation_lines()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_status quotation_status;
begin
  select status into v_status from quotations
    where id = coalesce(new.quotation_id, old.quotation_id);

  if v_status is null then
    return coalesce(new, old);  -- cascade from a draft-quotation delete (guard below)
  end if;

  -- lines are editable only while the quotation is a draft
  if v_status is distinct from 'draft' then
    raise exception 'Quotation lines can only be edited while the quotation is a draft';
  end if;

  -- §12.4: only manager/admin may set or change prices
  if public.is_admin_or_manager() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    new.unit_price := 0;  -- rep adds the line; manager prices it later
    return new;
  end if;
  if tg_op = 'UPDATE' and new.unit_price is distinct from old.unit_price then
    raise exception 'Only a manager or admin can set quotation prices';
  end if;
  return coalesce(new, old);
end;
$$;

-- 2. Quotations: block deleting anything that left draft
create or replace function public.guard_quotation_delete()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.status is distinct from 'draft' then
    raise exception 'Only draft quotations can be deleted — % is a business record', old.q_no;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_guard_quotation_delete on quotations;
create trigger trg_guard_quotation_delete
  before delete on quotations
  for each row execute function public.guard_quotation_delete();

notify pgrst, 'reload schema';
