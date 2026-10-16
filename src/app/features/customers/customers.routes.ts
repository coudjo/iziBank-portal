import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';
import { requirePermission } from '../../core/auth/auth.guards';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';
import { CUSTOMER_TABS } from './customer-tabs';

const view = requirePermission({ module: 'PTY', subModule: 'PARTY', action: 'view' });

const comingTabs: Routes = isDevMode()
  ? CUSTOMER_TABS.filter((tab) => !tab.built).map((tab) => ({
      path: tab.path,
      title: 'Customer',
      loadComponent: () => import('./coming.tab').then((m) => m.CustomerComingTab),
    }))
  : [];

/** Customers (UX 4.2). Titles never carry names or numbers. */
export const CUSTOMER_ROUTES: Routes = [
  {
    path: '',
    title: 'Customers',
    canMatch: [view],
    loadComponent: () => import('./customers-list.page').then((m) => m.CustomersListPage),
  },
  {
    path: 'new/individual',
    title: 'New customer',
    canMatch: [requirePermission({ module: 'PTY', subModule: 'PARTY', action: 'add' })],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./individual-onboarding.page').then((m) => m.IndividualOnboardingPage),
  },
  {
    path: ':id',
    title: 'Customer',
    canMatch: [view],
    loadComponent: () => import('./customer-record.page').then((m) => m.CustomerRecordPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        title: 'Customer',
        loadComponent: () => import('./overview.tab').then((m) => m.CustomerOverviewTab),
      },
      {
        path: 'details',
        title: 'Customer',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./details.tab').then((m) => m.CustomerDetailsTab),
      },
      ...comingTabs,
    ],
  },
];
