import { Routes } from '@angular/router';
import { requireAnyPermission, requirePermission } from '../../core/auth/auth.guards';
import type { PermissionRule } from '../../core/permissions/permission.service';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';
import { REFERENCE_RULES, REFERENCE_SCREENS } from './reference-rules';

const rule = (path: string): PermissionRule =>
  REFERENCE_SCREENS.find((screen) => screen.path === path)!.permission;

/** Administration > Reference (UX 6.11, 7.7). */
export const REFERENCE_ROUTES: Routes = [
  {
    path: '',
    title: 'Reference data',
    canMatch: [requireAnyPermission(REFERENCE_RULES)],
    loadComponent: () => import('./reference-hub.page').then((m) => m.ReferenceHubPage),
  },
  {
    path: 'institution',
    title: 'Institution',
    canMatch: [requirePermission(rule('institution'))],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./institution.page').then((m) => m.InstitutionPage),
  },
  {
    path: 'branches',
    title: 'Branches',
    canMatch: [requirePermission(rule('branches'))],
    loadComponent: () => import('./branches.page').then((m) => m.BranchesPage),
  },
  {
    path: 'currencies',
    title: 'Currencies',
    canMatch: [requirePermission(rule('currencies'))],
    loadComponent: () => import('./currencies.page').then((m) => m.CurrenciesPage),
  },
  {
    path: 'holidays',
    title: 'Holidays',
    canMatch: [requirePermission(rule('holidays'))],
    loadComponent: () => import('./holidays.page').then((m) => m.HolidaysPage),
  },
  {
    path: 'lookups',
    title: 'Lookups',
    canMatch: [requirePermission(rule('lookups'))],
    loadComponent: () => import('./lookups.page').then((m) => m.LookupsPage),
  },
  {
    path: 'lookups/:slug',
    title: 'Lookups',
    canMatch: [requirePermission(rule('lookups'))],
    loadComponent: () => import('./lookups.page').then((m) => m.LookupsPage),
  },
  {
    path: 'credit-officers',
    title: 'Credit officers',
    canMatch: [requirePermission(rule('credit-officers'))],
    loadComponent: () => import('./credit-officers.page').then((m) => m.CreditOfficersPage),
  },
];
