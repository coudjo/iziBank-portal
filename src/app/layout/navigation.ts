import type { PermissionRule } from '../core/permissions/permission.service';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  section: 'main' | 'admin';
  permission?: PermissionRule;
  /** Screens not built yet appear only in development builds (frontend plan 7.5). */
  placeholder?: boolean;
  /** Shown in the phone bottom bar. */
  bottomBar?: boolean;
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
    placeholder: true,
    bottomBar: true,
  },
  {
    label: 'Staff',
    path: '/admin/staff',
    icon: 'user',
    section: 'admin',
    permission: { module: 'SEC', subModule: 'USERS', action: 'view' },
    placeholder: true,
  },
  {
    label: 'Role groups',
    path: '/admin/role-groups',
    icon: 'safety-certificate',
    section: 'admin',
    permission: { module: 'SEC', subModule: 'PERMISSIONS', action: 'view' },
    placeholder: true,
  },
  {
    label: 'Sessions',
    path: '/admin/sessions',
    icon: 'solution',
    section: 'admin',
    permission: { module: 'SEC', subModule: 'SESSIONS', action: 'view' },
    placeholder: true,
  },
  {
    label: 'Audit',
    path: '/audit/activity',
    icon: 'audit',
    section: 'admin',
    permission: { module: 'SEC', subModule: 'AUDIT', action: 'view' },
    placeholder: true,
  },
];
