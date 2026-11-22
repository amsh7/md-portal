-- ============================================================
-- MD Portal — Migration 004: Phase 3 consignment engine
-- Idempotent: safe to run repeatedly.
--
--   1) products.min_warehouse_qty — optional reorder threshold
--      driving the "low warehouse stock" alert
--   2) approve_shelf_count(count_id) — the ONLY write path for
--      usage movements + usage invoices (security definer, per §8).
--      Approval: writes `usage` stock movements for positive usage,
--      creates the usage invoice (due_date = invoice_date + 90 days
--      per the collections design-ahead), marks the count approved.
-- ============================================================

alter table products add column if not exists min_warehouse_qty numeric(12,2);

comment on column products.min_warehouse_qty is
  'Optional. When total warehouse stock falls below this, the product '
  'appears in the admin low-stock alert. Null = no alert.';

create or replace function public.approve_shelf_count(p_count_id uuid)
returns uuid  -- the created invoice id, or null when the count had no usage
language plpgsql security definer set search_path = public
as $$
declare
  v_count shelf_counts%rowtype;
  v_loc uuid;
  v_invoice_id uuid := null;
  v_has_usage boolean;
  r record;
begin
  -- is distinct from true: catches both false AND null (no/unknown role)
  if public.is_admin_or_manager() is distinct from true then
    raise exception 'Only manager or admin can approve shelf counts';
  end if;

  select * into v_count from shelf_counts where id = p_count_id for update;
  if not found then
    raise exception 'Shelf count not found';
  end if;
  if v_count.status <> 'submitted' then
    raise exception 'Only submitted counts can be approved (current status: %)', v_count.status;
  end if;

  select id into v_loc from locations where hospital_id = v_count.hospital_id;
  if v_loc is null then
    raise exception 'Hospital has no shelf location';
  end if;

  -- One usage movement per line with positive usage (expected − counted > 0).
  -- Negative usage (counted more than expected) writes NO movement — it is a
  -- discrepancy for the approver to resolve via a manual adjustment.
  for r in
    select l.* from shelf_count_lines l
    where l.shelf_count_id = p_count_id and l.usage_qty > 0
  loop
    insert into stock_movements
      (type, product_id, lot_no, expiry_date, qty, from_location_id, ref_type, ref_id, created_by)
    values (
      'usage', r.product_id, r.lot_no,
      coalesce(
        (select max(m.expiry_date) from stock_movements m
          where m.product_id = r.product_id and m.lot_no = r.lot_no and m.voided_at is null),
        current_date),
      r.usage_qty, v_loc, 'shelf_count', p_count_id, auth.uid()
    );
  end loop;

  select exists (
    select 1 from shelf_count_lines
    where shelf_count_id = p_count_id and usage_qty > 0
  ) into v_has_usage;

  if v_has_usage then
    insert into usage_invoices
      (invoice_no, hospital_id, shelf_count_id, invoice_date, due_date, total, status)
    select
      public.next_doc_number('invoice'),
      v_count.hospital_id, p_count_id, current_date, current_date + 90,
      coalesce(sum(l.usage_qty * p.price_egp), 0), 'issued'
    from shelf_count_lines l
    join products p on p.id = l.product_id
    where l.shelf_count_id = p_count_id and l.usage_qty > 0
    returning id into v_invoice_id;

    insert into usage_invoice_lines (invoice_id, product_id, lot_no, qty, unit_price, line_total)
    select v_invoice_id, l.product_id, l.lot_no, l.usage_qty, p.price_egp, l.usage_qty * p.price_egp
    from shelf_count_lines l
    join products p on p.id = l.product_id
    where l.shelf_count_id = p_count_id and l.usage_qty > 0;
  end if;

  update shelf_counts
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_count_id;

  return v_invoice_id;
end;
$$;

-- Approval must come through the function, never direct table writes;
-- the function itself verifies the caller's role.
revoke execute on function public.approve_shelf_count(uuid) from anon;

notify pgrst, 'reload schema';
