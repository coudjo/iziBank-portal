import type { ModuleView, PermissionGrant } from '../../core/api/api-types';

/** The five permissions, in the order the matrix shows them. UX section 8 says "approve", not "supervise". */
export const ACTIONS = [
  { key: 'allowView', label: 'View' },
  { key: 'allowAdd', label: 'Add' },
  { key: 'allowEdit', label: 'Edit' },
  { key: 'allowDelete', label: 'Delete' },
  { key: 'allowSupervise', label: 'Approve' },
] as const;

export type ActionKey = (typeof ACTIONS)[number]['key'];

/** One matrix row: a whole module (sub-module null) or one of its sub-modules. */
export interface MatrixRow {
  moduleCode: string;
  subModuleCode: string | null;
  /** "Accounts (all)" or "Accounts › Product". */
  label: string;
}

export interface NamedGrants {
  name: string;
  permissions: readonly PermissionGrant[];
}

const keyOf = (moduleCode: string, subModuleCode: string | null) => `${moduleCode}/${subModuleCode ?? '*'}`;
export const rowKey = (row: MatrixRow) => keyOf(row.moduleCode, row.subModuleCode);

/** Rows in catalog order: each module's "all" row, then its sub-modules. */
export function matrixRows(modules: readonly ModuleView[]): MatrixRow[] {
  return modules.flatMap((module) => [
    { moduleCode: module.moduleCode, subModuleCode: null, label: `${module.moduleName} (all)` },
    ...module.subModules.map((sub) => ({
      moduleCode: module.moduleCode,
      subModuleCode: sub.subModuleCode,
      label: `${module.moduleName} › ${sub.subModuleName}`,
    })),
  ]);
}

function grantFor(grants: readonly PermissionGrant[], row: MatrixRow): PermissionGrant | undefined {
  return grants.find(
    (grant) => grant.moduleCode === row.moduleCode && grant.subModuleCode === row.subModuleCode,
  );
}

/** The flag stored on this exact row (what the editor shows as ticked). */
export function stored(grants: readonly PermissionGrant[], row: MatrixRow, action: ActionKey): boolean {
  return grantFor(grants, row)?.[action] ?? false;
}

/**
 * True when the row ends up allowed: a module's "all" row covers its sub-modules (API addendum 2.2), so a
 * sub-module is allowed by its own row or by the module row.
 */
export function allowed(grants: readonly PermissionGrant[], row: MatrixRow, action: ActionKey): boolean {
  return grants.some(
    (grant) =>
      grant.moduleCode === row.moduleCode &&
      (grant.subModuleCode === row.subModuleCode ||
        (row.subModuleCode !== null && grant.subModuleCode === null)) &&
      grant[action],
  );
}

/**
 * Ticks or clears one box. The API needs View for any other permission, so ticking Add ticks View, and clearing
 * View clears the row. Rows with nothing ticked are dropped. Returns a new list.
 */
export function setFlag(
  grants: readonly PermissionGrant[],
  row: MatrixRow,
  action: ActionKey,
  on: boolean,
): PermissionGrant[] {
  const current: PermissionGrant = grantFor(grants, row) ?? {
    moduleCode: row.moduleCode,
    subModuleCode: row.subModuleCode,
    allowView: false,
    allowAdd: false,
    allowEdit: false,
    allowDelete: false,
    allowSupervise: false,
  };
  let next: PermissionGrant = { ...current, [action]: on };
  if (on && action !== 'allowView') {
    next = { ...next, allowView: true };
  }
  if (!on && action === 'allowView') {
    next = { ...next, allowAdd: false, allowEdit: false, allowDelete: false, allowSupervise: false };
  }
  const others = grants.filter((grant) => grant !== grantFor(grants, row));
  const keep = ACTIONS.some((item) => next[item.key]);
  return [...others, ...(keep ? [next] : [])].sort((a, b) => {
    const left = keyOf(a.moduleCode, a.subModuleCode);
    const right = keyOf(b.moduleCode, b.subModuleCode);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/** For each row and permission, the names of the groups that grant it (UX 6.10 step 2: "which group grants it"). */
export function grantedBy(groups: readonly NamedGrants[], row: MatrixRow, action: ActionKey): string[] {
  return groups.filter((group) => allowed(group.permissions, row, action)).map((group) => group.name);
}

/**
 * What changes between two sets of permissions, one line per row: "Adds Approve on Accounts › Product",
 * "Removes Edit, Delete on Security (all)". A change on a module's "all" row is not repeated on its sub-modules.
 */
export function describeChanges(
  rows: readonly MatrixRow[],
  before: readonly PermissionGrant[],
  after: readonly PermissionGrant[],
): string[] {
  const lines: string[] = [];
  const moduleChanged = new Set<string>();
  for (const row of rows) {
    const added: string[] = [];
    const removed: string[] = [];
    for (const action of ACTIONS) {
      if (row.subModuleCode !== null && moduleChanged.has(`${row.moduleCode}:${action.key}`)) {
        continue;
      }
      const was = allowed(before, row, action.key);
      const now = allowed(after, row, action.key);
      if (was === now) {
        continue;
      }
      (now ? added : removed).push(action.label);
      if (row.subModuleCode === null) {
        moduleChanged.add(`${row.moduleCode}:${action.key}`);
      }
    }
    if (added.length > 0) {
      lines.push(`Adds ${added.join(', ')} on ${row.label}`);
    }
    if (removed.length > 0) {
      lines.push(`Removes ${removed.join(', ')} on ${row.label}`);
    }
  }
  return lines;
}

/** All permissions of several groups together (a staff member's groups in one branch). */
export function union(groups: readonly NamedGrants[]): PermissionGrant[] {
  return groups.flatMap((group) => group.permissions);
}

/** True when two permission lists grant exactly the same rows, whatever their order. */
export function sameGrants(a: readonly PermissionGrant[], b: readonly PermissionGrant[]): boolean {
  const canonical = (grants: readonly PermissionGrant[]) =>
    grants
      .filter((grant) => ACTIONS.some((action) => grant[action.key]))
      .map(
        (grant) =>
          `${keyOf(grant.moduleCode, grant.subModuleCode)}:${ACTIONS.map((action) => (grant[action.key] ? 1 : 0)).join('')}`,
      )
      .sort()
      .join('|');
  return canonical(a) === canonical(b);
}
