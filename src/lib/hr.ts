export type LeaveType = 'annual' | 'sick' | 'casual' | 'unpaid' | 'mission';
export const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'casual', 'unpaid', 'mission'];
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  employee_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  half_day: boolean;
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
  department: string | null;
  created_by: string | null;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
}

export function leaveDays(r: { start_date: string; end_date: string; half_day: boolean }): number {
  if (r.half_day) return 0.5;
  const ms = new Date(r.end_date).getTime() - new Date(r.start_date).getTime();
  return Math.round(ms / 86400000) + 1;
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
