import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AccountHolderView } from '../../core/api/api-types';
import { PermissionService } from '../../core/permissions/permission.service';
import { CardDirective, ColumnDirective, DataTableComponent } from '../../shared/ui';
import { partyTypeLabel } from '../customers';
import { HOLDER_ROLE_LABELS, OPERATING_MODE_LABELS, label } from './account-labels';
import { AccountRecordStore } from './account-record.store';

/** Holders tab (UX 7.4): who holds and signs, with the operating mode. */
@Component({
  selector: 'ib-account-holders-tab',
  imports: [RouterLink, CardDirective, ColumnDirective, DataTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .mode {
      margin: 0 0 var(--ib-space-3);
    }
    .name {
      font-weight: 600;
    }
    a {
      text-decoration: underline;
    }
    .meta {
      margin: var(--ib-space-1) 0 0;
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    @if (store.account(); as account) {
      <p class="mode">Operating mode: {{ mode(account.operatingModeCode) }}</p>
      <ib-data-table
        caption="Holders"
        [rows]="account.holders"
        [total]="account.holders.length"
        [pageSize]="account.holders.length || 1"
        [trackBy]="track"
      >
        <ng-template ibColumn="Customer" let-row>
          @if (canOpenCustomers()) {
            <a class="name" [routerLink]="['/customers', row.partyId]">{{ row.displayName }}</a>
          } @else {
            <span class="name">{{ row.displayName }}</span>
          }
        </ng-template>
        <ng-template ibColumn="Customer number" let-row
          ><span class="ib-num">{{ row.partyNumber }}</span></ng-template
        >
        <ng-template ibColumn="Type" let-row>{{ type(row.partyTypeCode) }}</ng-template>
        <ng-template ibColumn="Role" let-row>{{ role(row.roleCode) }}</ng-template>
        <ng-template ibCard let-row>
          @if (canOpenCustomers()) {
            <a class="name" [routerLink]="['/customers', row.partyId]">{{ row.displayName }}</a>
          } @else {
            <span class="name">{{ row.displayName }}</span>
          }
          <p class="meta">
            {{ role(row.roleCode) }} · {{ type(row.partyTypeCode) }} ·
            <span class="ib-num">{{ row.partyNumber }}</span>
          </p>
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class AccountHoldersTab {
  protected readonly store = inject(AccountRecordStore);
  private readonly permissions = inject(PermissionService);
  protected readonly canOpenCustomers = computed(() =>
    this.permissions.can({ module: 'PTY', subModule: 'PARTY', action: 'view' }),
  );

  protected readonly track = (row: AccountHolderView) => row.partyId;
  protected readonly type = partyTypeLabel;
  protected role(code: string): string {
    return label(HOLDER_ROLE_LABELS, code);
  }
  protected mode(code: string | null): string {
    return label(OPERATING_MODE_LABELS, code);
  }
}
