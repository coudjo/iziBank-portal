import { Routes } from '@angular/router';
import { requirePermission } from '../../core/auth/auth.guards';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

const view = requirePermission({ module: 'ACC', subModule: 'ACCOUNT', action: 'view' });

/** Accounts (UX 4.2, 7.4). Titles never carry names or numbers. */
export const ACCOUNT_ROUTES: Routes = [
  {
    path: '',
    title: 'Accounts',
    canMatch: [view],
    loadComponent: () => import('./accounts-list.page').then((m) => m.AccountsListPage),
  },
  {
    path: 'new',
    title: 'Open account',
    canMatch: [requirePermission({ module: 'ACC', subModule: 'ACCOUNT', action: 'add' })],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./open-account.page').then((m) => m.OpenAccountPage),
  },
  {
    path: ':id',
    title: 'Account',
    canMatch: [view],
    loadComponent: () => import('./account-record.page').then((m) => m.AccountRecordPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'summary' },
      {
        path: 'summary',
        title: 'Account',
        loadComponent: () => import('./summary.tab').then((m) => m.AccountSummaryTab),
      },
      {
        path: 'holders',
        title: 'Account',
        loadComponent: () => import('./holders.tab').then((m) => m.AccountHoldersTab),
      },
      {
        path: 'holds',
        title: 'Account',
        canMatch: [requirePermission({ module: 'ACC', subModule: 'CONDITION', action: 'view' })],
        loadComponent: () => import('./holds.tab').then((m) => m.AccountHoldsTab),
      },
      {
        path: 'conditions',
        title: 'Account',
        loadComponent: () => import('./conditions.tab').then((m) => m.AccountConditionsTab),
      },
      {
        path: 'classification',
        title: 'Account',
        canMatch: [requirePermission({ module: 'ACC', subModule: 'CLASSIFICATION', action: 'view' })],
        loadComponent: () => import('./classification.tab').then((m) => m.AccountClassificationTab),
      },
      {
        path: 'activity',
        title: 'Account',
        canMatch: [requirePermission({ module: 'SEC', subModule: 'AUDIT', action: 'view' })],
        loadComponent: () => import('./activity.tab').then((m) => m.AccountActivityTab),
      },
    ],
  },
];
