import { Injectable, computed, inject, signal } from '@angular/core';
import type { ChangeRequestView, LedgerAccountView, PartySearchRow } from '../../core/api/api-types';
import { AuthService } from '../../core/auth/auth.service';
import { PermissionService } from '../../core/permissions/permission.service';
import { InMemoryStores } from '../../core/session/in-memory-stores';
import { CustomersClient } from '../customers';
import { ApprovalsClient } from './approvals.client';

export type ApprovalKind = 'customers' | 'ledger' | 'security';

export interface ApprovalItem {
  kind: ApprovalKind;
  /** Route to the review page or record. */
  link: unknown[];
  what: string;
  detail: string;
  requestedBy: string | null;
  requestedById: number | null;
  requestedOn: string;
}

const REFRESH_MS = 5 * 60_000;

/**
 * The approvals inbox and badge (UX 4.1, 6.6; F8, F3-05). There is no single "waiting for me" API yet (api-requests
 * P3), so the inbox is assembled from the lists the user may approve: customers awaiting approval, chart of accounts
 * items, and security change requests. Items the user requested are kept but marked, since four-eyes stops them.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalsService {
  private readonly permissions = inject(PermissionService);
  private readonly auth = inject(AuthService);
  private readonly customers = inject(CustomersClient);
  private readonly client = inject(ApprovalsClient);

  readonly items = signal<ApprovalItem[]>([]);
  readonly loading = signal(false);
  readonly failed = signal<ApprovalKind[]>([]);
  /** Items this user can act on (not their own). */
  readonly count = computed(() => this.items().filter((item) => !this.isOwn(item)).length);

  private timer: ReturnType<typeof setInterval> | null = null;
  private request = 0;

  constructor() {
    inject(InMemoryStores).register(() => {
      this.request++;
      this.items.set([]);
    });
  }

  kinds(): ApprovalKind[] {
    const kinds: ApprovalKind[] = [];
    if (this.permissions.can({ module: 'PTY', subModule: 'KYC', action: 'supervise' })) {
      kinds.push('customers');
    }
    if (this.permissions.can({ module: 'LED', subModule: 'CHART', action: 'supervise' })) {
      kinds.push('ledger');
    }
    if (this.permissions.can({ module: 'SEC', subModule: 'PERMISSIONS', action: 'supervise' })) {
      kinds.push('security');
    }
    return kinds;
  }

  isOwn(item: ApprovalItem): boolean {
    const me = this.auth.me()?.staffUserId;
    return me !== undefined && item.requestedById === me;
  }

  /** Starts the 5-minute refresh (shell); safe to call more than once. */
  start(): void {
    void this.refresh();
    if (!this.timer) {
      this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
    }
  }

  async refresh(): Promise<void> {
    const kinds = this.kinds();
    const id = ++this.request;
    if (kinds.length === 0) {
      this.items.set([]);
      return;
    }
    this.loading.set(true);
    const results = await Promise.allSettled(kinds.map((kind) => this.load(kind)));
    if (id !== this.request) {
      return;
    }
    const items: ApprovalItem[] = [];
    const failed: ApprovalKind[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        items.push(...result.value);
      } else {
        failed.push(kinds[index]);
      }
    });
    // Oldest first (UX 6.6 step 1).
    items.sort((a, b) => a.requestedOn.localeCompare(b.requestedOn));
    this.items.set(items);
    this.failed.set(failed);
    this.loading.set(false);
  }

  /** The item after `current` of the same kind, for "move to the next item" after a decision (UX 6.6 step 5). */
  nextAfter(kind: ApprovalKind, link: unknown[]): ApprovalItem | null {
    const same = this.items().filter((item) => item.kind === kind && !this.isOwn(item));
    const index = same.findIndex((item) => item.link.join('/') === link.join('/'));
    return same[index + 1] ?? same.find((item) => item.link.join('/') !== link.join('/')) ?? null;
  }

  private async load(kind: ApprovalKind): Promise<ApprovalItem[]> {
    switch (kind) {
      case 'customers': {
        const page = await this.customers.search({
          supervision: 'PENDING',
          oldestFirst: true,
          pageSize: 100,
        });
        return page.items.map(customerItem);
      }
      case 'ledger': {
        const page = await this.client.ledgerAccounts({ pageSize: 100 });
        return page.items
          .filter((row) => row.supervisionState === 'PENDING' || row.pendingChange)
          .map(ledgerItem);
      }
      case 'security':
        return (await this.client.changeRequests('PENDING')).map(changeItem);
    }
  }
}

function customerItem(row: PartySearchRow): ApprovalItem {
  return {
    kind: 'customers',
    link: ['/customers', row.partyId, 'kyc'],
    what: row.displayName,
    detail: `Customer ${row.partyNumber}`,
    requestedBy: null,
    requestedById: null,
    requestedOn: row.createdOn,
  };
}

function ledgerItem(row: LedgerAccountView): ApprovalItem {
  const rename = row.pendingChange;
  return {
    kind: 'ledger',
    link: ['/approvals', 'review', 'ledger', row.ledgerAccountId],
    what: `${row.ledgerAccountCode} ${row.accountName}`,
    detail: rename ? `Rename to "${rename.proposedName}"` : 'New ledger account',
    requestedBy: null,
    requestedById: rename ? rename.requestedByUserId : (row.modifiedByUserId ?? row.createdByUserId),
    requestedOn: rename ? rename.requestedOn : (row.supervisedOn ?? ''),
  };
}

const CHANGE_TYPES: Readonly<Record<string, string>> = {
  ROLE_GROUP_CREATE: 'New role group',
  ROLE_GROUP_UPDATE: 'Role group change',
  ROLE_GROUP_DEACTIVATE: 'Role group deactivation',
  STAFF_ROLE_GROUPS_REPLACE: 'Staff role groups',
  LEDGER_ACCOUNT_RENAME: 'Ledger account rename',
};

export function changeTypeLabel(code: string): string {
  return CHANGE_TYPES[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

function changeItem(row: ChangeRequestView): ApprovalItem {
  const proposed = (row.proposed ?? {}) as Record<string, unknown>;
  const name = typeof proposed['name'] === 'string' ? proposed['name'] : `${row.entityType} ${row.entityId}`;
  return {
    kind: 'security',
    link: ['/approvals', 'review', 'change', row.changeRequestId],
    what: name,
    detail: changeTypeLabel(row.changeType),
    requestedBy: row.requestedByName,
    requestedById: row.requestedByUserId,
    requestedOn: row.requestedOn,
  };
}
