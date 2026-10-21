import { Routes } from '@angular/router';
import { requirePermission } from '../../core/auth/auth.guards';

/** Audit (UX 6.12, 7.8): SEC/AUDIT view. */
export const AUDIT_ROUTES: Routes = [
  {
    path: '',
    canMatch: [requirePermission({ module: 'SEC', subModule: 'AUDIT', action: 'view' })],
    loadComponent: () => import('./audit.page').then((m) => m.AuditPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'activity' },
      {
        path: 'activity',
        title: 'Activity log',
        loadComponent: () => import('./activity-log.page').then((m) => m.ActivityLogPage),
      },
      {
        path: 'changes',
        title: 'Data-change log',
        loadComponent: () => import('./change-log.page').then((m) => m.ChangeLogPage),
      },
    ],
  },
];
