export interface Hospital {
  id: string;
  name: string;
  name_ar: string | null;
  governorate: string | null;
  sector: 'government' | 'private' | 'university' | 'military' | null;
  status: 'active' | 'prospect' | 'dormant';
  assigned_rep_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  hospital_id: string;
  name: string;
  role_title: string | null;
  phone: string | null;
  notes: string | null;
}

export type DealStage = 'lead' | 'qualified' | 'tender_quotation' | 'won' | 'lost';
export const DEAL_STAGES: DealStage[] = ['lead', 'qualified', 'tender_quotation', 'won', 'lost'];

export interface Deal {
  id: string;
  hospital_id: string;
  title: string;
  stage: DealStage;
  expected_value: number | null;
  currency: string;
  expected_close: string | null;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  hospital_id: string;
  deal_id: string | null;
  visit_id: string | null;
  type: 'call' | 'meeting' | 'note' | 'visit';
  body: string;
  created_by: string;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  name_ar: string | null;
  manufacturer: string | null;
  category: string | null;
  unit: string;
  price_egp: number;
  price_foreign: number | null;
  currency: string | null;
  active: boolean;
}

export interface Location {
  id: string;
  type: 'warehouse' | 'hospital';
  hospital_id: string | null;
  name: string;
}

export type MovementType = 'receive' | 'transfer' | 'usage' | 'return' | 'adjustment';

export interface StockMovement {
  id: string;
  type: MovementType;
  product_id: string;
  lot_no: string;
  expiry_date: string;
  qty: number;
  from_location_id: string | null;
  to_location_id: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
  voided_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export interface StockRow {
  location_id: string;
  product_id: string;
  lot_no: string;
  expiry_date: string;
  qty: number;
}

export const GOVERNORATES = [
  'Cairo', 'Giza', 'Alexandria', 'Qalyubia', 'Sharqia', 'Dakahlia', 'Beheira',
  'Gharbia', 'Monufia', 'Kafr El Sheikh', 'Damietta', 'Port Said', 'Ismailia',
  'Suez', 'North Sinai', 'South Sinai', 'Faiyum', 'Beni Suef', 'Minya',
  'Asyut', 'Sohag', 'Qena', 'Luxor', 'Aswan', 'Red Sea', 'New Valley', 'Matrouh',
];
