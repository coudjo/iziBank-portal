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
    path: 'new/business',
    title: 'New customer',
    canMatch: [requirePermission({ module: 'PTY', subModule: 'PARTY', action: 'add' })],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./business-onboarding.page').then((m) => m.BusinessOnboardingPage),
  },
  {
    path: 'new/group',
    title: 'New customer',
    canMatch: [requirePermission({ module: 'PTY', subModule: 'GROUPS', action: 'add' })],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./group-onboarding.page').then((m) => m.GroupOnboardingPage),
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
      {
        path: 'owners',
        title: 'Customer',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./owners.tab').then((m) => m.CustomerOwnersTab),
      },
      {
        path: 'members',
        title: 'Customer',
        loadComponent: () => import('./members.tab').then((m) => m.CustomerMembersTab),
      },
      {
        path: 'kyc',
        title: 'Customer',
        loadComponent: () => import('./kyc.tab').then((m) => m.CustomerKycTab),
      },
      {
        path: 'documents',
        title: 'Customer',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./documents.tab').then((m) => m.CustomerDocumentsTab),
      },
      {
        path: 'next-of-kin',
        title: 'Customer',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./next-of-kin.tab').then((m) => m.CustomerNextOfKinTab),
      },
      {
        path: 'accounts',
        title: 'Customer',
        canMatch: [requirePermission({ module: 'ACC', subModule: 'ACCOUNT', action: 'view' })],
        loadComponent: () => import('./accounts.tab').then((m) => m.CustomerAccountsTab),
      },
      {
        path: 'regulatory',
        title: 'Customer',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./regulatory.tab').then((m) => m.CustomerRegulatoryTab),
      },
      {
        path: 'activity',
        title: 'Customer',
        canMatch: [requirePermission({ module: 'SEC', subModule: 'AUDIT', action: 'view' })],
        loadComponent: () => import('./activity.tab').then((m) => m.CustomerActivityTab),
      },
      ...comingTabs,
    ],
  },
];
