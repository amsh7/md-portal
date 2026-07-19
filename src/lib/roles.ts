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
  department: string | null;
  phone: string | null;
  active: boolean;
}

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
  { key: 'purchasing', path: '/purchasing', roles: ['admin', 'manager', 'sales_rep'] },
  { key: 'hr', path: '/hr', roles: ['admin', 'manager', 'sales_rep', 'warehouse', 'hr', 'employee'] },
  { key: 'attendance', path: '/attendance', roles: ['admin', 'manager', 'sales_rep', 'warehouse', 'hr', 'employee'] },
  { key: 'users', path: '/users', roles: ['admin'] },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
