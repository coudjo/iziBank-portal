import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { BranchView, ChangeRequestView, ModuleView, RoleGroupDetail } from '../../core/api/api-types';
import { AuthService } from '../../core/auth/auth.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  ToastService,
} from '../../shared/ui';
import { ApprovalsClient, ApprovalsService } from '../approvals';
import { PermissionMatrixComponent } from './permission-matrix.component';
import { NamedGrants, describeChanges, matrixRows, union } from './permission-matrix';
import { SecurityClient } from './security.client';
import { StaffRecordStore } from './staff-record.store';

/**
 * Role groups tab (UX 6.10 steps 2 to 4): one or more role groups per branch, the effective permissions matrix with
 * the group behind each permission, and a summary of what changes before it is sent. The change waits for a second
 * administrator (API addendum 2.4); one waiting change per staff member and branch.
 */
@Component({
  selector: 'ib-staff-roles-tab',
  imports: [
    RouterLink,
    BannerComponent,
    ButtonComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    PermissionMatrixComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-4);
    }
    h2 {
      margin-bottom: var(--ib-space-3);
    }
    .branch {
      max-width: 20rem;
    }
    dl.held {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--ib-space-1) var(--ib-space-4);
      margin: 0 0 var(--ib-space-4);
    }
    dt {
      color: var(--ib-ink-muted);
    }
    dd {
      margin: 0;
    }
    fieldset {
      border: 0;
      margin: 0 0 var(--ib-space-4);
      padding: 0;
    }
    legend {
      font-weight: 600;
      margin-bottom: var(--ib-space-2);
    }
    .groups {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
      gap: var(--ib-space-2) var(--ib-space-4);
    }
    label.group {
      display: flex;
      align-items: flex-start;
      gap: var(--ib-space-2);
      min-height: var(--ib-touch-target);
      padding-top: var(--ib-space-2);
      cursor: pointer;
    }
    label.group input {
      width: 18px;
      height: 18px;
      margin: 2px 0 0;
      flex-shrink: 0;
    }
    .group-name {
      font-weight: 600;
    }
    .group-description {
      display: block;
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    .summary {
      margin: var(--ib-space-4) 0;
      padding: var(--ib-space-3);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      background: var(--ib-surface-subtle);
    }
    .summary h3 {
      margin: 0 0 var(--ib-space-2);
      font-size: 14px;
    }
    .summary ul {
      margin: 0;
      padding-left: var(--ib-space-4);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--ib-space-2);
      flex-wrap: wrap;
    }
  `,
  template: `
    @if (failure(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }
    @if (store.staff(); as staff) {
      <section aria-labelledby="held-title">
        <h2 id="held-title">Role groups held</h2>
        <dl class="held">
          @for (branch of branches(); track branch.branchId) {
            <dt>{{ branch.branchName }}</dt>
            <dd>{{ heldIn(branch.branchId) }}</dd>
          }
        </dl>
      </section>

      <section aria-labelledby="choose-title">
        <h2 id="choose-title">Choose role groups</h2>
        <ib-form-field label="Branch" class="branch">
          <select ibInput ibControl [value]="branchId()" (change)="pickBranch($event)">
            @for (branch of branches(); track branch.branchId) {
              <option [value]="branch.branchId" [selected]="branch.branchId === branchId()">
                {{ branch.branchCode }} {{ branch.branchName }}
              </option>
            }
          </select>
        </ib-form-field>

        @if (waiting(); as change) {
          <ib-banner
            tone="warning"
            [message]="
              'A change for ' + branchName() + ' is awaiting approval: ' + proposedNames(change) + '.'
            "
            description="You can change this branch again once it is approved or rejected."
          />
          <p>
            <a [routerLink]="['/approvals', 'review', 'change', change.changeRequestId]">Open the change</a>
          </p>
        }

        <fieldset [disabled]="!canEdit()">
          <legend>Role groups in {{ branchName() }}</legend>
          <ul class="groups">
            @for (group of activeGroups(); track group.group.roleGroupId) {
              <li>
                <label class="group">
                  <input
                    type="checkbox"
                    [checked]="selected().includes(group.group.roleGroupCode)"
                    (change)="toggle(group.group.roleGroupCode, $event)"
                  />
                  <span>
                    <span class="group-name">{{ group.group.roleGroupName }}</span>
                    @if (group.group.description) {
                      <span class="group-description">{{ group.group.description }}</span>
                    }
                  </span>
                </label>
              </li>
            }
          </ul>
        </fieldset>

        @if (changes().length > 0) {
          <div class="summary" aria-live="polite">
            <h3>What changes for {{ staff.staff.fullName }} in {{ branchName() }}</h3>
            <ul>
              @for (line of changes(); track line) {
                <li>{{ line }}</li>
              }
            </ul>
          </div>
        } @else if (dirty()) {
          <p class="summary" aria-live="polite">The permissions stay the same with these groups.</p>
        }

        @if (canEdit()) {
          <div class="actions">
            @if (dirty()) {
              <ib-button (click)="undo()">Undo changes</ib-button>
            }
            <ib-button variant="primary" [disabled]="!dirty()" [loading]="guard.busy()" (click)="send()"
              >Send for approval</ib-button
            >
          </div>
        }
      </section>

      @if (modules().length > 0) {
        <section aria-labelledby="matrix-title">
          <h2 id="matrix-title">Effective permissions in {{ branchName() }}</h2>
          <ib-permission-matrix
            [modules]="modules()"
            [groups]="draftGroups()"
            [caption]="'Permissions in ' + branchName() + (dirty() ? ' with the groups chosen above' : '')"
          />
        </section>
      }
    }
  `,
})
export class StaffRolesTab {
  protected readonly store = inject(StaffRecordStore);
  private readonly client = inject(SecurityClient);
  private readonly approvalsClient = inject(ApprovalsClient);
  private readonly approvals = inject(ApprovalsService);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly me = inject(AuthService).me;

  protected readonly guard = new SubmitGuard();
  protected readonly failure = signal<string | null>(null);
  protected readonly branches = signal<BranchView[]>([]);
  protected readonly modules = signal<ModuleView[]>([]);
  private readonly groups = signal<RoleGroupDetail[]>([]);
  private readonly pending = signal<ChangeRequestView[]>([]);
  protected readonly branchId = signal<number | null>(null);
  protected readonly selected = signal<string[]>([]);

  protected readonly activeGroups = computed(() => this.groups().filter((group) => group.group.isActive));
  protected readonly branchName = computed(
    () => this.branches().find((branch) => branch.branchId === this.branchId())?.branchName ?? 'this branch',
  );
  private readonly current = computed(() => this.codesIn(this.branchId()));
  protected readonly waiting = computed(() => {
    const staffUserId = this.store.staff()?.staff.staffUserId;
    return (
      this.pending().find(
        (change) =>
          change.entityType === 'StaffBranchAssignment' &&
          change.entityId === `${staffUserId}:${this.branchId()}`,
      ) ?? null
    );
  });
  protected readonly canEdit = computed(
    () =>
      !this.waiting() &&
      this.store.staff()?.staff.staffUserId !== this.me()?.staffUserId &&
      this.permissions.can({ module: 'SEC', subModule: 'PERMISSIONS', action: 'edit' }),
  );
  protected readonly dirty = computed(() => sameSet(this.selected(), this.current()) === false);
  protected readonly draftGroups = computed(() => this.named(this.selected()));
  protected readonly changes = computed(() =>
    describeChanges(matrixRows(this.modules()), union(this.named(this.current())), union(this.draftGroups())),
  );

  constructor() {
    void this.loadReference();
    effect(() => {
      const staff = this.store.staff();
      if (staff && this.branchId() === null) {
        untracked(() => this.branchId.set(staff.staff.branchId));
      }
    });
    effect(() => {
      const codes = this.current();
      untracked(() => this.selected.set(codes));
    });
  }

  private async loadReference(): Promise<void> {
    try {
      const [branches, modules, summaries, pending] = await Promise.all([
        this.client.branches(),
        this.client.modules(),
        this.client.roleGroups(),
        this.approvalsClient.changeRequests('PENDING').catch(() => []),
      ]);
      this.branches.set(branches.filter((branch) => branch.isActive));
      this.modules.set(modules);
      this.pending.set(pending);
      this.groups.set(await Promise.all(summaries.map((group) => this.client.roleGroup(group.roleGroupId))));
    } catch (failure) {
      this.failure.set(messageFor(toApiProblem(failure)));
    }
  }

  protected heldIn(branchId: number): string {
    const names = this.codesIn(branchId).map((code) => this.nameOf(code));
    return names.length > 0 ? names.join(', ') : 'None';
  }

  protected proposedNames(change: ChangeRequestView): string {
    const codes = ((change.proposed as { roleGroupCodes?: string[] } | null)?.roleGroupCodes ?? []).map(
      (code) => this.nameOf(code),
    );
    return codes.length > 0 ? codes.join(', ') : 'no role groups';
  }

  protected pickBranch(event: Event): void {
    this.branchId.set(Number((event.target as HTMLSelectElement).value));
  }

  protected toggle(code: string, event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.selected.update((codes) => (on ? [...codes, code].sort() : codes.filter((item) => item !== code)));
  }

  protected undo(): void {
    this.selected.set(this.current());
  }

  protected async send(): Promise<void> {
    const staff = this.store.staff();
    const branchId = this.branchId();
    if (!staff || branchId === null || !this.dirty()) {
      return;
    }
    const confirmed = await this.dialogs.confirm({
      title: 'Send for approval?',
      message: `The role groups for ${staff.staff.fullName} in ${this.branchName()} change when another administrator approves them.`,
      confirmLabel: 'Send for approval',
    });
    if (!confirmed) {
      return;
    }
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        await this.client.assignRoleGroups(staff.staff.staffUserId, branchId, this.selected());
        this.toast.success('Sent for approval. The role groups change once another administrator approves.');
        this.pending.set(await this.approvalsClient.changeRequests('PENDING').catch(() => []));
        void this.approvals.refresh();
      } catch (failure) {
        this.failure.set(messageFor(toApiProblem(failure)));
      }
    });
  }

  private codesIn(branchId: number | null): string[] {
    return (this.store.staff()?.assignments ?? [])
      .filter((row) => row.branchId === branchId)
      .map((row) => row.roleGroupCode)
      .sort();
  }

  private named(codes: readonly string[]): NamedGrants[] {
    return codes.map((code) => {
      const group = this.groups().find((item) => item.group.roleGroupCode === code);
      return { name: group?.group.roleGroupName ?? code, permissions: group?.permissions ?? [] };
    });
  }

  private nameOf(code: string): string {
    return this.groups().find((item) => item.group.roleGroupCode === code)?.group.roleGroupName ?? code;
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}
