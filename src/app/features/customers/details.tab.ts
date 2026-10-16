import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import type { LookupRow } from '../../core/api/api-types';
import { ConfigService } from '../../core/config/config.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate } from '../../core/formats/dates';
import { displayPhone } from '../../core/formats/phone';
import { LookupsService } from '../../core/lookups/lookups.service';
import { CanDirective } from '../../core/permissions/can.directive';
import { FormProblem, applyServerErrors, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  ErrorSummaryComponent,
  MaskedValueComponent,
  ToastService,
} from '../../shared/ui';
import { CustomerRecordStore } from './customer-record.store';
import { CustomersClient } from './customers.client';
import { IndividualFieldsComponent } from './individual-fields.component';
import {
  FIELD_MESSAGES,
  STEPS,
  STEP_FIELDS,
  changesControlledField,
  createIndividualForm,
  fromParty,
  stepOf,
  toRequest,
} from './individual-form';

const SECTION_TITLES = { identity: 'Identity', contact: 'Contact', funds: 'Source of funds' } as const;

/** Details tab, read only (frontend plan 7.5, F5-05). ID number and mobile are masked until shown. */
@Component({
  selector: 'ib-customer-details-tab',
  imports: [
    ReactiveFormsModule,
    CanDirective,
    BannerComponent,
    ButtonComponent,
    ErrorSummaryComponent,
    IndividualFieldsComponent,
    MaskedValueComponent,
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
    dl {
      display: grid;
      grid-template-columns: minmax(10rem, 1fr) 2fr;
      gap: var(--ib-space-2) var(--ib-space-4);
      margin: 0;
    }
    @media (max-width: 767.98px) {
      dl {
        grid-template-columns: 1fr;
        gap: 0;
      }
      dd {
        margin-bottom: var(--ib-space-3);
      }
    }
    dt {
      color: var(--ib-ink-muted);
      font-weight: 550;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: var(--ib-space-3);
    }
    .bar {
      position: sticky;
      bottom: 0;
      z-index: 5;
      display: flex;
      justify-content: flex-end;
      gap: var(--ib-space-2);
      padding: var(--ib-space-3) 0;
      background: var(--ib-page);
      border-top: 1px solid var(--ib-line);
    }
  `,
  template: `
    @if (editing()) {
      <form [formGroup]="form" (ngSubmit)="save()" novalidate aria-label="Edit customer details">
        @if (message(); as text) {
          <ib-banner tone="danger" [message]="text" />
        }
        <ib-error-summary [problems]="problems()" />
        @for (section of sections; track section) {
          <section [attr.aria-labelledby]="'edit-' + section">
            <h2 [id]="'edit-' + section">{{ titles[section] }}</h2>
            <ib-individual-fields
              [section]="section"
              [group]="form.controls[section]"
              [submitted]="submitted()"
            />
          </section>
        }
        <div class="bar">
          <ib-button (click)="cancel()">Cancel</ib-button>
          <ib-button variant="primary" type="submit" [loading]="guard.busy()">Save changes</ib-button>
        </div>
      </form>
    } @else if (store.party(); as party) {
      @if (party.individual) {
        <div class="toolbar">
          <ib-button
            *ibCan="{ module: 'PTY', subModule: 'PARTY', action: 'edit' }"
            icon="edit"
            (click)="edit()"
            >Edit details</ib-button
          >
        </div>
      }
      @if (party.individual; as person) {
        <section aria-labelledby="identity-title">
          <h2 id="identity-title">Identity</h2>
          <dl>
            <dt>Title</dt>
            <dd>{{ person.title || '—' }}</dd>
            <dt>First name</dt>
            <dd>{{ person.firstName }}</dd>
            <dt>Last name</dt>
            <dd>{{ person.lastName }}</dd>
            <dt>Gender</dt>
            <dd>{{ name(genders(), person.genderId) }}</dd>
            <dt>Date of birth</dt>
            <dd class="ib-num">{{ date(person.dateOfBirth) }}</dd>
            <dt>Nationality</dt>
            <dd>{{ person.nationality || '—' }}</dd>
            <dt>ID type</dt>
            <dd>{{ name(idTypes(), person.identificationTypeId) }}</dd>
            <dt>ID number</dt>
            <dd><ib-masked-value label="ID number" [value]="person.identificationNumber" /></dd>
          </dl>
        </section>
      }

      <section aria-labelledby="contact-title">
        <h2 id="contact-title">Contact</h2>
        <dl>
          <dt>Mobile</dt>
          <dd><ib-masked-value label="Mobile" [value]="party.mobile" [format]="phone" /></dd>
          <dt>Phone</dt>
          <dd class="ib-num">{{ phone(party.phone ?? '') || '—' }}</dd>
          <dt>Email</dt>
          <dd>{{ party.emailAddress || '—' }}</dd>
          <dt>Address line 1</dt>
          <dd>{{ party.address1 || '—' }}</dd>
          <dt>Address line 2</dt>
          <dd>{{ party.address2 || '—' }}</dd>
        </dl>
      </section>

      <section aria-labelledby="funds-title">
        <h2 id="funds-title">Source of funds</h2>
        <dl>
          <dt>Source of funds</dt>
          <dd>{{ party.sourceOfFunds || '—' }}</dd>
          <dt>Occupation or sector</dt>
          <dd>{{ party.occupationOrSector || '—' }}</dd>
          <dt>Politically exposed person</dt>
          <dd>{{ party.isPoliticallyExposed ? 'Yes' : 'No' }}</dd>
        </dl>
      </section>
    }
  `,
})
export class CustomerDetailsTab implements HasUnsavedChanges {
  protected readonly store = inject(CustomerRecordStore);
  private readonly lookups = inject(LookupsService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly form = createIndividualForm(inject(ConfigService).config.minimumCustomerAgeYears ?? 18);
  protected readonly sections = STEPS;
  protected readonly titles = SECTION_TITLES;
  protected readonly editing = signal(false);
  protected readonly submitted = signal(false);
  protected readonly problems = signal<FormProblem[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly guard = new SubmitGuard();
  private readonly approved = computed(() => {
    const party = this.store.party();
    return (
      party !== null && (party.supervisionState !== 'PENDING' || party.effectiveKycStatusCode === 'VERIFIED')
    );
  });

  hasUnsavedChanges(): boolean {
    return this.editing() && this.form.dirty;
  }

  protected edit(): void {
    const party = this.store.party();
    if (!party) {
      return;
    }
    fromParty(this.form, party);
    this.submitted.set(false);
    this.problems.set([]);
    this.message.set(null);
    this.editing.set(true);
  }

  /** Cancelling changes nothing (F5-05). */
  protected cancel(): void {
    this.editing.set(false);
    this.form.reset();
  }

  protected async save(): Promise<void> {
    const party = this.store.party();
    if (!party) {
      return;
    }
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const problems = STEPS.flatMap((step) =>
      formProblems(this.form.controls[step], STEP_FIELDS[step], FIELD_MESSAGES),
    );
    this.problems.set(problems);
    if (problems.length > 0) {
      return;
    }

    // UX 5.2: a protected field on an approved customer needs confirmation first.
    if (this.approved() && changesControlledField(this.form, party)) {
      const confirmed = await this.dialogs.confirm({
        title: 'Send back for approval?',
        message: 'Changing this will send the customer back for approval and reset KYC to pending.',
        confirmLabel: 'Save changes',
        cancelLabel: 'Go back',
      });
      if (!confirmed) {
        return;
      }
    }

    await this.guard.run(async () => {
      this.message.set(null);
      try {
        await this.client.updateIndividual(party.partyId, toRequest(this.form));
        this.form.markAsPristine();
        this.editing.set(false);
        this.toast.success('Changes saved.');
        await this.store.reload();
      } catch (failure) {
        const problem = toApiProblem(failure);
        if (problem.status === 400 && problem.errors) {
          const unmatched: FormProblem[] = [];
          for (const [field, messages] of Object.entries(problem.errors)) {
            const step = stepOf(field);
            if (step) {
              applyServerErrors(this.form.controls[step], { [field]: messages });
            } else if (messages[0]) {
              unmatched.push({ field: null, message: messages[0] });
            }
          }
          this.problems.set([
            ...STEPS.flatMap((step) =>
              formProblems(this.form.controls[step], STEP_FIELDS[step], FIELD_MESSAGES),
            ),
            ...unmatched,
          ]);
        } else {
          this.message.set(messageFor(problem));
        }
      }
    });
  }

  private readonly client = inject(CustomersClient);

  protected readonly genders = signal<LookupRow[]>([]);
  protected readonly idTypes = signal<LookupRow[]>([]);

  constructor() {
    this.lookups.list('genders').then(
      (rows) => this.genders.set(rows),
      () => undefined,
    );
    this.lookups.list('identification-document-types').then(
      (rows) => this.idTypes.set(rows),
      () => undefined,
    );
  }

  protected name(rows: readonly LookupRow[], id: number | null | undefined): string {
    return rows.find((row) => row.id === id)?.name ?? '—';
  }

  protected readonly date = formatDate;
  protected readonly phone = (value: string) => displayPhone(value);
}
