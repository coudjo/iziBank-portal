import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { BranchView } from '../../core/api/api-types';
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

/** Branches (UX 7.7): code, name, licence and clearing days. A branch is deactivated, never deleted. */
@Component({
  selector: 'ib-branches-page',
  imports: [
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
    <ib-page-header title="Branches">
      <div ibActions>
        @if (canAdd()) {
          <ib-button variant="primary" icon="plus" (click)="edit(null)">New branch</ib-button>
        }
      </div>
    </ib-page-header>
    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
      <ib-button (click)="load()">Try again</ib-button>
    } @else {
      <ib-data-table
        caption="Branches"
        [rows]="rows()"
        [total]="rows().length"
        [page]="1"
        [pageSize]="100"
        [loading]="loading()"
        [trackBy]="track"
      >
        <ng-template ibColumn="Code" let-row
          ><span class="ib-num">{{ row.branchCode }}</span></ng-template
        >
        <ng-template ibColumn="Name" let-row>{{ row.branchName }}</ng-template>
        <ng-template ibColumn="Licence" let-row>{{ row.operatingLicenseNo ?? '—' }}</ng-template>
        <ng-template ibColumn="Clearing days" align="end" let-row
          ><span class="ib-num">{{ row.clearingDays ?? '—' }}</span></ng-template
        >
        <ng-template ibColumn="Status" let-row>
          <ib-status-chip domain="record" [code]="row.isActive ? 'ACTIVE' : 'INACTIVE'" />
        </ng-template>
        <ng-template ibColumn="Action" align="end" let-row>
          @if (canEdit()) {
            <ib-button (click)="edit(row)"
              >Edit<span class="ib-visually-hidden"> {{ row.branchName }}</span></ib-button
            >
          }
        </ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            <span>{{ row.branchName }}</span>
            <span class="ib-num">{{ row.branchCode }}</span>
          </div>
          <p class="meta">
            Licence {{ row.operatingLicenseNo ?? 'not set' }} · Clearing days
            {{ row.clearingDays ?? 'not set' }}
          </p>
          <ib-status-chip domain="record" [code]="row.isActive ? 'ACTIVE' : 'INACTIVE'" />
          @if (canEdit()) {
            <ib-button (click)="edit(row)"
              >Edit<span class="ib-visually-hidden"> {{ row.branchName }}</span></ib-button
            >
          }
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state title="No branches" message="Branches you create appear here." icon="appstore" />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class BranchesPage {
  private readonly client = inject(ReferenceClient);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<BranchView[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly canAdd = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'BRANCHES', action: 'add' }),
  );
  protected readonly canEdit = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'BRANCHES', action: 'edit' }),
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.rows.set(await this.client.branches(true));
    } catch (failure) {
      this.error.set(messageFor(toApiProblem(failure)));
    } finally {
      this.loading.set(false);
    }
  }

  protected async edit(branch: BranchView | null): Promise<void> {
    const { BranchDialogComponent } = await import('./branch.dialog');
    const ref = await this.dialogs.open<
      InstanceType<typeof BranchDialogComponent>,
      BranchView | null,
      boolean
    >(BranchDialogComponent, branch, { title: branch ? `Edit ${branch.branchName}` : 'New branch' });
    ref.afterClose.subscribe((saved) => {
      if (saved) {
        this.toast.success(branch ? 'Branch saved.' : 'Branch created.');
        void this.load();
      }
    });
  }

  protected track(row: BranchView): number {
    return row.branchId;
  }
}
