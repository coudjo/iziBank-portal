import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { StaffSummary } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import {
  BannerComponent,
  ButtonComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  EmptyDirective,
  EmptyStateComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  PageHeaderComponent,
  StatusChipComponent,
} from '../../shared/ui';
import { staffStatus } from './admin-labels';
import { SecurityClient } from './security.client';

const PAGE_SIZE = 25;

/** Staff list (UX 7.7): search by staff code or name, status chip, New staff member for SEC/USERS add. */
@Component({
  selector: 'ib-staff-list-page',
  imports: [
    RouterLink,
    BannerComponent,
    ButtonComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    EmptyDirective,
    EmptyStateComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    PageHeaderComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .filters {
      max-width: 32rem;
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
    .new {
      display: inline-flex;
      align-items: center;
      font-weight: 550;
    }
  `,
  template: `
    <ib-page-header title="Staff">
      <div ibActions>
        @if (canAdd()) {
          <a class="ant-btn ant-btn-primary new" routerLink="/admin/staff/new">New staff member</a>
        }
      </div>
    </ib-page-header>
    <form class="filters" role="search" aria-label="Staff" (submit)="$event.preventDefault()">
      <ib-form-field label="Search" hint="Staff code or name">
        <input ibInput ibControl type="search" autocomplete="off" (input)="typed($event)" />
      </ib-form-field>
    </form>

    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
      <ib-button (click)="load()">Try again</ib-button>
    } @else {
      <ib-data-table
        caption="Staff"
        [rows]="rows()"
        [total]="total()"
        [page]="page()"
        [pageSize]="pageSize"
        [loading]="loading()"
        [trackBy]="track"
        (pageChange)="page.set($event)"
      >
        <ng-template ibColumn="Staff code" let-row>
          <a class="ib-row-link ib-num" [routerLink]="['/admin/staff', row.staffUserId]">{{
            row.staffCode
          }}</a>
        </ng-template>
        <ng-template ibColumn="Name" let-row
          ><span class="name">{{ row.fullName }}</span></ng-template
        >
        <ng-template ibColumn="Home branch" let-row>{{ row.branchCode }}</ng-template>
        <ng-template ibColumn="Other branches" let-row>{{
          row.canSwitchBranch ? 'Allowed' : 'No'
        }}</ng-template>
        <ng-template ibColumn="Status" let-row>
          <ib-status-chip domain="staff" [code]="status(row)" />
        </ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            <a class="ib-row-link name" [routerLink]="['/admin/staff', row.staffUserId]">{{
              row.fullName
            }}</a>
            <span class="ib-num">{{ row.staffCode }}</span>
          </div>
          <p class="meta">Home branch {{ row.branchCode }}</p>
          <ib-status-chip domain="staff" [code]="status(row)" />
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state
            title="No staff match"
            message="Check the spelling, or search by staff code."
            icon="user"
          />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class StaffListPage {
  private readonly client = inject(SecurityClient);
  private readonly permissions = inject(PermissionService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly rows = signal<StaffSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly canAdd = computed(() =>
    this.permissions.can({ module: 'SEC', subModule: 'USERS', action: 'add' }),
  );
  protected readonly status = staffStatus;

  private request = 0;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.search();
      this.page();
      untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => this.debounce && clearTimeout(this.debounce));
  }

  async load(): Promise<void> {
    const id = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.client.staff({
        search: this.search() || null,
        page: this.page(),
        pageSize: PAGE_SIZE,
      });
      if (id === this.request) {
        this.rows.set(result.items);
        this.total.set(result.totalCount);
      }
    } catch (failure) {
      if (id === this.request) {
        this.error.set(messageFor(toApiProblem(failure)));
      }
    } finally {
      if (id === this.request) {
        this.loading.set(false);
      }
    }
  }

  protected typed(event: Event): void {
    const text = (event.target as HTMLInputElement).value.trim();
    if (this.debounce) {
      clearTimeout(this.debounce);
    }
    this.debounce = setTimeout(() => {
      this.page.set(1);
      this.search.set(text);
    }, 300);
  }

  protected track(row: StaffSummary): number {
    return row.staffUserId;
  }
}
