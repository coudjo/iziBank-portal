import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SessionRow } from '../../core/api/api-types';
import { AuthService } from '../../core/auth/auth.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatTimestamp } from '../../core/formats/dates';
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
  StatusChipComponent,
  ToastService,
} from '../../shared/ui';
import { LOGOUT_REASON_LABELS } from './admin-labels';
import { SecurityClient } from './security.client';

const PAGE_SIZE = 25;

/**
 * Sessions with Force sign-out (UX 6.10 step 6, 7.7). For one staff member the API has no filter yet, so the
 * latest 100 sessions are read and filtered on the page (api-requests P16).
 */
@Component({
  selector: 'ib-sessions-list',
  imports: [
    RouterLink,
    BannerComponent,
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
    .filter {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
      min-height: var(--ib-touch-target);
      margin-bottom: var(--ib-space-2);
      cursor: pointer;
    }
    .filter input {
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .muted {
      color: var(--ib-ink-muted);
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
    .name {
      font-weight: 600;
    }
  `,
  template: `
    <label class="filter">
      <input type="checkbox" [checked]="openOnly()" (change)="openOnly.set($any($event.target).checked)" />
      Signed in now only
    </label>
    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
      <ib-button (click)="load()">Try again</ib-button>
    } @else {
      <ib-data-table
        [caption]="caption()"
        [rows]="shown()"
        [total]="total()"
        [page]="page()"
        [pageSize]="pageSize"
        [loading]="loading()"
        [trackBy]="track"
        (pageChange)="page.set($event)"
      >
        @if (staffUserId() === null) {
          <ng-template ibColumn="Staff" let-row>
            <a class="ib-row-link" [routerLink]="['/admin/staff', row.staffUserId]">{{ row.fullName }}</a>
            <span class="muted ib-num"> {{ row.staffCode }}</span>
          </ng-template>
        }
        <ng-template ibColumn="Signed in" let-row
          ><span class="ib-num">{{ time(row.loginAt) }}</span></ng-template
        >
        <ng-template ibColumn="Device" let-row>{{ row.deviceInfo ?? '—' }}</ng-template>
        <ng-template ibColumn="IP address" let-row
          ><span class="ib-num">{{ row.ipAddress ?? '—' }}</span></ng-template
        >
        <ng-template ibColumn="Status" let-row>
          <ib-status-chip domain="session" [code]="row.logoutAt ? 'ENDED' : 'OPEN'" />
          @if (row.logoutAt) {
            <div class="muted">{{ ended(row) }}</div>
          }
        </ng-template>
        <ng-template ibColumn="Action" align="end" let-row>
          @if (canEnd(row)) {
            <ib-button (click)="end(row)"
              >Force sign-out<span class="ib-visually-hidden"> {{ row.fullName }}</span></ib-button
            >
          }
        </ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            @if (staffUserId() === null) {
              <a class="ib-row-link name" [routerLink]="['/admin/staff', row.staffUserId]">{{
                row.fullName
              }}</a>
            } @else {
              <span class="name ib-num">{{ time(row.loginAt) }}</span>
            }
            <ib-status-chip domain="session" [code]="row.logoutAt ? 'ENDED' : 'OPEN'" />
          </div>
          <p class="meta">
            @if (staffUserId() === null) {
              Signed in <span class="ib-num">{{ time(row.loginAt) }}</span> ·
            }
            {{ row.deviceInfo ?? 'Unknown device' }}
            @if (row.logoutAt) {
              · {{ ended(row) }}
            }
          </p>
          @if (canEnd(row)) {
            <ib-button (click)="end(row)"
              >Force sign-out<span class="ib-visually-hidden"> {{ row.fullName }}</span></ib-button
            >
          }
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state
            [title]="openOnly() ? 'Nobody is signed in' : 'No sessions'"
            message="Sessions appear here when staff sign in."
            icon="solution"
          />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class SessionsListComponent {
  /** One staff member's sessions (record tab), or everyone's when null. */
  readonly staffUserId = input<number | null>(null);

  private readonly client = inject(SecurityClient);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly me = inject(AuthService).me;

  protected readonly pageSize = PAGE_SIZE;
  protected readonly openOnly = signal(true);
  protected readonly page = signal(1);
  private readonly rows = signal<SessionRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly caption = computed(() => (this.openOnly() ? 'Open sessions' : 'Sessions'));
  protected readonly shown = computed(() => this.rows());
  private readonly canEdit = computed(() =>
    this.permissions.can({ module: 'SEC', subModule: 'SESSIONS', action: 'edit' }),
  );

  private request = 0;

  constructor() {
    effect(() => {
      this.openOnly();
      this.page();
      this.staffUserId();
      untracked(() => void this.load());
    });
  }

  async load(): Promise<void> {
    const id = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    const staffUserId = this.staffUserId();
    try {
      if (staffUserId === null) {
        const result = await this.client.sessions({
          openOnly: this.openOnly(),
          page: this.page(),
          pageSize: PAGE_SIZE,
        });
        if (id === this.request) {
          this.rows.set(result.items);
          this.total.set(result.totalCount);
        }
      } else {
        const result = await this.client.sessions({ openOnly: this.openOnly(), page: 1, pageSize: 100 });
        const mine = result.items.filter((row) => row.staffUserId === staffUserId);
        if (id === this.request) {
          this.rows.set(mine.slice((this.page() - 1) * PAGE_SIZE, this.page() * PAGE_SIZE));
          this.total.set(mine.length);
        }
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

  protected canEnd(row: SessionRow): boolean {
    return !row.logoutAt && this.canEdit() && row.staffUserId !== this.me()?.staffUserId;
  }

  protected async end(row: SessionRow): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: `Sign out ${row.fullName ?? 'this staff member'}?`,
      message: 'Their session ends now. Anything they have not saved is lost, and they can sign in again.',
      confirmLabel: 'Force sign-out',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.client.endSession(row.sessionId);
      this.toast.success('Signed out.');
    } catch (failure) {
      this.toast.error(messageFor(toApiProblem(failure)));
    }
    await this.load();
  }

  protected time(iso: string): string {
    return formatTimestamp(iso);
  }

  protected ended(row: SessionRow): string {
    const reason = row.logoutReason ? (LOGOUT_REASON_LABELS[row.logoutReason] ?? row.logoutReason) : 'Ended';
    return `${reason}, ${formatTimestamp(row.logoutAt)}`;
  }

  protected track(row: SessionRow): number {
    return row.sessionId;
  }
}
