import { isDevMode } from '@angular/core';
import type { TabLink } from '../../shared/ui';

interface TabDefinition extends TabLink {
  types: readonly string[];
  /** Tabs not built yet appear only in development builds (frontend plan 7.5). */
  built: boolean;
}

const ALL = ['INDIVIDUAL', 'BUSINESS', 'GROUP'];

/** Record tabs by customer type (UX 7.3). */
export const CUSTOMER_TABS: readonly TabDefinition[] = [
  { label: 'Overview', path: 'overview', types: ALL, built: true },
  { label: 'Details', path: 'details', types: ALL, built: true },
  { label: 'KYC', path: 'kyc', types: ALL, built: false },
  { label: 'Documents', path: 'documents', types: ['INDIVIDUAL', 'BUSINESS'], built: false },
  { label: 'Next of kin', path: 'next-of-kin', types: ['INDIVIDUAL', 'BUSINESS'], built: false },
  { label: 'Beneficial owners', path: 'owners', types: ['BUSINESS'], built: false },
  { label: 'Members', path: 'members', types: ['GROUP'], built: false },
  { label: 'Accounts', path: 'accounts', types: ALL, built: false },
  { label: 'Regulatory', path: 'regulatory', types: ALL, built: false },
  { label: 'Activity', path: 'activity', types: ALL, built: false },
];

export function tabsFor(partyType: string, dev = isDevMode()): TabLink[] {
  return CUSTOMER_TABS.filter((tab) => tab.types.includes(partyType) && (tab.built || dev)).map(
    ({ label, path }) => ({ label, path }),
  );
}

/** True when the tab exists in this build for this customer type. */
export function hasTab(partyType: string, path: string, dev = isDevMode()): boolean {
  return tabsFor(partyType, dev).some((tab) => tab.path === path);
}
