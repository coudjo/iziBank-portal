import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CreditOfficerView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import {
  BannerComponent,
  ButtonComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  DialogService,
  EmptyDirective,
  EmptyStateComponent,
  PageHeaderComponent,
  StatusChipComponent,
  ToastService,
} from '../../shared/ui';
import { ReferenceBackComponent } from './back-link.component';
import { ReferenceClient } from './reference.client';

/**
 * Credit officers (UX 7.7): staff who look after customers. Designate one, or disable and enable them; a disabled
 * officer stays on the customers they had but cannot be chosen for new ones.
 */
@Component({
  selector: 'ib-credit-officers-page',
  imports: [
    RouterLink,
    BannerComponent,
    ButtonComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    EmptyDirective,
    EmptyStateComponent,
    PageHeaderComponent,
    ReferenceBackComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .muted {
      color: var(--ib-ink-muted);
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-1);
      font-weight: 600;
    }
    .meta {
      margin: 0 0 var(--ib-space-2);
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    <ib-reference-back />
    <ib-page-header title="Credit officers">
      <div ibActions>
        @if (canAdd()) {
          <ib-button variant="primary" icon="plus" (click)="designate()">Designate credit officer</ib-button>
        }
      </div>
    </ib-page-header>
    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
      <ib-button (click)="load()">Try again</ib-button>
    } @else {
      <ib-data-table
        caption="Credit officers"
        [rows]="rows()"
        [total]="rows().length"
        [page]="1"
        [pageSize]="100"
        [loading]="loading()"
        [trackBy]="track"
      >
        <ng-template ibColumn="Name" let-row>
          @if (canSeeStaff()) {
            <a class="ib-row-link" [routerLink]="['/admin/staff', row.staffUserId]">{{ row.fullName }}</a>
          } @else {
            {{ row.fullName }}
          }
        </ng-template>
        <ng-template ibColumn="Staff code" let-row
          ><span class="ib-num muted">{{ row.staffCode }}</span></ng-template
        >
        <ng-template ibColumn="Branch" let-row>{{ row.branchCode }}</ng-template>
        <ng-template ibColumn="Status" let-row>
          <ib-status-chip domain="staff" [code]="row.isDisabled ? 'DISABLED' : 'ACTIVE'" />
        </ng-template>
        <ng-template ibColumn="Action" align="end" let-row>
          @if (canEdit()) {
            <ib-button (click)="toggle(row)"
              >{{ row.isDisabled ? 'Enable' : 'Disable'
              }}<span class="ib-visually-hidden"> {{ row.fullName }}</span></ib-button
            >
          }
        </ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            <span>{{ row.fullName }}</span>
            <span class="ib-num">{{ row.staffCode }}</span>
          </div>
          <p class="meta">Branch {{ row.branchCode }}</p>
          <ib-status-chip domain="staff" [code]="row.isDisabled ? 'DISABLED' : 'ACTIVE'" />
          @if (canEdit()) {
            <ib-button (click)="toggle(row)"
              >{{ row.isDisabled ? 'Enable' : 'Disable'
              }}<span class="ib-visually-hidden"> {{ row.fullName }}</span></ib-button
            >
          }
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state
            title="No credit officers"
            message="Designate staff who look after customers."
            icon="team"
          />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class CreditOfficersPage {
  private readonly client = inject(ReferenceClient);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<CreditOfficerView[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly canAdd = computed(() =>
    this.permissions.can({ module: 'PTY', subModule: 'CREDIT_OFFICERS', action: 'add' }),
  );
  protected readonly canEdit = computed(() =>
    this.permissions.can({ module: 'PTY', subModule: 'CREDIT_OFFICERS', action: 'edit' }),
  );
  protected readonly canSeeStaff = computed(() =>
    this.permissions.can({ module: 'SEC', subModule: 'USERS', action: 'view' }),
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.client.creditOfficers();
      this.rows.set(
        [...rows].sort(
          (a, b) => Number(a.isDisabled) - Number(b.isDisabled) || (a.fullName < b.fullName ? -1 : 1),
        ),
      );
    } catch (failure) {
      this.error.set(messageFor(toApiProblem(failure)));
    } finally {
      this.loading.set(false);
    }
  }

  protected async designate(): Promise<void> {
    const { DesignateDialogComponent } = await import('./designate.dialog');
    const ref = await this.dialogs.open<InstanceType<typeof DesignateDialogComponent>, null, boolean>(
      DesignateDialogComponent,
      null,
      { title: 'Designate credit officer' },
    );
    ref.afterClose.subscribe((saved) => {
      if (saved) {
        this.toast.success('Credit officer designated.');
        void this.load();
      }
    });
  }

  protected async toggle(row: CreditOfficerView): Promise<void> {
    const disable = !row.isDisabled;
    const confirmed = await this.dialogs.confirm({
      title: disable
        ? `Disable ${row.fullName} as credit officer?`
        : `Enable ${row.fullName} as credit officer?`,
      message: disable
        ? 'Their customers keep them as credit officer, but they cannot be chosen for other customers.'
        : 'They can be chosen as credit officer again.',
      confirmLabel: disable ? 'Disable' : 'Enable',
      tone: disable ? 'danger' : 'primary',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.client.setCreditOfficerDisabled(row.creditOfficerId, disable);
      this.toast.success(disable ? 'Credit officer disabled.' : 'Credit officer enabled.');
    } catch (failure) {
      this.toast.error(messageFor(toApiProblem(failure)));
    }
    await this.load();
  }

  protected track(row: CreditOfficerView): number {
    return row.creditOfficerId;
  }
}
