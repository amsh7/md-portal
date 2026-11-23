-- ============================================================
-- MD Portal — Migration 005: Phase 4 (Purchasing)
-- Idempotent: safe to run repeatedly in Supabase SQL Editor.
--
-- 1. Quotation prices are manager/admin-set ONLY (§12.4 — Wael rule):
--    sales reps can add lines (qty) but never set or change unit_price.
-- 2. Quotation lines are frozen once the quotation leaves draft.
-- 3. PO lines are frozen once the PO leaves draft (receiving still
--    updates received_qty through the function below).
-- 4. receive_po(): the ONLY write path for receiving a PO into stock —
--    validates the PO, writes `receive` stock movements (lot + expiry
--    per line), updates received_qty and flips the PO status to
--    partially_received / received. Warehouse + admin only.
-- ============================================================

-- ---------- 1+2. Quotation line guards ----------
create or replace function public.guard_quotation_lines()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_status quotation_status;
begin
  select status into v_status from quotations
    where id = coalesce(new.quotation_id, old.quotation_id);

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

drop trigger if exists trg_guard_quotation_lines on quotation_lines;
create trigger trg_guard_quotation_lines
  before insert or update or delete on quotation_lines
  for each row execute function public.guard_quotation_lines();

-- ---------- 3. PO line guard ----------
create or replace function public.guard_po_lines()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_status po_status;
begin
  select status into v_status from purchase_orders
    where id = coalesce(new.po_id, old.po_id);
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

drop trigger if exists trg_guard_po_lines on purchase_order_lines;
create trigger trg_guard_po_lines
  before insert or update or delete on purchase_order_lines
  for each row execute function public.guard_po_lines();

-- ---------- 4. Receiving function ----------
create or replace function public.receive_po(
  p_po_id uuid,
  p_location_id uuid,
  p_lines jsonb   -- [{ "line_id": uuid, "qty": n, "lot_no": text, "expiry_date": "YYYY-MM-DD" }, ...]
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status po_status;
  v_line purchase_order_lines%rowtype;
  r jsonb;
  v_line_id uuid;
  v_qty numeric;
  v_lot text;
  v_exp date;
  v_received int := 0;
  v_open int;
begin
  if public.my_role() not in ('admin','warehouse') then
    raise exception 'Only warehouse or admin can receive purchase orders';
  end if;

  select status into v_status from purchase_orders where id = p_po_id for update;
  if v_status is null then
    raise exception 'Purchase order not found';
  end if;
  if v_status not in ('approved','sent','partially_received') then
    raise exception 'PO must be approved before receiving (current status: %)', v_status;
  end if;

  if not exists (select 1 from locations where id = p_location_id and type = 'warehouse') then
    raise exception 'Receiving location must be a company warehouse';
  end if;

  for r in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_id := (r->>'line_id')::uuid;
    v_qty     := (r->>'qty')::numeric;
    v_lot     := nullif(trim(coalesce(r->>'lot_no','')), '');
    v_exp     := (r->>'expiry_date')::date;

    if v_qty is null or v_qty <= 0 then
      continue;  -- nothing received on this line this time
    end if;
    if v_lot is null or v_exp is null then
      raise exception 'Lot number and expiry date are required for every received line';
    end if;

    select * into v_line from purchase_order_lines
      where id = v_line_id and po_id = p_po_id for update;
    if not found then
      raise exception 'Line does not belong to this purchase order';
    end if;
    if v_line.received_qty + v_qty > v_line.qty then
      raise exception 'Received quantity would exceed the ordered quantity';
    end if;

    insert into stock_movements
      (type, product_id, lot_no, expiry_date, qty, to_location_id, ref_type, ref_id, created_by)
    values
      ('receive', v_line.product_id, v_lot, v_exp, v_qty, p_location_id, 'po', p_po_id, auth.uid());

    update purchase_order_lines
      set received_qty = received_qty + v_qty
      where id = v_line_id;

    v_received := v_received + 1;
  end loop;

  if v_received = 0 then
    raise exception 'Nothing to receive — enter a quantity on at least one line';
  end if;

  select count(*) into v_open
    from purchase_order_lines where po_id = p_po_id and received_qty < qty;

  update purchase_orders
    set status = case when v_open = 0 then 'received'::po_status
                      else 'partially_received'::po_status end
    where id = p_po_id;
end;
$$;

revoke execute on function public.receive_po(uuid, uuid, jsonb) from anon;

notify pgrst, 'reload schema';
