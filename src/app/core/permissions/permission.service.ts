import { Injectable, computed, signal } from '@angular/core';
import type { PermissionGrant } from '../api/api-types';

export type PermissionAction = 'view' | 'add' | 'edit' | 'delete' | 'supervise';

export interface PermissionRule {
  module: string;
  subModule?: string | null;
  action: PermissionAction;
}

/**
 * Mirrors the API rule (addendum 2.2): a module-level row covers all its sub-modules, rows are a union,
 * and anything not granted is denied. Used only to avoid offering actions that would fail; the API enforces.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly grants = signal<readonly PermissionGrant[]>([]);

  readonly loaded = computed(() => this.grants().length > 0);

  set(grants: readonly PermissionGrant[]): void {
    this.grants.set(grants);
  }

  clear(): void {
    this.grants.set([]);
  }

  can(rule: PermissionRule): boolean {
    return allows(this.grants(), rule);
  }

  /** True when any of the rules allows (a page that serves several roles). */
  canAny(rules: readonly PermissionRule[]): boolean {
    return rules.some((rule) => this.can(rule));
  }

  /** True when the user may approve anything at all (approvals badge, approvals menu). */
  canSuperviseAnything(): boolean {
    return this.grants().some((grant) => grant.allowSupervise);
  }
}

export function allows(grants: readonly PermissionGrant[], rule: PermissionRule): boolean {
  const subModule = rule.subModule ?? null;
  return grants.some(
    (grant) =>
      grant.moduleCode === rule.module &&
      (grant.subModuleCode === null || grant.subModuleCode === subModule) &&
      flag(grant, rule.action),
  );
}

function flag(grant: PermissionGrant, action: PermissionAction): boolean {
  switch (action) {
    case 'view':
      return grant.allowView;
    case 'add':
      return grant.allowAdd;
    case 'edit':
      return grant.allowEdit;
    case 'delete':
      return grant.allowDelete;
    case 'supervise':
      return grant.allowSupervise;
    default:
      return false;
  }
}
