import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { NextOfKinView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { displayPhone } from '../../core/formats/phone';
import { CanDirective } from '../../core/permissions/can.directive';
import { PermissionService } from '../../core/permissions/permission.service';
import { FormProblem, applyServerErrors, errorMessage, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  EmptyStateComponent,
  ErrorSummaryComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  MenuButtonComponent,
  PhoneInputComponent,
  ToastService,
} from '../../shared/ui';
import { CustomerRecordStore } from './customer-record.store';
import { CustomersClient } from './customers.client';

const FIELDS = ['fullName', 'relationship', 'mobileNumber'];
const MESSAGES = { fullName: { required: 'Enter the full name.' } };
const RELATIONSHIPS = ['Spouse', 'Parent', 'Child', 'Sibling', 'Relative', 'Friend'];

/** Next of kin (UX 6.2 step 3, F7). Changing them does not reset KYC (API A4-05). */
@Component({
  selector: 'ib-customer-next-of-kin-tab',
  imports: [
    ReactiveFormsModule,
    CanDirective,
    BannerComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorSummaryComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    MenuButtonComponent,
    PhoneInputComponent,
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
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-3);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0 var(--ib-space-4);
    }
    @media (max-width: 1279.98px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      padding: var(--ib-space-3) 0;
      border-top: 1px solid var(--ib-line);
    }
    li:first-child {
      border-top: 0;
    }
    .name {
      font-weight: 600;
    }
    .meta {
      color: var(--ib-ink-muted);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--ib-space-2);
    }
  `,
  template: `
    @if (message(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }
    @if (editingId() !== null) {
      <section aria-labelledby="kin-form-title">
        <h2 id="kin-form-title">{{ editingId() === 0 ? 'Add next of kin' : 'Edit next of kin' }}</h2>
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          <ib-error-summary [problems]="problems()" />
          <div class="grid">
            <ib-form-field label="Full name" [required]="true" [error]="error('fullName')">
              <input ibInput ibControl formControlName="fullName" autocomplete="off" maxlength="100" />
            </ib-form-field>
            <ib-form-field label="Relationship" [error]="error('relationship')">
              <input
                ibInput
                ibControl
                formControlName="relationship"
                autocomplete="off"
                maxlength="40"
                list="ib-relationships"
              />
              <datalist id="ib-relationships">
                @for (relationship of relationships; track relationship) {
                  <option [value]="relationship"></option>
                }
              </datalist>
            </ib-form-field>
            <ib-form-field label="Mobile" [error]="error('mobileNumber')">
              <ib-phone-input formControlName="mobileNumber" autocomplete="off" />
            </ib-form-field>
          </div>
          <div class="actions">
            <ib-button (click)="editingId.set(null)">Cancel</ib-button>
            <ib-button variant="primary" type="submit" [loading]="guard.busy()">Save</ib-button>
          </div>
        </form>
      </section>
    }

    <section aria-labelledby="kin-title">
      <div class="head">
        <h2 id="kin-title">Next of kin</h2>
        @if (editingId() === null) {
          <ib-button
            *ibCan="{ module: 'PTY', subModule: 'PARTY', action: 'edit' }"
            icon="plus"
            (click)="edit(null)"
            >Add next of kin</ib-button
          >
        }
      </div>
      @if (rows().length === 0) {
        <ib-empty-state
          title="No next of kin yet"
          message="KYC for an individual needs at least one."
          icon="team"
        />
      } @else {
        <ul aria-label="Next of kin">
          @for (row of rows(); track row.partyNextOfKinId) {
            <li>
              <span>
                <span class="name">{{ row.fullName }}</span>
                <br />
                <span class="meta">
                  {{ row.relationship || 'Relationship not given' }}
                  @if (row.mobileNumber) {
                    · <span class="ib-num">{{ phone(row.mobileNumber) }}</span>
                  }
                </span>
              </span>
              @if (canEdit()) {
                <ib-menu-button
                  [label]="'Actions for ' + row.fullName"
                  [items]="actions"
                  (selected)="act(row, $event)"
                />
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class CustomerNextOfKinTab implements HasUnsavedChanges {
  private readonly store = inject(CustomerRecordStore);
  private readonly client = inject(CustomersClient);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly relationships = RELATIONSHIPS;
  protected readonly actions = [
    { label: 'Edit', value: 'edit' },
    { label: 'Remove', value: 'remove' },
  ];
  protected readonly rows = signal<NextOfKinView[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly problems = signal<FormProblem[]>([]);
  /** null: not editing; 0: adding; otherwise the row being edited. */
  protected readonly editingId = signal<number | null>(null);
  protected readonly guard = new SubmitGuard();
  private readonly submitted = signal(false);
  protected readonly canEdit = signal(
    inject(PermissionService).can({ module: 'PTY', subModule: 'PARTY', action: 'edit' }),
  );

  protected readonly form = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    relationship: new FormControl('', { nonNullable: true, validators: Validators.maxLength(40) }),
    mobileNumber: new FormControl<string | null>(null),
  });

  constructor() {
    effect(() => {
      const party = this.store.party();
      if (party) {
        untracked(() => void this.load(party.partyId));
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return this.editingId() !== null && this.form.dirty;
  }

  protected edit(row: NextOfKinView | null): void {
    this.form.reset({
      fullName: row?.fullName ?? '',
      relationship: row?.relationship ?? '',
      mobileNumber: row?.mobileNumber ?? null,
    });
    this.submitted.set(false);
    this.problems.set([]);
    this.editingId.set(row?.partyNextOfKinId ?? 0);
  }

  protected async act(row: NextOfKinView, action: string): Promise<void> {
    if (action === 'edit') {
      this.edit(row);
      return;
    }
    const confirmed = await this.dialogs.confirm({
      title: 'Remove next of kin?',
      message: `${row.fullName} will be removed from this customer's next of kin.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    const partyId = this.store.party()!.partyId;
    try {
      await this.client.deleteNextOfKin(partyId, row.partyNextOfKinId);
      this.toast.success('Next of kin removed.');
      await Promise.all([this.load(partyId), this.store.reload()]);
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    }
  }

  protected error(name: string): string | null {
    const control = this.form.get(name);
    if (!control || control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return errorMessage(control, MESSAGES[name as keyof typeof MESSAGES]);
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const problems = formProblems(this.form, FIELDS, MESSAGES);
    this.problems.set(problems);
    if (problems.length > 0) {
      return;
    }
    const partyId = this.store.party()!.partyId;
    const value = this.form.getRawValue();
    const request = {
      fullName: value.fullName.trim(),
      relationship: value.relationship.trim() || null,
      mobileNumber: value.mobileNumber,
    };
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        const id = this.editingId();
        if (id) {
          await this.client.updateNextOfKin(partyId, id, request);
        } else {
          await this.client.addNextOfKin(partyId, request);
        }
        this.editingId.set(null);
        this.toast.success('Next of kin saved.');
        await Promise.all([this.load(partyId), this.store.reload()]);
      } catch (failure) {
        const problem = toApiProblem(failure);
        if (problem.status === 400 && problem.errors) {
          const rest = applyServerErrors(this.form, problem.errors);
          this.problems.set([...formProblems(this.form, FIELDS, MESSAGES), ...rest]);
        } else {
          this.message.set(messageFor(problem));
        }
      }
    });
  }

  protected readonly phone = (value: string) => displayPhone(value);

  private async load(partyId: number): Promise<void> {
    try {
      this.rows.set(await this.client.nextOfKin(partyId));
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    }
  }
}
