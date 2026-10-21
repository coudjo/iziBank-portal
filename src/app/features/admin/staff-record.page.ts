import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem, toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  MenuButtonComponent,
  MenuItem,
  StatusChipComponent,
  TabLink,
  TabsComponent,
  ToastService,
} from '../../shared/ui';
import { staffStatus } from './admin-labels';
import type { ResetPasswordData } from './reset-password.dialog';
import { SecurityClient } from './security.client';
import { StaffRecordStore } from './staff-record.store';

/**
 * Staff record (UX 6.10): header, Disable or Enable and Reset password in the actions menu, and the Details, Role
 * groups and Sessions tabs. Nobody changes their own record or role groups here (API `staff.self-change`).
 */
@Component({
  selector: 'ib-staff-record-page',
  imports: [
    RouterOutlet,
    BannerComponent,
    ButtonComponent,
    MenuButtonComponent,
    StatusChipComponent,
    TabsComponent,
  ],
  providers: [StaffRecordStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--ib-space-2) var(--ib-space-3);
    }
    .title {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--ib-space-2) var(--ib-space-3);
    }
    h1:focus {
      outline: none;
    }
    h1:focus-visible {
      outline: 2px solid var(--ib-focus);
      outline-offset: 2px;
    }
    .code {
      color: var(--ib-ink-muted);
      font-size: 15px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      margin: var(--ib-space-2) 0 var(--ib-space-4);
      align-items: center;
    }
    .meta {
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    <div class="title-row">
      <div class="title">
        <h1 tabindex="-1" data-page-title>{{ store.staff()?.staff?.fullName ?? 'Staff member' }}</h1>
        @if (store.staff(); as current) {
          <span class="code ib-num">{{ current.staff.staffCode }}</span>
        }
      </div>
      @if (actions().length > 0) {
        <ib-menu-button label="Actions" [items]="actions()" (selected)="act($event)" />
      }
    </div>
    @if (store.staff(); as current) {
      <div class="chips">
        <ib-status-chip domain="staff" [code]="status()" [explain]="true" />
        <span class="meta"
          >Home branch {{ current.staff.branchCode }}{{ current.isTeller ? ' · Teller' : ''
          }}{{ current.staff.canSwitchBranch ? ' · May work in other branches' : '' }}</span
        >
      </div>
      @if (own()) {
        <ib-banner
          tone="info"
          message="This is your own record."
          description="Another administrator changes your details, role groups and password."
        />
      }
      <ib-tabs label="Staff record" [tabs]="tabs()" />
      <router-outlet />
    } @else if (store.problem(); as problem) {
      <ib-banner tone="danger" [message]="message(problem)" />
      @if (problem.type !== 'not-found') {
        <ib-button (click)="store.reload()">Try again</ib-button>
      }
    } @else {
      <p aria-live="polite">Loading the staff member…</p>
    }
  `,
})
export class StaffRecordPage {
  /** Route parameter `:id`. */
  readonly id = input.required<string>();

  protected readonly store = inject(StaffRecordStore);
  private readonly client = inject(SecurityClient);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly me = inject(AuthService).me;
  private readonly guard = new SubmitGuard();

  protected readonly own = computed(() => this.store.staff()?.staff.staffUserId === this.me()?.staffUserId);
  protected readonly status = computed(() => {
    const current = this.store.staff();
    return current ? staffStatus(current.staff) : 'ACTIVE';
  });
  protected readonly tabs = computed((): TabLink[] => [
    { label: 'Details', path: 'details' },
    ...(this.permissions.can({ module: 'SEC', subModule: 'PERMISSIONS', action: 'view' })
      ? [{ label: 'Role groups', path: 'role-groups' }]
      : []),
    ...(this.permissions.can({ module: 'SEC', subModule: 'SESSIONS', action: 'view' })
      ? [{ label: 'Sessions', path: 'sessions' }]
      : []),
  ]);
  protected readonly actions = computed((): MenuItem[] => {
    const current = this.store.staff();
    if (
      !current ||
      this.own() ||
      !this.permissions.can({ module: 'SEC', subModule: 'USERS', action: 'edit' })
    ) {
      return [];
    }
    return [
      current.staff.isDisabled
        ? { label: 'Enable', value: 'enable' }
        : { label: 'Disable', value: 'disable' },
      { label: 'Reset password', value: 'reset' },
    ];
  });

  constructor() {
    effect(() => {
      const staffUserId = Number(this.id());
      untracked(() => void this.store.load(staffUserId));
    });
  }

  protected async act(action: string): Promise<void> {
    const current = this.store.staff();
    if (!current) {
      return;
    }
    if (action === 'reset') {
      const { ResetPasswordDialogComponent } = await import('./reset-password.dialog');
      const ref = await this.dialogs.open<
        InstanceType<typeof ResetPasswordDialogComponent>,
        ResetPasswordData,
        boolean
      >(
        ResetPasswordDialogComponent,
        {
          staffUserId: current.staff.staffUserId,
          staffCode: current.staff.staffCode,
          fullName: current.staff.fullName,
        },
        { title: `Reset password for ${current.staff.fullName}` },
      );
      ref.afterClose.subscribe((done) => {
        if (done) {
          this.toast.success('Password reset. They choose a new one at next sign-in.');
          void this.store.reload();
        }
      });
      return;
    }
    const disable = action === 'disable';
    const confirmed = await this.dialogs.confirm({
      title: disable ? `Disable ${current.staff.fullName}?` : `Enable ${current.staff.fullName}?`,
      message: disable
        ? 'They are signed out now and cannot sign in until enabled again. Their role groups stay as they are.'
        : 'They can sign in again with their current password.',
      confirmLabel: disable ? 'Disable' : 'Enable',
      tone: disable ? 'danger' : 'primary',
    });
    if (!confirmed) {
      return;
    }
    await this.guard.run(async () => {
      try {
        await this.client.updateStaff(current.staff.staffUserId, {
          fullName: current.staff.fullName,
          canSwitchBranch: current.staff.canSwitchBranch,
          isDisabled: disable,
          secretKeyExpiryDays: current.secretKeyExpiryDays,
          isTeller: current.isTeller ?? false,
          tellerGLAccountId: current.tellerGLAccountId ?? null,
        });
        this.toast.success(disable ? 'Staff member disabled.' : 'Staff member enabled.');
        await this.store.reload();
      } catch (failure) {
        this.toast.error(messageFor(toApiProblem(failure)));
      }
    });
  }

  protected message(problem: ApiProblem): string {
    return messageFor(problem);
  }
}
