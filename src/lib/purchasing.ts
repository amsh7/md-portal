export type PoStatus = 'draft' | 'approved' | 'sent' | 'partially_received' | 'received' | 'closed';
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export const CURRENCIES = ['EGP', 'USD', 'EUR', 'CHF'] as const;

export interface PurchaseOrder {
  id: string;
  po_no: string;
  supplier: string;
  currency: string;
  status: PoStatus;
  notes: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface PoLine {
  id: string;
  po_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  received_qty: number;
}

export interface Quotation {
  id: string;
  q_no: string;
  hospital_id: string;
  valid_until: string | null;
  status: QuotationStatus;
  terms: string | null;
  created_by: string;
  created_at: string;
}

export interface QuotationLine {
  id: string;
  quotation_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
}

export function linesTotal(lines: { qty: number; unit_price: number }[] | undefined): number {
  return (lines ?? []).reduce((sum, l) => sum + l.qty * l.unit_price, 0);
}

const PO_BADGE: Record<PoStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-indigo-100 text-indigo-700',
  partially_received: 'bg-amber-100 text-amber-700',
  received: 'bg-green-100 text-green-700',
  closed: 'bg-gray-200 text-gray-500',
};

const Q_BADGE: Record<QuotationStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-indigo-100 text-indigo-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-gray-200 text-gray-500',
};

export function poBadgeCls(status: PoStatus): string {
  return PO_BADGE[status] ?? PO_BADGE.draft;
}

export function qBadgeCls(status: QuotationStatus): string {
  return Q_BADGE[status] ?? Q_BADGE.draft;
}
