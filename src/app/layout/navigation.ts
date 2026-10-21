import type { PermissionRule } from '../core/permissions/permission.service';
import { REFERENCE_RULES } from '../features/reference/reference-rules';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  section: 'main' | 'admin';
  permission?: PermissionRule;
  /** Shown when any of these allows (a hub that serves several roles). */
  anyOf?: readonly PermissionRule[];
  /** Screens not built yet appear only in development builds (frontend plan 7.5). */
  placeholder?: boolean;
  /** Shown in the phone bottom bar. */
  bottomBar?: boolean;
  /** Shown only to people who can approve something (approvals inbox and badge). */
  approvals?: boolean;
}

/** The single source for the sidebar, the bottom bar and the route permissions (frontend plan 3.1). */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', section: 'main' },
  {
    label: 'Customers',
    path: '/customers',
    icon: 'team',
    section: 'main',
    permission: { module: 'PTY', subModule: 'PARTY', action: 'view' },
    bottomBar: true,
  },
  {
    label: 'Accounts',
    path: '/accounts',
    icon: 'bank',
    section: 'main',
    permission: { module: 'ACC', subModule: 'ACCOUNT', action: 'view' },
    bottomBar: true,
  },
  {
    label: 'Approvals',
    path: '/approvals',
    icon: 'check-square',
    section: 'main',
    approvals: true,
    bottomBar: true,
  },
  {
    label: 'Products',
    path: '/products',
    icon: 'appstore',
    section: 'main',
    permission: { module: 'ACC', subModule: 'PRODUCT', action: 'view' },
  },
  {
    label: 'Chart of accounts',
    path: '/ledger-accounts',
    icon: 'audit',
    section: 'main',
    permission: { module: 'LED', subModule: 'CHART', action: 'view' },
  },
  {
    label: 'Staff',
    path: '/admin/staff',
    icon: 'user',
    section: 'admin',
    permission: { module: 'SEC', subModule: 'USERS', action: 'view' },
  },
  {
    label: 'Role groups',
    path: '/admin/role-groups',
    icon: 'safety-certificate',
    section: 'admin',
    permission: { module: 'SEC', subModule: 'PERMISSIONS', action: 'view' },
  },
  {
    label: 'Sessions',
    path: '/admin/sessions',
    icon: 'solution',
    section: 'admin',
    permission: { module: 'SEC', subModule: 'SESSIONS', action: 'view' },
  },
  {
    label: 'Business day',
    path: '/business-day',
    icon: 'clock-circle',
    section: 'admin',
    permission: { module: 'REF', subModule: 'CALENDAR', action: 'view' },
  },
  {
    label: 'Reference data',
    path: '/reference',
    icon: 'setting',
    section: 'admin',
    anyOf: REFERENCE_RULES,
  },
  {
    label: 'Audit',
    path: '/audit',
    icon: 'audit',
    section: 'admin',
    permission: { module: 'SEC', subModule: 'AUDIT', action: 'view' },
  },
];
