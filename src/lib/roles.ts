export type Role = 'admin' | 'manager' | 'sales_rep' | 'warehouse' | 'hr' | 'employee';

export const ALL_ROLES: Role[] = ['admin', 'manager', 'sales_rep', 'warehouse', 'hr', 'employee'];

export const DEPARTMENTS = [
  'Sales',
  'Regulatory',
  'Warehouse',
  'Finance',
  'Admin',
  'Collections',
  'Drivers',
  'Office',
] as const;

export interface Profile {
  id: string;
  full_name: string;
  full_name_ar: string | null;
  role: Role;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  active: boolean;
  is_approver: boolean;
  is_finance_approver: boolean;
}

/** GM (admin) or anyone flagged as approver (VP) — mirrors public.can_approve() in the DB. */
export function canApprove(p: Profile | null | undefined): boolean {
  return !!p && (p.role === 'admin' || p.is_approver);
}

/** Finance approver (money check on office requests) — mirrors public.is_finance(). */
export function isFinanceApprover(p: Profile | null | undefined): boolean {
  // The money-check step: the Finance Manager seat holder, plus GM/VP who can do any approval.
  return !!p && (p.role === 'admin' || p.is_approver || p.is_finance_approver);
}

/** Suggestions for the free-text job title fields (not a closed list). */
export const JOB_TITLES = [
  'General Manager',
  'VP',
  'Business Development Manager',
  'Sales Representative',
  'Warehouse Keeper',
  'HR Specialist',
  'Accountant',
  'Regulatory Affairs',
  'Driver',
] as const;

/** Which sidebar modules each role can see. Frontend UX only — RLS enforces the real rules. */
export interface NavItem {
  key: string; // i18n key under nav.*
  path: string;
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', path: '/', roles: ['admin', 'manager', 'sales_rep', 'warehouse', 'hr', 'employee'] },
  { key: 'crm', path: '/crm', roles: ['admin', 'manager', 'sales_rep'] },
  { key: 'inventory', path: '/inventory', roles: ['admin', 'manager', 'sales_rep', 'warehouse'] },
  { key: 'purchasing', path: '/purchasing', roles: ['admin', 'manager', 'sales_rep', 'warehouse'] },
  { key: 'hr', path: '/hr', roles: ['admin', 'manager', 'sales_rep', 'warehouse', 'hr', 'employee'] },
  { key: 'attendance', path: '/attendance', roles: ['admin', 'manager', 'sales_rep', 'warehouse', 'hr', 'employee'] },
  { key: 'users', path: '/users', roles: ['admin'] },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
