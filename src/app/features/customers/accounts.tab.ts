import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { PartyAccountRow } from '../../core/api/api-types';
import { PermissionService } from '../../core/permissions/permission.service';
import {
  ButtonComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  EmptyDirective,
  EmptyStateComponent,
  StatusChipComponent,
} from '../../shared/ui';
import { PRIMARY_STATE } from '../accounts';
import { CustomerRecordStore } from './customer-record.store';

const ROLES: Readonly<Record<string, string>> = {
  PRIMARY: 'Primary holder',
  JOINT: 'Joint holder',
  SIGNATORY: 'Signatory',
  BENEFICIAL_OWNER: 'Beneficial owner',
};

/** Accounts tab (UX 7.3): the accounts this customer holds in any role, and Open account. */
@Component({
  selector: 'ib-customer-accounts-tab',
  imports: [
    RouterLink,
    ButtonComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    EmptyDirective,
    EmptyStateComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .top {
      display: flex;
      justify-content: flex-end;
      margin-bottom: var(--ib-space-3);
    }
    .name {
      font-weight: 600;
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-1);
    }
    .meta {
      margin: 0 0 var(--ib-space-2);
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    @if (canOpen()) {
      <div class="top">
        <ib-button variant="primary" icon="plus" (click)="openAccount()">Open account</ib-button>
      </div>
    }
    <ib-data-table
      caption="Accounts held"
      [rows]="rows()"
      [total]="rows().length"
      [pageSize]="rows().length || 1"
      [trackBy]="track"
    >
      <ng-template ibColumn="Account number" let-row>
        @if (canView()) {
          <a class="ib-row-link ib-num" [routerLink]="['/accounts', row.accountId]">{{
            row.accountNumber
          }}</a>
        } @else {
          <span class="ib-num">{{ row.accountNumber }}</span>
        }
      </ng-template>
      <ng-template ibColumn="Name" let-row
        ><span class="name">{{ row.accountName }}</span></ng-template
      >
      <ng-template ibColumn="Product" let-row>{{ row.productName }}</ng-template>
      <ng-template ibColumn="Role" let-row>{{ role(row.roleCode) }}</ng-template>
      <ng-template ibColumn="Status" let-row>
        <ib-status-chip domain="account" [code]="row.status" />
      </ng-template>
      <ng-template ibCard let-row>
        <div class="card-top">
          @if (canView()) {
            <a class="ib-row-link name" [routerLink]="['/accounts', row.accountId]">{{ row.accountName }}</a>
          } @else {
            <span class="name">{{ row.accountName }}</span>
          }
          <span class="ib-num">{{ row.accountNumber }}</span>
        </div>
        <p class="meta">{{ row.productName }} · {{ role(row.roleCode) }}</p>
        <ib-status-chip domain="account" [code]="row.status" />
      </ng-template>
      <ng-template ibEmpty>
        <ib-empty-state
          title="No accounts yet"
          message="Accounts this customer holds appear here."
          icon="bank"
        />
      </ng-template>
    </ib-data-table>
  `,
})
export class CustomerAccountsTab {
  private readonly store = inject(CustomerRecordStore);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  protected readonly rows = computed(() => this.store.overview()?.accounts ?? []);
  protected readonly canView = computed(() =>
    this.permissions.can({ module: 'ACC', subModule: 'ACCOUNT', action: 'view' }),
  );
  protected readonly canOpen = computed(() =>
    this.permissions.can({ module: 'ACC', subModule: 'ACCOUNT', action: 'add' }),
  );

  protected openAccount(): void {
    const number = this.store.party()?.partyNumber;
    void this.router.navigate(['/accounts', 'new'], { state: number ? { [PRIMARY_STATE]: number } : {} });
  }

  protected role(code: string): string {
    return ROLES[code] ?? code;
  }

  protected readonly track = (row: PartyAccountRow) => row.accountId;
}
