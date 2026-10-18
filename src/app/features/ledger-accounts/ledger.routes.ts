import { Routes } from '@angular/router';
import { requirePermission } from '../../core/auth/auth.guards';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

const view = requirePermission({ module: 'LED', subModule: 'CHART', action: 'view' });

/** Chart of accounts (UX 4.2, 7.6). */
export const LEDGER_ROUTES: Routes = [
  {
    path: '',
    title: 'Chart of accounts',
    canMatch: [view],
    loadComponent: () => import('./ledger-list.page').then((m) => m.LedgerListPage),
  },
  {
    path: 'new',
    title: 'New ledger account',
    canMatch: [requirePermission({ module: 'LED', subModule: 'CHART', action: 'add' })],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./new-ledger.page').then((m) => m.NewLedgerPage),
  },
  {
    path: ':id',
    title: 'Ledger account',
    canMatch: [view],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./ledger-record.page').then((m) => m.LedgerRecordPage),
  },
];
