import { http, HttpResponse } from 'msw';
import type {
  ChangeRequestView,
  CreateStaffRequest,
  ModuleView,
  PermissionGrant,
  RoleGroupRequest,
  RoleGroupSummary,
  SessionRow,
  StaffDetail,
  StaffSummary,
  UpdateStaffRequest,
} from '../app/core/api/api-types';
import { addChange, changeAppliers, ledgerById, pendingChange } from './approvals';
import { BRANCHES, HOME_BRANCH, MOCK_USERS, MockUser, ROLE_GROUPS } from './data';
import { problem, validation } from './parties';

/**
 * Mock security administration (API A2-04 to A2-10): staff, role groups, modules and sessions. Never real people.
 * Role group changes and assignments become change requests in the approvals mock; approving one applies it here,
 * and to the permissions the mock sign-in hands out.
 */
const KEY = 'ib-mock-security';

export const MODULES: ModuleView[] = [
  {
    moduleCode: 'SEC',
    moduleName: 'Security',
    subModules: [
      { subModuleCode: 'USERS', subModuleName: 'Users' },
      { subModuleCode: 'PERMISSIONS', subModuleName: 'Permissions' },
      { subModuleCode: 'SESSIONS', subModuleName: 'Sessions' },
      { subModuleCode: 'AUDIT', subModuleName: 'Audit' },
    ],
  },
  {
    moduleCode: 'REF',
    moduleName: 'Reference data',
    subModules: [
      { subModuleCode: 'INSTITUTION', subModuleName: 'Institution' },
      { subModuleCode: 'BRANCHES', subModuleName: 'Branches' },
      { subModuleCode: 'CURRENCIES', subModuleName: 'Currencies' },
      { subModuleCode: 'CALENDAR', subModuleName: 'Calendar' },
      { subModuleCode: 'LOOKUPS', subModuleName: 'Lookups' },
    ],
  },
  {
    moduleCode: 'PTY',
    moduleName: 'Party and KYC',
    subModules: [
      { subModuleCode: 'PARTY', subModuleName: 'Party' },
      { subModuleCode: 'KYC', subModuleName: 'KYC' },
      { subModuleCode: 'DOCUMENTS', subModuleName: 'Documents' },
      { subModuleCode: 'GROUPS', subModuleName: 'Groups' },
      { subModuleCode: 'CREDIT_OFFICERS', subModuleName: 'Credit officers' },
    ],
  },
  {
    moduleCode: 'ACC',
    moduleName: 'Accounts',
    subModules: [
      { subModuleCode: 'PRODUCT', subModuleName: 'Product' },
      { subModuleCode: 'ACCOUNT', subModuleName: 'Account' },
      { subModuleCode: 'CONDITION', subModuleName: 'Condition' },
      { subModuleCode: 'CLASSIFICATION', subModuleName: 'Classification' },
    ],
  },
  {
    moduleCode: 'LED',
    moduleName: 'Ledger',
    subModules: [{ subModuleCode: 'CHART', subModuleName: 'Chart' }],
  },
];

interface MockGroup {
  roleGroupId: number;
  roleGroupCode: string;
  roleGroupName: string;
  description: string | null;
  isSystemGroup: boolean;
  isActive: boolean;
  permissions: PermissionGrant[];
}

interface StaffExtra {
  branchId: number;
  isDisabled: boolean;
  isTeller: boolean;
  tellerGLAccountId: number | null;
  secretKeyExpiryDays: number | null;
}

interface SecurityState {
  groups: MockGroup[];
  /** Role group codes per staff member and branch id. */
  assignments: Record<number, Record<number, string[]>>;
  extras: Record<number, StaffExtra>;
  created: MockUser[];
  sessions: SessionRow[];
}

const NAMES: Record<string, [string, string]> = {
  TELLER: ['Teller', 'Counter staff: customers and accounts, no approvals'],
  FIELD_OFFICER: ['Field officer', 'Onboarding customers and groups in the field'],
  KYC_OFFICER: ['KYC officer', 'Verifies and approves customers'],
  SUPERVISOR: ['Supervisor', 'Approves customers, accounts and branch operations'],
  ADMINISTRATOR: ['Administrator', 'Security, reference data, products and chart of accounts'],
  AUDITOR: ['Auditor', 'Reads audit logs, sessions and staff'],
};

function today(hour: number, minute: number, daysAgo = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function seed(): SecurityState {
  const groups = Object.keys(NAMES).map((code, index) => ({
    roleGroupId: index + 1,
    roleGroupCode: code,
    roleGroupName: NAMES[code][0],
    description: NAMES[code][1],
    isSystemGroup: true,
    isActive: true,
    permissions: ROLE_GROUPS[code] ?? [],
  }));
  const assignments: SecurityState['assignments'] = {};
  for (const user of MOCK_USERS) {
    assignments[user.staffUserId] = { [HOME_BRANCH.branchId]: [...user.groups], ...user.otherBranches };
  }
  const session = (
    sessionId: number,
    user: string,
    loginAt: string,
    logoutAt: string | null,
    logoutReason: string | null,
    deviceInfo: string,
  ): SessionRow => {
    const staff = MOCK_USERS.find((row) => row.staffCode === user)!;
    return {
      sessionId,
      staffUserId: staff.staffUserId,
      staffCode: staff.staffCode,
      fullName: staff.fullName,
      loginAt,
      logoutAt,
      logoutReason,
      ipAddress: `10.0.0.${sessionId % 100}`,
      deviceInfo,
    };
  };
  return {
    groups,
    assignments,
    extras: {},
    created: [],
    sessions: [
      session(9001, 'TELLER1', today(8, 5), null, null, 'Chrome on Windows'),
      session(9002, 'KYC1', today(8, 40), null, null, 'Edge on Windows'),
      session(9003, 'FIELD1', today(9, 15, 1), today(16, 50, 1), 'USER_INITIATED', 'Chrome on Android'),
      session(9004, 'AUDIT1', today(10, 0, 1), today(10, 30, 1), 'IDLE_TIMEOUT', 'Safari on iPad'),
    ],
  };
}

function load(): SecurityState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      return JSON.parse(raw) as SecurityState;
    }
  } catch {
    // Fresh state below.
  }
  return seed();
}

let state = load();

function save(): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Best effort.
  }
}

/** Makes the sign-in mock hand out what this state says: groups, their permissions, and created staff. */
function sync(): void {
  for (const user of state.created) {
    if (!MOCK_USERS.some((row) => row.staffUserId === user.staffUserId)) {
      MOCK_USERS.push(user);
    }
  }
  for (const group of state.groups) {
    ROLE_GROUPS[group.roleGroupCode] = group.isActive ? group.permissions : [];
  }
  for (const user of MOCK_USERS) {
    const byBranch = state.assignments[user.staffUserId];
    if (!byBranch) {
      continue;
    }
    user.groups = byBranch[HOME_BRANCH.branchId] ?? [];
    const others = Object.entries(byBranch).filter(([branchId]) => Number(branchId) !== HOME_BRANCH.branchId);
    user.otherBranches = Object.fromEntries(others.map(([branchId, codes]) => [Number(branchId), codes]));
  }
}
sync();

/** Disabled staff cannot sign in (the API answers as for a wrong password). */
export function staffDisabled(staffUserId: number): boolean {
  return state.extras[staffUserId]?.isDisabled ?? false;
}

/** Test hook: back to the seeded staff, groups and sessions. */
export function resetSecurity(): void {
  state = seed();
  save();
  sync();
}

const extraOf = (staffUserId: number): StaffExtra =>
  state.extras[staffUserId] ?? {
    branchId: HOME_BRANCH.branchId,
    isDisabled: false,
    isTeller: false,
    tellerGLAccountId: null,
    secretKeyExpiryDays: 90,
  };

function summary(user: MockUser): StaffSummary {
  const extra = extraOf(user.staffUserId);
  const branch = BRANCHES.find((row) => row.branchId === extra.branchId) ?? HOME_BRANCH;
  return {
    staffUserId: user.staffUserId,
    staffCode: user.staffCode,
    fullName: user.fullName,
    branchId: branch.branchId,
    branchCode: branch.branchCode,
    isDisabled: extra.isDisabled,
    canSwitchBranch: user.canSwitchBranch ?? false,
    mustChangeSecretKey: user.mustChange,
  };
}

function detail(user: MockUser): StaffDetail {
  const extra = extraOf(user.staffUserId);
  const byBranch = state.assignments[user.staffUserId] ?? {};
  return {
    staff: summary(user),
    secretKeyExpiryDays: extra.secretKeyExpiryDays,
    isTeller: extra.isTeller,
    tellerGLAccountId: extra.tellerGLAccountId,
    assignments: Object.entries(byBranch).flatMap(([branchId, codes]) => {
      const branch = BRANCHES.find((row) => row.branchId === Number(branchId))!;
      return codes.map((code) => ({
        branchId: branch.branchId,
        branchCode: branch.branchCode,
        roleGroupCode: code,
        roleGroupName: state.groups.find((group) => group.roleGroupCode === code)?.roleGroupName ?? code,
      }));
    }),
  };
}

function groupSummary(group: MockGroup): RoleGroupSummary {
  const members = Object.values(state.assignments).filter((byBranch) =>
    Object.values(byBranch).some((codes) => codes.includes(group.roleGroupCode)),
  ).length;
  return {
    roleGroupId: group.roleGroupId,
    roleGroupCode: group.roleGroupCode,
    roleGroupName: group.roleGroupName,
    description: group.description,
    isSystemGroup: group.isSystemGroup,
    isActive: group.isActive,
    memberCount: members,
    pendingChangeRequestId: pendingChange('RoleGroup', String(group.roleGroupId))?.changeRequestId ?? null,
  };
}

/** API SecretKeyRules: the rule codes that fail. */
function passwordProblems(candidate: string, staffCode: string): string[] {
  const failures: string[] = [];
  if (candidate.length < 8) failures.push('min-length');
  if (!/\p{Lu}/u.test(candidate)) failures.push('upper');
  if (!/\p{Ll}/u.test(candidate)) failures.push('lower');
  if (!/\p{Nd}/u.test(candidate)) failures.push('digit');
  if (candidate.toUpperCase() === staffCode.toUpperCase()) failures.push('same-as-staff-code');
  return failures;
}

function tellerProblem(
  isTeller: boolean,
  ledgerId: number | null | undefined,
  branchId: number,
): string | null {
  if (!isTeller) {
    return null;
  }
  if (!ledgerId) {
    return "Choose the teller's till account.";
  }
  const ledger = ledgerById(ledgerId);
  return !ledger ||
    ledger.ledgerAccountTypeCode !== 'ASSET' ||
    ledger.branchId !== branchId ||
    ledger.supervisionState !== 'APPROVED'
    ? "Choose an approved asset ledger account in the teller's own branch."
    : null;
}

function permissionProblems(permissions: readonly PermissionGrant[]): string[] {
  const problems: string[] = [];
  for (const grant of permissions) {
    const module = MODULES.find((row) => row.moduleCode === grant.moduleCode);
    if (!module) {
      problems.push(`Unknown module ${grant.moduleCode}.`);
    } else if (
      grant.subModuleCode &&
      !module.subModules.some((row) => row.subModuleCode === grant.subModuleCode)
    ) {
      problems.push(`${grant.subModuleCode} is not part of ${grant.moduleCode}.`);
    }
    if (
      !grant.allowView &&
      (grant.allowAdd || grant.allowEdit || grant.allowDelete || grant.allowSupervise)
    ) {
      problems.push(`${grant.moduleCode}/${grant.subModuleCode}: view is required for any other permission.`);
    }
  }
  return problems;
}

/** Approving a security change applies it here (registered with the approvals mock). */
function applyChange(change: ChangeRequestView): string | null {
  const proposed = change.proposed as Record<string, unknown>;
  switch (change.changeType) {
    case 'ROLE_GROUP_CREATE': {
      const draft = proposed as unknown as RoleGroupRequest;
      state.groups.push({
        roleGroupId: Math.max(...state.groups.map((group) => group.roleGroupId)) + 1,
        roleGroupCode: draft.code ?? '',
        roleGroupName: draft.name ?? '',
        description: draft.description ?? null,
        isSystemGroup: false,
        isActive: true,
        permissions: (draft.permissions ?? []) as PermissionGrant[],
      });
      break;
    }
    case 'ROLE_GROUP_UPDATE': {
      const group = state.groups.find((row) => row.roleGroupId === Number(change.entityId));
      const draft = proposed as unknown as RoleGroupRequest;
      if (group) {
        Object.assign(group, {
          roleGroupName: draft.name ?? group.roleGroupName,
          description: draft.description ?? null,
          permissions: (draft.permissions ?? []) as PermissionGrant[],
        });
      }
      break;
    }
    case 'ROLE_GROUP_DEACTIVATE': {
      const group = state.groups.find((row) => row.roleGroupId === Number(change.entityId));
      if (group) {
        group.isActive = false;
      }
      break;
    }
    case 'STAFF_ROLE_GROUPS_REPLACE': {
      const staffUserId = Number(proposed['staffUserId']);
      const branchId = Number(proposed['branchId']);
      state.assignments[staffUserId] = {
        ...(state.assignments[staffUserId] ?? {}),
        [branchId]: [...((proposed['roleGroupCodes'] as string[]) ?? [])],
      };
      break;
    }
    default:
      return null;
  }
  save();
  sync();
  return null;
}
changeAppliers.push(applyChange);

export function securityHandlers(
  base: string,
  signedIn: (request: Request) => Response | null,
  who: (request: Request) => number | null,
) {
  const guard = (request: Request) => signedIn(request);
  const nameOf = (id: number | null) =>
    MOCK_USERS.find((user) => user.staffUserId === id)?.fullName ?? 'Unknown';
  const findUser = (id: unknown) => MOCK_USERS.find((user) => user.staffUserId === Number(id));
  const findGroup = (id: unknown) => state.groups.find((group) => group.roleGroupId === Number(id));
  const accepted = (changeRequestId: number) => HttpResponse.json({ changeRequestId }, { status: 202 });

  return [
    http.get(
      `${base}/branches`,
      ({ request }) =>
        guard(request) ??
        HttpResponse.json(
          BRANCHES.map((branch) => ({
            ...branch,
            operatingLicenseNo: null,
            clearingDays: 0,
            isActive: true,
          })),
        ),
    ),

    http.get(`${base}/modules`, ({ request }) => guard(request) ?? HttpResponse.json(MODULES)),

    http.get(`${base}/staff-users`, ({ request }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const params = new URL(request.url).searchParams;
      const term = (params.get('search') ?? '').trim().toLowerCase();
      const rows = MOCK_USERS.filter(
        (user) =>
          !term || user.staffCode.toLowerCase().includes(term) || user.fullName.toLowerCase().includes(term),
      )
        .map(summary)
        .sort((a, b) => (a.staffCode < b.staffCode ? -1 : 1));
      const page = Math.max(1, Number(params.get('page') ?? 1));
      const size = Math.max(1, Number(params.get('pageSize') ?? 25));
      return HttpResponse.json({
        items: rows.slice((page - 1) * size, page * size),
        page,
        pageSize: size,
        totalCount: rows.length,
      });
    }),

    http.get(`${base}/staff-users/:id`, ({ request, params }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const user = findUser(params['id']);
      return user ? HttpResponse.json(detail(user)) : problem(404, 'not-found');
    }),

    http.post(`${base}/staff-users`, async ({ request }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as CreateStaffRequest;
      const code = (body.staffCode ?? '').trim().toUpperCase();
      const name = (body.fullName ?? '').trim();
      const errors: Record<string, string[]> = {};
      if (!/^[A-Z0-9_-]{1,20}$/.test(code)) {
        errors['staffCode'] = ['Use 1 to 20 capital letters, digits, dashes or underscores.'];
      }
      if (!name || name.length > 100) {
        errors['fullName'] = ['Enter a name of up to 100 characters.'];
      }
      const rules = passwordProblems(body.initialSecretKey ?? '', code);
      if (rules.length > 0) {
        errors['initialSecretKey'] = rules;
      }
      if (!BRANCHES.some((branch) => branch.branchId === body.branchId)) {
        errors['branchId'] = ['Choose an existing branch.'];
      } else {
        const teller = tellerProblem(body.isTeller ?? false, body.tellerGLAccountId, body.branchId);
        if (teller) {
          errors['tellerGLAccountId'] = [teller];
        }
      }
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      if (MOCK_USERS.some((user) => user.staffCode === code)) {
        return problem(409, 'staff.code-taken');
      }
      const staffUserId = Math.max(...MOCK_USERS.map((user) => user.staffUserId)) + 1;
      const user: MockUser = {
        staffUserId,
        staffCode: code,
        fullName: name,
        secret: body.initialSecretKey ?? '',
        mustChange: true,
        groups: [],
        canSwitchBranch: body.canSwitchBranch ?? false,
      };
      state.created.push(user);
      state.assignments[staffUserId] = {};
      state.extras[staffUserId] = {
        branchId: body.branchId,
        isDisabled: false,
        isTeller: body.isTeller ?? false,
        tellerGLAccountId: body.isTeller ? (body.tellerGLAccountId ?? null) : null,
        secretKeyExpiryDays: 90,
      };
      save();
      sync();
      return HttpResponse.json({ id: staffUserId }, { status: 201 });
    }),

    http.put(`${base}/staff-users/:id`, async ({ request, params }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const user = findUser(params['id']);
      if (!user) {
        return problem(404, 'not-found');
      }
      if (user.staffUserId === who(request)) {
        return problem(409, 'staff.self-change');
      }
      const body = (await request.json()) as UpdateStaffRequest;
      const name = (body.fullName ?? '').trim();
      const extra = extraOf(user.staffUserId);
      const errors: Record<string, string[]> = {};
      if (!name || name.length > 100) {
        errors['fullName'] = ['Enter a name of up to 100 characters.'];
      }
      const teller = tellerProblem(body.isTeller ?? false, body.tellerGLAccountId, extra.branchId);
      if (teller) {
        errors['tellerGLAccountId'] = [teller];
      }
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      user.fullName = name;
      user.canSwitchBranch = body.canSwitchBranch;
      state.extras[user.staffUserId] = {
        ...extra,
        isDisabled: body.isDisabled,
        isTeller: body.isTeller ?? false,
        tellerGLAccountId: body.isTeller ? (body.tellerGLAccountId ?? null) : null,
        secretKeyExpiryDays: body.secretKeyExpiryDays,
      };
      if (body.isDisabled) {
        endOpenSessions(user.staffUserId, 'ACCOUNT_DISABLED');
      }
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.post(`${base}/staff-users/:id/reset-secret-key`, async ({ request, params }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const user = findUser(params['id']);
      if (!user) {
        return problem(404, 'not-found');
      }
      if (user.staffUserId === who(request)) {
        return problem(409, 'staff.self-change');
      }
      const body = (await request.json()) as { newSecretKey?: string };
      const rules = passwordProblems(body.newSecretKey ?? '', user.staffCode);
      if (rules.length > 0) {
        return validation({ newSecretKey: rules });
      }
      user.secret = body.newSecretKey ?? '';
      user.mustChange = true;
      endOpenSessions(user.staffUserId, 'SECRET_KEY_CHANGED');
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.put(`${base}/staff-users/:id/role-groups`, async ({ request, params }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const user = findUser(params['id']);
      const me = who(request) ?? 0;
      const body = (await request.json()) as { branchId: number; roleGroupCodes: string[] | null };
      if (user?.staffUserId === me) {
        return problem(409, 'security.self-assignment');
      }
      if (!user || !BRANCHES.some((branch) => branch.branchId === body.branchId)) {
        return problem(404, 'not-found');
      }
      const codes = [...new Set((body.roleGroupCodes ?? []).map((code) => code.trim().toUpperCase()))].sort();
      const unknown = codes.filter(
        (code) => !state.groups.some((group) => group.roleGroupCode === code && group.isActive),
      );
      if (unknown.length > 0) {
        return validation({ roleGroupCodes: [`Unknown or inactive role groups: ${unknown.join(', ')}.`] });
      }
      const entityId = `${user.staffUserId}:${body.branchId}`;
      if (pendingChange('StaffBranchAssignment', entityId)) {
        return problem(409, 'change.pending-exists');
      }
      const current = [...(state.assignments[user.staffUserId]?.[body.branchId] ?? [])].sort();
      return accepted(
        addChange(
          {
            entityType: 'StaffBranchAssignment',
            entityId,
            changeType: 'STAFF_ROLE_GROUPS_REPLACE',
            before: { staffUserId: user.staffUserId, branchId: body.branchId, roleGroupCodes: current },
            proposed: { staffUserId: user.staffUserId, branchId: body.branchId, roleGroupCodes: codes },
          },
          me,
          nameOf(me),
        ),
      );
    }),

    http.get(
      `${base}/role-groups`,
      ({ request }) => guard(request) ?? HttpResponse.json(state.groups.map(groupSummary)),
    ),

    http.get(`${base}/role-groups/:id`, ({ request, params }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const group = findGroup(params['id']);
      return group
        ? HttpResponse.json({ group: groupSummary(group), permissions: group.permissions })
        : problem(404, 'not-found');
    }),

    http.get(`${base}/role-groups/:id/members`, ({ request, params }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const group = findGroup(params['id']);
      if (!group) {
        return problem(404, 'not-found');
      }
      return HttpResponse.json(
        Object.entries(state.assignments).flatMap(([staffUserId, byBranch]) =>
          Object.entries(byBranch)
            .filter(([, codes]) => codes.includes(group.roleGroupCode))
            .map(([branchId]) => {
              const user = findUser(staffUserId)!;
              const branch = BRANCHES.find((row) => row.branchId === Number(branchId))!;
              return {
                staffUserId: user.staffUserId,
                staffCode: user.staffCode,
                fullName: user.fullName,
                branchId: branch.branchId,
                branchCode: branch.branchCode,
              };
            }),
        ),
      );
    }),

    http.post(`${base}/role-groups`, async ({ request }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as RoleGroupRequest;
      const code = (body.code ?? '').trim().toUpperCase();
      const errors = groupErrors(code, body);
      if (errors) {
        return validation(errors);
      }
      if (
        state.groups.some((group) => group.roleGroupCode === code) ||
        pendingChange('RoleGroup', `new:${code}`)
      ) {
        return problem(409, 'rolegroup.code-taken');
      }
      const me = who(request) ?? 0;
      return accepted(
        addChange(
          {
            entityType: 'RoleGroup',
            entityId: `new:${code}`,
            changeType: 'ROLE_GROUP_CREATE',
            before: null,
            proposed: { ...draftOf(code, body) },
          },
          me,
          nameOf(me),
        ),
      );
    }),

    http.put(`${base}/role-groups/:id`, async ({ request, params }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const group = findGroup(params['id']);
      if (!group) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as RoleGroupRequest;
      const errors = groupErrors(group.roleGroupCode, body);
      if (errors) {
        return validation(errors);
      }
      if (pendingChange('RoleGroup', String(group.roleGroupId))) {
        return problem(409, 'change.pending-exists');
      }
      const me = who(request) ?? 0;
      return accepted(
        addChange(
          {
            entityType: 'RoleGroup',
            entityId: String(group.roleGroupId),
            changeType: 'ROLE_GROUP_UPDATE',
            before: snapshot(group),
            proposed: { ...draftOf(group.roleGroupCode, body) },
          },
          me,
          nameOf(me),
        ),
      );
    }),

    http.post(`${base}/role-groups/:id/deactivate`, ({ request, params }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const group = findGroup(params['id']);
      if (!group) {
        return problem(404, 'not-found');
      }
      if (!group.isActive) {
        return problem(409, 'rolegroup.inactive');
      }
      if (pendingChange('RoleGroup', String(group.roleGroupId))) {
        return problem(409, 'change.pending-exists');
      }
      const me = who(request) ?? 0;
      return accepted(
        addChange(
          {
            entityType: 'RoleGroup',
            entityId: String(group.roleGroupId),
            changeType: 'ROLE_GROUP_DEACTIVATE',
            before: snapshot(group),
            proposed: { roleGroupCode: group.roleGroupCode, isActive: false },
          },
          me,
          nameOf(me),
        ),
      );
    }),

    http.get(`${base}/sessions`, ({ request }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const params = new URL(request.url).searchParams;
      const openOnly = params.get('openOnly') === 'true';
      const rows = state.sessions
        .filter((row) => !openOnly || row.logoutAt === null)
        .sort((a, b) => (a.loginAt < b.loginAt ? 1 : -1));
      const page = Math.max(1, Number(params.get('page') ?? 1));
      const size = Math.max(1, Number(params.get('pageSize') ?? 25));
      return HttpResponse.json({
        items: rows.slice((page - 1) * size, page * size),
        page,
        pageSize: size,
        totalCount: rows.length,
      });
    }),

    http.post(`${base}/sessions/:id/end`, ({ request, params }) => {
      const denied = guard(request);
      if (denied) {
        return denied;
      }
      const row = state.sessions.find((item) => item.sessionId === Number(params['id']));
      if (!row) {
        return problem(404, 'not-found');
      }
      if (row.logoutAt !== null) {
        return problem(409, 'session.not-open');
      }
      Object.assign(row, { logoutAt: new Date().toISOString(), logoutReason: 'FORCED_BY_ADMIN' });
      save();
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

function endOpenSessions(staffUserId: number, reason: string): void {
  for (const row of state.sessions) {
    if (row.staffUserId === staffUserId && row.logoutAt === null) {
      Object.assign(row, { logoutAt: new Date().toISOString(), logoutReason: reason });
    }
  }
}

function snapshot(group: MockGroup) {
  return {
    code: group.roleGroupCode,
    name: group.roleGroupName,
    description: group.description,
    permissions: group.permissions,
  };
}

function draftOf(code: string, body: RoleGroupRequest) {
  return {
    code,
    name: (body.name ?? '').trim(),
    description: body.description?.trim() || null,
    permissions: (body.permissions ?? []) as PermissionGrant[],
  };
}

function groupErrors(code: string, body: RoleGroupRequest): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  if (!/^[A-Z0-9_]{1,30}$/.test(code)) {
    errors['code'] = ['Use 1 to 30 capital letters, digits or underscores.'];
  }
  const name = (body.name ?? '').trim();
  if (!name || name.length > 100) {
    errors['name'] = ['Enter a name of up to 100 characters.'];
  }
  if ((body.description ?? '').length > 300) {
    errors['description'] = ['Keep the description to 300 characters.'];
  }
  const problems = permissionProblems((body.permissions ?? []) as PermissionGrant[]);
  if (problems.length > 0) {
    errors['permissions'] = problems;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
