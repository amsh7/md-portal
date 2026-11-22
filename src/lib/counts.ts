import { supabase } from './supabase';
import { StockRow } from './types';

export type CountStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface ShelfCount {
  id: string;
  hospital_id: string;
  rep_id: string;
  status: CountStatus;
  counted_at: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface ShelfCountLine {
  id: string;
  shelf_count_id: string;
  product_id: string;
  lot_no: string;
  expected_qty: number;
  counted_qty: number;
  usage_qty: number;
}

/**
 * Creates a draft count for the hospital and snapshots the current shelf
 * stock as its lines (expected = counted initially, usage 0 — the rep then
 * adjusts counted quantities). Returns the new count id.
 */
export async function createShelfCount(hospitalId: string): Promise<string> {
  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .select('id')
    .eq('hospital_id', hospitalId)
    .single();
  if (locErr) throw locErr;

  const { data: stock, error: stockErr } = await supabase
    .from('stock_on_hand')
    .select('*')
    .eq('location_id', loc.id);
  if (stockErr) throw stockErr;

  const { data: count, error: countErr } = await supabase
    .from('shelf_counts')
    .insert({ hospital_id: hospitalId })
    .select('id')
    .single();
  if (countErr) throw countErr;

  const rows = (stock as StockRow[]).map((s) => ({
    shelf_count_id: count.id,
    product_id: s.product_id,
    lot_no: s.lot_no,
    expected_qty: s.qty,
    counted_qty: s.qty,
    usage_qty: 0,
  }));
  if (rows.length) {
    const { error: linesErr } = await supabase.from('shelf_count_lines').insert(rows);
    if (linesErr) throw linesErr;
  }
  return count.id;
}

/** Discrepancy helpers (spec §6.2): negative usage, or > 50% of expected. */
export function lineFlag(l: { expected_qty: number; usage_qty: number }): 'negative' | 'large' | null {
  if (l.usage_qty < 0) return 'negative';
  if (l.expected_qty > 0 && l.usage_qty > l.expected_qty * 0.5) return 'large';
  return null;
}
