import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { RegulatoryAttributeView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatTimestamp } from '../../core/formats/dates';
import { CanDirective } from '../../core/permissions/can.directive';
import { FormProblem, applyServerErrors, errorMessage, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import {
  BannerComponent,
  ButtonComponent,
  EmptyStateComponent,
  ErrorSummaryComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  ToastService,
} from '../../shared/ui';
import { CustomerRecordStore } from './customer-record.store';
import { CustomersClient } from './customers.client';

const FIELDS = ['attributeCode', 'attributeValue'];
const MESSAGES = {
  attributeCode: {
    required: 'Enter the attribute code.',
    pattern: 'Use upper case letters, digits and underscores, starting with a letter.',
  },
};

/**
 * Regulatory attributes (UX 7.3, F7): current values, and a history per attribute. Values are append-only: a new
 * value is a new version, never an overwrite.
 */
@Component({
  selector: 'ib-customer-regulatory-tab',
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
      grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
      gap: 0 var(--ib-space-4);
    }
    @media (max-width: 767.98px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      text-align: left;
      padding: var(--ib-space-2) var(--ib-space-3) var(--ib-space-2) 0;
      border-bottom: 1px solid var(--ib-line);
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th {
      font-size: 13px;
      color: var(--ib-ink-muted);
    }
    code {
      font-size: 13px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--ib-space-2);
    }
    .history {
      margin-top: var(--ib-space-3);
      padding: var(--ib-space-3);
      background: var(--ib-surface-subtle);
      border-radius: var(--ib-radius-sm);
    }
    .history h3 {
      font-size: 15px;
      margin: 0 0 var(--ib-space-2);
    }
  `,
  template: `
    @if (message(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }
    @if (editing()) {
      <section aria-labelledby="attribute-form-title">
        <h2 id="attribute-form-title">Record a value</h2>
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          <ib-error-summary [problems]="problems()" />
          <div class="grid">
            <ib-form-field
              label="Attribute code"
              [required]="true"
              hint="For example RISK_RATING"
              [error]="error('attributeCode')"
            >
              <input
                ibInput
                ibControl
                formControlName="attributeCode"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                maxlength="50"
              />
            </ib-form-field>
            <ib-form-field
              label="Value"
              hint="Leave empty to clear the value"
              [error]="error('attributeValue')"
            >
              <input ibInput ibControl formControlName="attributeValue" autocomplete="off" maxlength="500" />
            </ib-form-field>
          </div>
          <div class="actions">
            <ib-button (click)="editing.set(false)">Cancel</ib-button>
            <ib-button variant="primary" type="submit" [loading]="guard.busy()">Save value</ib-button>
          </div>
        </form>
      </section>
    }

    <section aria-labelledby="attributes-title">
      <div class="head">
        <h2 id="attributes-title">Regulatory attributes</h2>
        @if (!editing()) {
          <ib-button
            *ibCan="{ module: 'PTY', subModule: 'PARTY', action: 'edit' }"
            icon="plus"
            (click)="edit(null)"
            >Record a value</ib-button
          >
        }
      </div>
      @if (rows().length === 0) {
        <ib-empty-state title="No regulatory attributes yet" icon="solution" />
      } @else {
        <table>
          <caption class="ib-visually-hidden">
            Current values
          </caption>
          <thead>
            <tr>
              <th scope="col">Attribute</th>
              <th scope="col">Value</th>
              <th scope="col">Recorded</th>
              <th scope="col"><span class="ib-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.attributeCode) {
              <tr>
                <td>
                  <code>{{ row.attributeCode }}</code>
                </td>
                <td>{{ row.attributeValue ?? 'Cleared' }}</td>
                <td class="ib-num">{{ timestamp(row.recordedOn) }}</td>
                <td>
                  <ib-button variant="quiet" (click)="toggleHistory(row.attributeCode)">
                    {{ historyCode() === row.attributeCode ? 'Hide history' : 'History'
                    }}<span class="ib-visually-hidden"> of {{ row.attributeCode }}</span>
                  </ib-button>
                  <ib-button
                    *ibCan="{ module: 'PTY', subModule: 'PARTY', action: 'edit' }"
                    variant="quiet"
                    (click)="edit(row)"
                    >Change<span class="ib-visually-hidden"> {{ row.attributeCode }}</span></ib-button
                  >
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (historyCode(); as code) {
          <div class="history" aria-live="polite">
            <h3>
              History of <code>{{ code }}</code>
            </h3>
            <table>
              <caption class="ib-visually-hidden">
                Every value recorded, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Value</th>
                  <th scope="col">Recorded</th>
                </tr>
              </thead>
              <tbody>
                @for (version of history(); track $index) {
                  <tr>
                    <td>{{ version.attributeValue ?? 'Cleared' }}</td>
                    <td class="ib-num">{{ timestamp(version.recordedOn) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </section>
  `,
})
export class CustomerRegulatoryTab implements HasUnsavedChanges {
  private readonly store = inject(CustomerRecordStore);
  private readonly client = inject(CustomersClient);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<RegulatoryAttributeView[]>([]);
  protected readonly history = signal<RegulatoryAttributeView[]>([]);
  protected readonly historyCode = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly problems = signal<FormProblem[]>([]);
  protected readonly editing = signal(false);
  protected readonly guard = new SubmitGuard();
  private readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    attributeCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50), Validators.pattern(/^[A-Z][A-Z0-9_]*$/)],
    }),
    attributeValue: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
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
    return this.editing() && this.form.dirty;
  }

  protected edit(row: RegulatoryAttributeView | null): void {
    this.form.reset({ attributeCode: row?.attributeCode ?? '', attributeValue: row?.attributeValue ?? '' });
    if (row) {
      this.form.controls.attributeCode.disable();
    } else {
      this.form.controls.attributeCode.enable();
    }
    this.submitted.set(false);
    this.problems.set([]);
    this.editing.set(true);
  }

  protected async toggleHistory(code: string): Promise<void> {
    if (this.historyCode() === code) {
      this.historyCode.set(null);
      return;
    }
    try {
      this.history.set(await this.client.attributeHistory(this.store.party()!.partyId, code));
      this.historyCode.set(code);
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
    this.form.controls.attributeCode.setValue(this.form.controls.attributeCode.value.trim().toUpperCase());
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const problems = formProblems(this.form, FIELDS, MESSAGES);
    this.problems.set(problems);
    if (problems.length > 0) {
      return;
    }
    const partyId = this.store.party()!.partyId;
    const { attributeCode, attributeValue } = this.form.getRawValue();
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        await this.client.setAttribute(partyId, attributeCode, attributeValue.trim() || null);
        this.editing.set(false);
        this.toast.success('Value recorded.');
        this.historyCode.set(null);
        await this.load(partyId);
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

  protected readonly timestamp = formatTimestamp;

  private async load(partyId: number): Promise<void> {
    try {
      this.rows.set(await this.client.attributes(partyId));
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    }
  }
}
