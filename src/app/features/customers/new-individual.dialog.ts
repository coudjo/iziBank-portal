import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { NzModalRef } from 'ng-zorro-antd/modal';
import { ConfigService } from '../../core/config/config.service';
import { isNetworkProblem, toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { FormProblem, applyServerErrors, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import { BannerComponent, ButtonComponent, ErrorSummaryComponent } from '../../shared/ui';
import { CustomersClient } from './customers.client';
import {
  FIELD_MESSAGES,
  STEPS,
  STEP_FIELDS,
  createIndividualForm,
  stepOf,
  toRequest,
} from './individual-form';
import { IndividualFieldsComponent } from './individual-fields.component';

export interface PartyChoice {
  partyId: number;
  partyNumber: string;
  displayName: string;
}

const TITLES = { identity: 'Identity', contact: 'Contact', funds: 'Source of funds' } as const;

/**
 * "Add new individual" from a customer picker (UX 6.3 step 4, 6.4 step 2; F6): the same individual form in a dialog.
 * Closes with the new customer, or with an existing one when the ID already belongs to someone.
 */
@Component({
  selector: 'ib-new-individual-dialog',
  imports: [
    ReactiveFormsModule,
    BannerComponent,
    ButtonComponent,
    ErrorSummaryComponent,
    IndividualFieldsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    h3 {
      font-size: 15px;
      margin: var(--ib-space-4) 0 var(--ib-space-3);
    }
    .actions {
      position: sticky;
      bottom: 0;
      display: flex;
      justify-content: flex-end;
      gap: var(--ib-space-2);
      padding-top: var(--ib-space-3);
      background: var(--ib-surface);
    }
    .duplicate {
      margin-bottom: var(--ib-space-4);
    }
  `,
  template: `
    <form [formGroup]="form" (ngSubmit)="create()" novalidate>
      @if (message(); as text) {
        <ib-banner tone="danger" [message]="text" />
      }
      @if (existing(); as other) {
        <div class="duplicate">
          <ib-banner tone="warning" [message]="duplicateMessage()" />
          <ib-button (click)="ref.close(other)">Use {{ other.displayName }}</ib-button>
        </div>
      }
      <ib-error-summary [problems]="problems()" />
      @for (section of sections; track section) {
        <h3>{{ titles[section] }}</h3>
        <ib-individual-fields
          [section]="section"
          [group]="form.controls[section]"
          [submitted]="submitted()"
        />
      }
      <div class="actions">
        <ib-button (click)="ref.close()">Cancel</ib-button>
        <ib-button variant="primary" type="submit" [loading]="guard.busy()">Create customer</ib-button>
      </div>
    </form>
  `,
})
export class NewIndividualDialogComponent {
  protected readonly ref = inject<NzModalRef<NewIndividualDialogComponent, PartyChoice>>(NzModalRef);
  private readonly client = inject(CustomersClient);

  protected readonly form = createIndividualForm(inject(ConfigService).config.minimumCustomerAgeYears ?? 18);
  protected readonly sections = STEPS;
  protected readonly titles = TITLES;
  protected readonly submitted = signal(false);
  protected readonly problems = signal<FormProblem[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly existing = signal<PartyChoice | null>(null);
  protected readonly duplicateMessage = signal('');
  protected readonly guard = new SubmitGuard();

  protected async create(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const problems = STEPS.flatMap((step) =>
      formProblems(this.form.controls[step], STEP_FIELDS[step], FIELD_MESSAGES),
    );
    this.problems.set(problems);
    if (problems.length > 0) {
      return;
    }
    await this.guard.run(async () => {
      this.message.set(null);
      this.existing.set(null);
      const request = toRequest(this.form);
      try {
        const created = await this.client.createIndividual(request);
        this.ref.close({
          partyId: created.partyId,
          partyNumber: created.partyNumber,
          displayName: `${request.firstName} ${request.lastName}`,
        });
      } catch (failure) {
        const problem = toApiProblem(failure);
        if (problem.type === 'party.duplicate-identification') {
          const number = String(problem.extensions['existingPartyNumber'] ?? '');
          const page = await this.client.search({ q: number, pageSize: 5 }).catch(() => null);
          const row = page?.items.find((item) => item.partyNumber === number);
          this.duplicateMessage.set(messageFor(problem, undefined, row ? { name: row.displayName } : {}));
          this.existing.set(
            row ? { partyId: row.partyId, partyNumber: row.partyNumber, displayName: row.displayName } : null,
          );
          if (!row) {
            this.message.set(this.duplicateMessage());
          }
        } else if (problem.status === 400 && problem.errors) {
          const unmatched: FormProblem[] = [];
          for (const [field, messages] of Object.entries(problem.errors)) {
            const step = stepOf(field);
            unmatched.push(
              ...(step
                ? applyServerErrors(this.form.controls[step], { [field]: messages })
                : messages.map((text) => ({ field: null, message: text }))),
            );
          }
          this.problems.set([
            ...STEPS.flatMap((step) =>
              formProblems(this.form.controls[step], STEP_FIELDS[step], FIELD_MESSAGES),
            ),
            ...unmatched,
          ]);
        } else if (isNetworkProblem(problem)) {
          this.message.set(
            'We could not confirm this was saved. Search for the customer before trying again.',
          );
        } else {
          this.message.set(messageFor(problem));
        }
      }
    });
  }
}
