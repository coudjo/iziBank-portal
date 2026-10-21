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
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { ModuleView, PermissionGrant, RoleGroupDetail, RoleGroupMember } from '../../core/api/api-types';
import { ApiProblem, toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import { FormProblem, applyServerErrors, errorMessage, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import type { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  ErrorSummaryComponent,
  FormControlDirective,
  FormFieldComponent,
  IconComponent,
  InputDirective,
  PageHeaderComponent,
  StatusChipComponent,
  ToastService,
} from '../../shared/ui';
import { ApprovalsService } from '../approvals';
import { PermissionMatrixComponent } from './permission-matrix.component';
import { describeChanges, matrixRows, sameGrants } from './permission-matrix';
import { SecurityClient } from './security.client';

const FIELDS = ['code', 'name', 'description', 'permissions'];
const MESSAGES = {
  code: { required: 'Enter the code.', pattern: 'Use 1 to 30 capital letters, digits or underscores.' },
  name: { required: 'Enter the name.' },
  description: {},
  permissions: {},
};

/**
 * New role group and a role group's page (UX 6.10 step 3, 7.7): name, description and the permissions matrix. Every
 * change waits for a second administrator. Before sending, the page says what changes and how many people it
 * affects. Members are listed with a link to each staff record.
 */
@Component({
  selector: 'ib-role-group-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BannerComponent,
    ButtonComponent,
    ErrorSummaryComponent,
    FormControlDirective,
    FormFieldComponent,
    IconComponent,
    InputDirective,
    PageHeaderComponent,
    PermissionMatrixComponent,
    StatusChipComponent,
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
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2) var(--ib-space-3);
      margin: 0 0 var(--ib-space-4);
      align-items: center;
      color: var(--ib-ink-muted);
    }
    .system {
      display: inline-flex;
      align-items: center;
      gap: var(--ib-space-1);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 var(--ib-space-4);
    }
    @media (max-width: 767.98px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    textarea {
      min-height: 4.5rem;
      resize: vertical;
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
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-4);
    }
    .members {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .members li {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      align-items: center;
      min-height: var(--ib-touch-target);
      border-top: 1px solid var(--ib-line);
    }
    .members li:first-child {
      border-top: 0;
    }
    .muted {
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    <ib-page-header [title]="title()" />
    @if (problem(); as current) {
      <ib-banner tone="danger" [message]="describe(current)" />
    } @else if (id() && !detail()) {
      <p aria-live="polite">Loading the role group…</p>
    } @else {
      @if (detail(); as group) {
        <div class="chips">
          <ib-status-chip domain="record" [code]="group.group.isActive ? 'ACTIVE' : 'INACTIVE'" />
          <span class="ib-num">{{ group.group.roleGroupCode }}</span>
          @if (group.group.isSystemGroup) {
            <span class="system"><ib-icon name="lock" />System group</span>
          }
          <span>{{ peopleText() }}</span>
        </div>
        @if (group.group.pendingChangeRequestId; as changeId) {
          <ib-banner
            tone="warning"
            message="A change to this role group is awaiting approval."
            description="You can change it again once that change is approved or rejected."
          />
          <p><a [routerLink]="['/approvals', 'review', 'change', changeId]">Open the change</a></p>
        }
      }

      <form [formGroup]="form" (ngSubmit)="send()" novalidate>
        <section aria-labelledby="details-title">
          <h2 id="details-title">Details</h2>
          <ib-error-summary [problems]="problems()" />
          @if (message(); as text) {
            <ib-banner tone="danger" [message]="text" />
          }
          <div class="grid">
            @if (!detail()) {
              <ib-form-field
                label="Code"
                [required]="true"
                hint="For example LOAN_OFFICER"
                [error]="error('code')"
              >
                <input ibInput ibControl formControlName="code" autocomplete="off" maxlength="30" />
              </ib-form-field>
            }
            <ib-form-field label="Name" [required]="true" [error]="error('name')">
              <input ibInput ibControl formControlName="name" autocomplete="off" maxlength="100" />
            </ib-form-field>
          </div>
          <ib-form-field label="Description" [error]="error('description')">
            <textarea ibInput ibControl formControlName="description" maxlength="300"></textarea>
          </ib-form-field>
        </section>

        <section aria-labelledby="permissions-title">
          <h2 id="permissions-title">Permissions</h2>
          @if (permissionsError(); as text) {
            <ib-banner tone="danger" [message]="text" />
          }
          @if (modules().length > 0) {
            @if (canEdit()) {
              <ib-permission-matrix
                [modules]="modules()"
                [grants]="grants()"
                [editable]="true"
                caption="Permissions of this role group"
                (grantsChange)="changeGrants($event)"
              />
            } @else {
              <ib-permission-matrix
                [modules]="modules()"
                [groups]="[{ name: title(), permissions: grants() }]"
                [showGrantedBy]="false"
                caption="Permissions of this role group"
              />
            }
          }

          @if (dirty() && changes().length > 0) {
            <div class="summary" aria-live="polite">
              <h3>What changes{{ detail() ? ' for ' + peopleText() : '' }}</h3>
              <ul>
                @for (line of changes(); track line) {
                  <li>{{ line }}</li>
                }
              </ul>
            </div>
          }

          @if (canEdit()) {
            <div class="actions">
              @if (canDeactivate()) {
                <ib-button variant="danger" (click)="deactivate()">Deactivate</ib-button>
              }
              <ib-button variant="primary" type="submit" [disabled]="!dirty()" [loading]="guard.busy()"
                >Send for approval</ib-button
              >
            </div>
          }
        </section>
      </form>

      @if (detail()) {
        <section aria-labelledby="members-title">
          <h2 id="members-title">Members</h2>
          @if (members().length === 0) {
            <p class="muted">Nobody holds this role group.</p>
          } @else {
            <ul class="members" aria-label="Members">
              @for (member of members(); track member.staffUserId + ':' + member.branchId) {
                <li>
                  <a [routerLink]="['/admin/staff', member.staffUserId, 'role-groups']">{{
                    member.fullName
                  }}</a>
                  <span class="muted ib-num">{{ member.staffCode }}</span>
                  <span class="muted">Branch {{ member.branchCode }}</span>
                </li>
              }
            </ul>
          }
        </section>
      }
    }
  `,
})
export class RoleGroupPage implements HasUnsavedChanges {
  /** Route parameter `:id`; absent on the New role group route. */
  readonly id = input<string>();

  private readonly client = inject(SecurityClient);
  private readonly approvals = inject(ApprovalsService);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly guard = new SubmitGuard();
  protected readonly modules = signal<ModuleView[]>([]);
  protected readonly detail = signal<RoleGroupDetail | null>(null);
  protected readonly members = signal<RoleGroupMember[]>([]);
  protected readonly problem = signal<ApiProblem | null>(null);
  protected readonly problems = signal<FormProblem[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly permissionsError = signal<string | null>(null);
  protected readonly grants = signal<PermissionGrant[]>([]);
  private readonly submitted = signal(false);
  private leaving = false;

  protected readonly form = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9_]{1,30}$/)],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    description: new FormControl('', { nonNullable: true, validators: Validators.maxLength(300) }),
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly title = computed(
    () => this.detail()?.group.roleGroupName ?? (this.id() ? 'Role group' : 'New role group'),
  );
  protected readonly peopleText = computed(() => {
    const count = this.detail()?.group.memberCount ?? 0;
    return count === 1 ? '1 person' : `${count} people`;
  });
  protected readonly canEdit = computed(() => {
    const group = this.detail();
    return group
      ? group.group.isActive &&
          !group.group.pendingChangeRequestId &&
          this.permissions.can({ module: 'SEC', subModule: 'PERMISSIONS', action: 'edit' })
      : this.permissions.can({ module: 'SEC', subModule: 'PERMISSIONS', action: 'add' });
  });
  protected readonly canDeactivate = computed(() => !!this.detail());
  private readonly original = computed(() => this.detail()?.permissions ?? []);
  protected readonly changes = computed(() =>
    describeChanges(matrixRows(this.modules()), this.original(), this.grants()),
  );
  protected readonly dirty = computed(() => {
    const group = this.detail();
    const value = this.value();
    const grantsChanged = !sameGrants(this.original(), this.grants());
    if (!group) {
      return grantsChanged || !!value.code || !!value.name;
    }
    return (
      grantsChanged ||
      (value.name ?? '').trim() !== group.group.roleGroupName ||
      (value.description ?? '').trim() !== (group.group.description ?? '')
    );
  });

  constructor() {
    this.client.modules().then(
      (rows) => this.modules.set(rows),
      (failure) => this.problem.set(toApiProblem(failure)),
    );
    effect(() => {
      const id = this.id();
      untracked(() => (id ? void this.load(Number(id)) : undefined));
    });
    effect(() => {
      if (!this.canEdit()) {
        this.form.disable({ emitEvent: false });
      } else {
        this.form.enable({ emitEvent: false });
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return !this.leaving && this.dirty();
  }

  private async load(roleGroupId: number): Promise<void> {
    this.problem.set(null);
    try {
      const [detail, members] = await Promise.all([
        this.client.roleGroup(roleGroupId),
        this.client.members(roleGroupId),
      ]);
      this.detail.set(detail);
      this.members.set(members);
      this.grants.set(detail.permissions);
      this.form.reset({
        code: detail.group.roleGroupCode,
        name: detail.group.roleGroupName,
        description: detail.group.description ?? '',
      });
    } catch (failure) {
      this.problem.set(toApiProblem(failure));
    }
  }

  protected changeGrants(grants: PermissionGrant[]): void {
    this.grants.set(grants);
    this.permissionsError.set(null);
  }

  protected error(name: string): string | null {
    const control = this.form.get(name);
    if (!control || control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return errorMessage(control, MESSAGES[name as keyof typeof MESSAGES]);
  }

  protected async send(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const group = this.detail();
    const fields = group ? FIELDS.filter((name) => name !== 'code') : FIELDS;
    const problems = formProblems(this.form, fields, MESSAGES);
    this.problems.set(problems);
    if (problems.length > 0 || !this.dirty()) {
      return;
    }
    const confirmed = await this.dialogs.confirm({
      title: 'Send for approval?',
      message: group
        ? `This changes what ${this.peopleText()} can do once another administrator approves it.`
        : 'The role group can be given to staff once another administrator approves it.',
      confirmLabel: 'Send for approval',
    });
    if (!confirmed) {
      return;
    }
    const value = this.form.getRawValue();
    const request = {
      code: group ? group.group.roleGroupCode : value.code.trim().toUpperCase(),
      name: value.name.trim(),
      description: value.description.trim() || null,
      permissions: this.grants(),
    };
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        if (group) {
          await this.client.updateRoleGroup(group.group.roleGroupId, request);
          this.toast.success('Sent for approval. The change applies once another administrator approves it.');
          void this.approvals.refresh();
          await this.load(group.group.roleGroupId);
        } else {
          await this.client.createRoleGroup(request);
          this.leaving = true;
          this.toast.success(
            'Sent for approval. The role group appears once another administrator approves it.',
          );
          void this.approvals.refresh();
          await this.router.navigate(['/admin/role-groups']);
        }
      } catch (failure) {
        const problem = toApiProblem(failure);
        if (problem.status === 400 && problem.errors) {
          const { permissions, ...rest } = problem.errors;
          if (permissions) {
            this.permissionsError.set(permissions.join(' '));
          }
          const unmatched = applyServerErrors(this.form, rest);
          this.problems.set([...formProblems(this.form, fields, MESSAGES), ...unmatched]);
        } else {
          this.message.set(messageFor(problem));
        }
      }
    });
  }

  protected async deactivate(): Promise<void> {
    const group = this.detail();
    if (!group) {
      return;
    }
    const confirmed = await this.dialogs.confirm({
      title: `Deactivate ${group.group.roleGroupName}?`,
      message:
        group.group.memberCount > 0
          ? `${this.peopleText()} lose these permissions once another administrator approves it.`
          : 'Nobody holds it now. It can no longer be given to staff once approved.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    await this.guard.run(async () => {
      try {
        await this.client.deactivateRoleGroup(group.group.roleGroupId);
        this.toast.success('Sent for approval.');
        void this.approvals.refresh();
        await this.load(group.group.roleGroupId);
      } catch (failure) {
        this.message.set(messageFor(toApiProblem(failure)));
      }
    });
  }

  protected describe(problem: ApiProblem): string {
    return messageFor(problem);
  }
}
