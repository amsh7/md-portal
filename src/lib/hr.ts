export type LeaveType = 'annual' | 'sick' | 'casual' | 'unpaid' | 'mission' | 'personal' | 'permission';
/** Options offered in the request form ('casual' is retired; old rows still render). */
export const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'personal', 'permission', 'unpaid', 'mission'];
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  employee_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  half_day: boolean;
  start_time: string | null; // permission only
  end_time: string | null;   // permission only
  reason: string | null;
  attachment_path: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  review_comment: string | null;
  created_at: string;
}

export interface LeaveBalance {
  employee_id: string;
  year: number;
  annual_total: number;
  annual_used: number;
  sick_total: number;
  sick_used: number;
}

export interface AttendanceLog {
  id: string;
  employee_id: string;
  type: 'check_in' | 'check_out';
  ts: string;
  lat: number | null;
  lng: number | null;
}

export type VisitPurpose = 'shelf_count' | 'sales_call' | 'collection_follow_up' | 'delivery' | 'other';
export const VISIT_PURPOSES: VisitPurpose[] = ['shelf_count', 'sales_call', 'collection_follow_up', 'delivery', 'other'];

export interface Visit {
  id: string;
  rep_id: string;
  hospital_id: string;
  ts: string;
  lat: number | null;
  lng: number | null;
  purpose: VisitPurpose;
  notes: string | null;
  shelf_count_id: string | null;
}

export interface InviteCode {
  code: string;
  role: string;
  job_title: string | null;
  department: string | null;
  created_by: string | null;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
}

export function leaveDays(r: { start_date: string; end_date: string; half_day: boolean; type?: LeaveType }): number {
  if (r.type === 'permission') return 0; // hours within one day, no day count
  if (r.half_day) return 0.5;
  const ms = new Date(r.end_date).getTime() - new Date(r.start_date).getTime();
  return Math.round(ms / 86400000) + 1;
}

// ---------- Weekly comings-and-goings report (sales reps) ----------
export interface WeeklyReportDay {
  date: string;        // yyyy-mm-dd
  time_in: string;     // '' when absent
  time_out: string;
  notes: string;
}

export interface WeeklyReport {
  id: string;
  rep_id: string;
  week_start: string;  // Saturday
  days: WeeklyReportDay[];
  status: 'draft' | 'submitted';
  submitted_at: string | null;
  created_at: string;
}

/** Saturday that starts the week containing d (Egyptian work week Sat–Fri). */
export function weekStartOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const off = (x.getDay() + 1) % 7; // Sat=6 → 0, Sun=0 → 1, … Fri=5 → 6
  x.setDate(x.getDate() - off);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ---------- Office-supply requests ----------
export type OfficeRequestStatus = 'pending_finance' | 'pending_approval' | 'approved' | 'rejected';

export interface OfficeRequest {
  id: string;
  requester_id: string;
  item: string;
  qty: number;
  notes: string | null;
  status: OfficeRequestStatus;
  finance_by: string | null;
  finance_at: string | null;
  finance_comment: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decided_comment: string | null;
  created_at: string;
}

const OREQ_BADGE: Record<OfficeRequestStatus, string> = {
  pending_finance: 'bg-amber-100 text-amber-700',
  pending_approval: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export function officeBadgeCls(status: OfficeRequestStatus): string {
  return OREQ_BADGE[status] ?? OREQ_BADGE.pending_finance;
}

const LEAVE_BADGE: Record<LeaveStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export function leaveBadgeCls(status: LeaveStatus): string {
  return LEAVE_BADGE[status] ?? LEAVE_BADGE.pending;
}

/** Random, unambiguous 8-char invite code (no 0/O/1/I). */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}
