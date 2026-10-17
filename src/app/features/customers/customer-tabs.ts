import { isDevMode } from '@angular/core';
import type { PermissionRule } from '../../core/permissions/permission.service';
import type { TabLink } from '../../shared/ui';

interface TabDefinition extends TabLink {
  types: readonly string[];
  /** Tabs not built yet appear only in development builds (frontend plan 7.5). */
  built: boolean;
  /** Tabs that need more than customer view (UX 7.3: Activity needs audit permission). */
  permission?: PermissionRule;
}

const ALL = ['INDIVIDUAL', 'BUSINESS', 'GROUP'];

/** Record tabs by customer type (UX 7.3). */
export const CUSTOMER_TABS: readonly TabDefinition[] = [
  { label: 'Overview', path: 'overview', types: ALL, built: true },
  { label: 'Details', path: 'details', types: ALL, built: true },
  { label: 'KYC', path: 'kyc', types: ALL, built: true },
  { label: 'Documents', path: 'documents', types: ['INDIVIDUAL', 'BUSINESS'], built: true },
  { label: 'Next of kin', path: 'next-of-kin', types: ['INDIVIDUAL', 'BUSINESS'], built: true },
  { label: 'Beneficial owners', path: 'owners', types: ['BUSINESS'], built: true },
  { label: 'Members', path: 'members', types: ['GROUP'], built: true },
  { label: 'Accounts', path: 'accounts', types: ALL, built: false },
  { label: 'Regulatory', path: 'regulatory', types: ALL, built: true },
  {
    label: 'Activity',
    path: 'activity',
    types: ALL,
    built: true,
    permission: { module: 'SEC', subModule: 'AUDIT', action: 'view' },
  },
];

export function tabsFor(
  partyType: string,
  can: (rule: PermissionRule) => boolean = () => false,
  dev = isDevMode(),
): TabLink[] {
  return CUSTOMER_TABS.filter(
    (tab) => tab.types.includes(partyType) && (tab.built || dev) && (!tab.permission || can(tab.permission)),
  ).map(({ label, path }) => ({ label, path }));
}

/** True when the tab exists in this build for this customer type (tabs behind extra permissions excluded). */
export function hasTab(partyType: string, path: string, dev = isDevMode()): boolean {
  return tabsFor(partyType, () => false, dev).some((tab) => tab.path === path);
}
