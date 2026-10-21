import { Routes } from '@angular/router';
import { requirePermission } from '../../core/auth/auth.guards';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

const users = (action: 'view' | 'add') => requirePermission({ module: 'SEC', subModule: 'USERS', action });
const groups = (action: 'view' | 'add') =>
  requirePermission({ module: 'SEC', subModule: 'PERMISSIONS', action });
const sessions = requirePermission({ module: 'SEC', subModule: 'SESSIONS', action: 'view' });

/** Administration > Security (UX 6.10, 7.7): staff, role groups, sessions. */
export const ADMIN_ROUTES: Routes = [
  {
    path: 'staff',
    title: 'Staff',
    canMatch: [users('view')],
    loadComponent: () => import('./staff-list.page').then((m) => m.StaffListPage),
  },
  {
    path: 'staff/new',
    title: 'New staff member',
    canMatch: [users('add')],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./new-staff.page').then((m) => m.NewStaffPage),
  },
  {
    path: 'staff/:id',
    title: 'Staff member',
    canMatch: [users('view')],
    loadComponent: () => import('./staff-record.page').then((m) => m.StaffRecordPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'details' },
      {
        path: 'details',
        title: 'Staff member',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./staff-details.tab').then((m) => m.StaffDetailsTab),
      },
      {
        path: 'role-groups',
        title: 'Staff member',
        canMatch: [groups('view')],
        loadComponent: () => import('./staff-roles.tab').then((m) => m.StaffRolesTab),
      },
      {
        path: 'sessions',
        title: 'Staff member',
        canMatch: [sessions],
        loadComponent: () => import('./staff-sessions.tab').then((m) => m.StaffSessionsTab),
      },
    ],
  },
  {
    path: 'role-groups',
    title: 'Role groups',
    canMatch: [groups('view')],
    loadComponent: () => import('./role-groups-list.page').then((m) => m.RoleGroupsListPage),
  },
  {
    path: 'role-groups/new',
    title: 'New role group',
    canMatch: [groups('add')],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./role-group.page').then((m) => m.RoleGroupPage),
  },
  {
    path: 'role-groups/:id',
    title: 'Role group',
    canMatch: [groups('view')],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./role-group.page').then((m) => m.RoleGroupPage),
  },
  {
    path: 'sessions',
    title: 'Sessions',
    canMatch: [sessions],
    loadComponent: () => import('./sessions.page').then((m) => m.SessionsPage),
  },
];
