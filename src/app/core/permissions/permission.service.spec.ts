import type { PermissionGrant } from '../api/api-types';
import { allows } from './permission.service';
import { ROLE_GROUPS } from '../../../mocks/data';

const grant = (
  moduleCode: string,
  subModuleCode: string | null,
  flags: Partial<PermissionGrant>,
): PermissionGrant => ({
  moduleCode,
  subModuleCode,
  allowView: true,
  allowAdd: false,
  allowEdit: false,
  allowDelete: false,
  allowSupervise: false,
  ...flags,
});

describe('allows', () => {
  it('lets a module row cover its sub-modules and unions rows', () => {
    const grants = [grant('SEC', null, { allowEdit: true }), grant('PTY', 'KYC', { allowSupervise: true })];

    expect(allows(grants, { module: 'SEC', subModule: 'USERS', action: 'edit' })).toBe(true);
    expect(allows(grants, { module: 'PTY', subModule: 'KYC', action: 'supervise' })).toBe(true);
    expect(allows(grants, { module: 'PTY', subModule: 'PARTY', action: 'view' })).toBe(false);
    expect(allows(grants, { module: 'PTY', action: 'view' })).toBe(false);
  });

  it('denies anything unknown', () => {
    expect(allows([], { module: 'SEC', subModule: 'USERS', action: 'view' })).toBe(false);
  });

  it('gives the seeded groups the expected screens', () => {
    const customers = { module: 'PTY', subModule: 'PARTY', action: 'view' } as const;
    const staff = { module: 'SEC', subModule: 'USERS', action: 'view' } as const;
    const verify = { module: 'PTY', subModule: 'KYC', action: 'supervise' } as const;

    expect(allows(ROLE_GROUPS['TELLER'], customers)).toBe(true);
    expect(allows(ROLE_GROUPS['TELLER'], staff)).toBe(false);
    expect(allows(ROLE_GROUPS['KYC_OFFICER'], verify)).toBe(true);
    expect(allows(ROLE_GROUPS['TELLER'], verify)).toBe(false);
    expect(allows(ROLE_GROUPS['ADMINISTRATOR'], staff)).toBe(true);
    expect(allows(ROLE_GROUPS['ADMINISTRATOR'], customers)).toBe(false);
  });
});
