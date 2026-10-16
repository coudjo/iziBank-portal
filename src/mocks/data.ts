import type { MeResponse, PermissionGrant } from '../app/core/api/api-types';

/** Seeded role groups, mirroring Banking.Domain.Security.RoleGroupCatalog. */
const g = (moduleCode: string, subModuleCode: string | null, flags: string): PermissionGrant => ({
  moduleCode,
  subModuleCode,
  allowView: true,
  allowAdd: flags.includes('A'),
  allowEdit: flags.includes('E'),
  allowDelete: flags.includes('D'),
  allowSupervise: flags.includes('S'),
});

export const ROLE_GROUPS: Record<string, PermissionGrant[]> = {
  TELLER: [
    g('PTY', 'PARTY', 'A'),
    g('ACC', 'ACCOUNT', 'A'),
    g('ACC', 'CONDITION', ''),
    g('LED', 'CHART', ''),
  ],
  FIELD_OFFICER: [
    g('PTY', 'PARTY', 'AE'),
    g('PTY', 'DOCUMENTS', 'AE'),
    g('PTY', 'GROUPS', 'AE'),
    g('PTY', 'CREDIT_OFFICERS', ''),
  ],
  KYC_OFFICER: [g('PTY', null, ''), g('PTY', 'DOCUMENTS', 'E'), g('PTY', 'PARTY', 'S'), g('PTY', 'KYC', 'S')],
  SUPERVISOR: [
    g('PTY', null, 'AES'),
    g('ACC', null, 'AES'),
    g('ACC', 'CONDITION', 'ES'),
    g('REF', 'CALENDAR', 'E'),
    g('LED', 'CHART', 'AS'),
  ],
  ADMINISTRATOR: [
    g('SEC', null, 'AED'),
    g('SEC', 'PERMISSIONS', 'S'),
    g('REF', null, 'AED'),
    g('ACC', 'PRODUCT', 'AEDS'),
    g('LED', 'CHART', 'AEDS'),
  ],
  AUDITOR: [g('SEC', 'AUDIT', ''), g('SEC', 'SESSIONS', ''), g('SEC', 'USERS', '')],
};

export interface MockUser {
  staffUserId: number;
  staffCode: string;
  fullName: string;
  secret: string;
  mustChange: boolean;
  groups: string[];
  locked?: boolean;
  canSwitchBranch?: boolean;
  /** Role groups per branch id; `groups` applies to the home branch. */
  otherBranches?: Record<number, string[]>;
}

/** Development and e2e sign-ins. Never real people. */
export const MOCK_USERS: MockUser[] = [
  {
    staffUserId: 1,
    staffCode: 'ADMIN',
    fullName: 'System Administrator',
    secret: 'Admin-Pass1',
    mustChange: true,
    groups: ['ADMINISTRATOR', 'SUPERVISOR'],
  },
  {
    staffUserId: 2,
    staffCode: 'TELLER1',
    fullName: 'Ama Mensah',
    secret: 'Teller-Pass1',
    mustChange: false,
    groups: ['TELLER'],
  },
  {
    staffUserId: 3,
    staffCode: 'KYC1',
    fullName: 'Kofi Asante',
    secret: 'Kyc-Pass1',
    mustChange: false,
    groups: ['KYC_OFFICER'],
  },
  {
    staffUserId: 6,
    staffCode: 'FIELD1',
    fullName: 'Efua Sarpong',
    secret: 'Field-Pass1',
    mustChange: false,
    groups: ['FIELD_OFFICER'],
  },
  {
    staffUserId: 7,
    staffCode: 'AUDIT1',
    fullName: 'Adwoa Nyarko',
    secret: 'Audit-Pass1',
    mustChange: false,
    groups: ['AUDITOR'],
  },
  {
    staffUserId: 5,
    staffCode: 'ROAMER',
    fullName: 'Yaw Boateng',
    secret: 'Roamer-Pass1',
    mustChange: false,
    groups: ['TELLER'],
    canSwitchBranch: true,
    otherBranches: { 2: ['AUDITOR'] },
  },
  {
    staffUserId: 4,
    staffCode: 'LOCKED',
    fullName: 'Locked User',
    secret: 'Locked-Pass1',
    mustChange: false,
    groups: [],
    locked: true,
  },
];

export const HOME_BRANCH = { branchId: 1, branchCode: '001', branchName: 'Head Office' };
export const BRANCHES = [HOME_BRANCH, { branchId: 2, branchCode: '002', branchName: 'Kumasi' }];

/** Groups the user holds in a branch, or null when they may not work there. */
export function groupsIn(user: MockUser, branchId: number): string[] | null {
  if (branchId === HOME_BRANCH.branchId) {
    return user.groups;
  }
  return user.canSwitchBranch ? (user.otherBranches?.[branchId] ?? null) : null;
}

export function profileOf(user: MockUser, branchId = HOME_BRANCH.branchId): MeResponse {
  const branchIds = [HOME_BRANCH.branchId, ...Object.keys(user.otherBranches ?? {}).map(Number)];
  return {
    staffUserId: user.staffUserId,
    staffCode: user.staffCode,
    fullName: user.fullName,
    homeBranchId: HOME_BRANCH.branchId,
    branchId,
    canSwitchBranch: user.canSwitchBranch ?? false,
    mustChangeSecretKey: user.mustChange,
    branches: user.canSwitchBranch
      ? BRANCHES.filter((branch) => branchIds.includes(branch.branchId))
      : [HOME_BRANCH],
    permissions: (groupsIn(user, branchId) ?? []).flatMap((group) => ROLE_GROUPS[group] ?? []),
  };
}
