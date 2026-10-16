import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { BeneficialOwnerView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { CanDirective } from '../../core/permissions/can.directive';
import { FormProblem } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import {
  BannerComponent,
  ButtonComponent,
  EmptyStateComponent,
  ErrorSummaryComponent,
  ToastService,
} from '../../shared/ui';
import { CustomerPickerComponent } from './customer-picker.component';
import { CustomerRecordStore } from './customer-record.store';
import { CustomersClient } from './customers.client';
import type { PartyChoice } from './new-individual.dialog';

interface OwnerRow {
  ownerPartyId: number;
  partyNumber: string;
  displayName: string;
  /** As typed, so a half-typed number is not lost. */
  percentage: string;
}

/**
 * Beneficial owners of a business (UX 6.3 step 4, F6): individuals only, with a running total that may not pass
 * 100 percent. Saving replaces the whole list.
 */
@Component({
  selector: 'ib-customer-owners-tab',
  imports: [
    RouterLink,
    CanDirective,
    BannerComponent,
    ButtonComponent,
    CustomerPickerComponent,
    EmptyStateComponent,
    ErrorSummaryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    a {
      text-decoration: underline;
    }
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
      justify-content: space-between;
      align-items: center;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-3);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      text-align: left;
      padding: var(--ib-space-2) var(--ib-space-3);
      border-bottom: 1px solid var(--ib-line);
    }
    th {
      font-size: 13px;
      color: var(--ib-ink-muted);
    }
    .end {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    tfoot td {
      font-weight: 650;
      border-bottom: 0;
    }
    .over {
      color: var(--ib-danger-text);
    }
    input.percent {
      width: 7rem;
      text-align: right;
    }
    .bar {
      display: flex;
      justify-content: flex-end;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-4);
    }
    @media (max-width: 767.98px) {
      th:first-child,
      td:first-child {
        padding-left: 0;
      }
    }
  `,
  template: `
    @if (editing()) {
      <form (submit)="$event.preventDefault(); save()" novalidate aria-label="Edit beneficial owners">
        <ib-error-summary [problems]="problems()" />
        @if (message(); as text) {
          <ib-banner tone="danger" [message]="text" />
        }
        <section aria-labelledby="owners-edit-title">
          <h2 id="owners-edit-title">Beneficial owners</h2>
          <table>
            <caption class="ib-visually-hidden">
              Owners and their share
            </caption>
            <thead>
              <tr>
                <th scope="col">Owner</th>
                <th scope="col" class="end">Share (%)</th>
                <th scope="col"><span class="ib-visually-hidden">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.ownerPartyId; let index = $index) {
                <tr>
                  <td>
                    {{ row.displayName }} <span class="ib-num">({{ row.partyNumber }})</span>
                  </td>
                  <td class="end">
                    <input
                      class="ant-input ib-input percent"
                      type="text"
                      inputmode="decimal"
                      [attr.data-field]="'owner-' + row.ownerPartyId"
                      [attr.aria-label]="'Share for ' + row.displayName + ', percent'"
                      [attr.aria-invalid]="rowError(row) ? 'true' : null"
                      [value]="row.percentage"
                      (input)="setPercentage(index, $event)"
                    />
                  </td>
                  <td class="end">
                    <ib-button variant="quiet" (click)="remove(index)">
                      Remove<span class="ib-visually-hidden"> {{ row.displayName }}</span>
                    </ib-button>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td class="end" [class.over]="total() > 100" aria-live="polite">
                  {{ totalText() }}%
                  @if (total() > 100) {
                    <span> (more than 100)</span>
                  }
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </section>
        <section aria-labelledby="owners-add-title">
          <h2 id="owners-add-title">Add an owner</h2>
          <ib-customer-picker label="Find an individual" [excluded]="ownerIds()" (picked)="add($event)" />
        </section>
        <div class="bar">
          <ib-button (click)="cancel()">Cancel</ib-button>
          <ib-button variant="primary" type="submit" [loading]="guard.busy()">Save owners</ib-button>
        </div>
      </form>
    } @else {
      <section aria-labelledby="owners-title">
        <div class="head">
          <h2 id="owners-title">Beneficial owners</h2>
          <ib-button
            *ibCan="{ module: 'PTY', subModule: 'PARTY', action: 'edit' }"
            icon="edit"
            (click)="edit()"
            >Edit owners</ib-button
          >
        </div>
        @if (loadError(); as text) {
          <ib-banner tone="danger" [message]="text" />
        } @else if (owners().length === 0) {
          <ib-empty-state
            title="No beneficial owners yet"
            message="KYC for a business needs at least one beneficial owner."
            icon="team"
          />
        } @else {
          <table>
            <caption class="ib-visually-hidden">
              Beneficial owners
            </caption>
            <thead>
              <tr>
                <th scope="col">Owner</th>
                <th scope="col" class="end">Share</th>
              </tr>
            </thead>
            <tbody>
              @for (owner of owners(); track owner.ownerPartyId) {
                <tr>
                  <td>
                    <a [routerLink]="['/customers', owner.ownerPartyId]">{{ owner.displayName }}</a>
                    <span class="ib-num"> ({{ owner.partyNumber }})</span>
                  </td>
                  <td class="end">{{ owner.ownershipPercentage }}%</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </section>
    }
  `,
})
export class CustomerOwnersTab implements HasUnsavedChanges {
  private readonly store = inject(CustomerRecordStore);
  private readonly client = inject(CustomersClient);
  private readonly toast = inject(ToastService);

  protected readonly owners = signal<BeneficialOwnerView[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly editing = signal(false);
  protected readonly rows = signal<OwnerRow[]>([]);
  protected readonly problems = signal<FormProblem[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly guard = new SubmitGuard();
  private changed = false;

  protected readonly ownerIds = computed(() => this.rows().map((row) => row.ownerPartyId));
  protected readonly total = computed(() =>
    this.rows().reduce((sum, row) => sum + (parsePercent(row.percentage) ?? 0), 0),
  );
  protected readonly totalText = computed(() => String(Math.round(this.total() * 100) / 100));

  constructor() {
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.editing() && this.changed;
  }

  protected edit(): void {
    this.rows.set(
      this.owners().map((owner) => ({
        ownerPartyId: owner.ownerPartyId,
        partyNumber: owner.partyNumber,
        displayName: owner.displayName,
        percentage: String(owner.ownershipPercentage),
      })),
    );
    this.problems.set([]);
    this.message.set(null);
    this.changed = false;
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
  }

  protected add(choice: PartyChoice): void {
    this.changed = true;
    this.rows.update((rows) => [...rows, { ...choice, ownerPartyId: choice.partyId, percentage: '' }]);
    setTimeout(() =>
      document.querySelector<HTMLInputElement>(`[data-field="owner-${choice.partyId}"]`)?.focus(),
    );
  }

  protected remove(index: number): void {
    this.changed = true;
    this.rows.update((rows) => rows.filter((_, position) => position !== index));
  }

  protected setPercentage(index: number, event: Event): void {
    this.changed = true;
    const value = (event.target as HTMLInputElement).value;
    this.rows.update((rows) =>
      rows.map((row, position) => (position === index ? { ...row, percentage: value } : row)),
    );
  }

  protected rowError(row: OwnerRow): string | null {
    const value = parsePercent(row.percentage);
    return value === null || value <= 0 || value > 100
      ? `Enter a share for ${row.displayName} above 0 and up to 100, with at most two decimals.`
      : null;
  }

  protected async save(): Promise<void> {
    const problems: FormProblem[] = [];
    for (const row of this.rows()) {
      const message = this.rowError(row);
      if (message) {
        problems.push({ field: `owner-${row.ownerPartyId}`, message });
      }
    }
    if (this.total() > 100) {
      problems.push({ field: null, message: 'Ownership adds up to more than 100 percent.' });
    }
    this.problems.set(problems);
    if (problems.length > 0) {
      return;
    }
    const partyId = this.store.party()?.partyId;
    if (!partyId) {
      return;
    }
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        await this.client.replaceOwners(
          partyId,
          this.rows().map((row) => ({
            ownerPartyId: row.ownerPartyId,
            ownershipPercentage: parsePercent(row.percentage)!,
          })),
        );
        this.editing.set(false);
        this.toast.success('Beneficial owners saved.');
        await Promise.all([this.load(), this.store.reload()]);
      } catch (failure) {
        const problem = toApiProblem(failure);
        if (problem.status === 400 && problem.errors) {
          this.problems.set(
            Object.values(problem.errors)
              .flat()
              .map((text) => ({ field: null, message: text })),
          );
        } else {
          this.message.set(messageFor(problem));
        }
      }
    });
  }

  private async load(): Promise<void> {
    const partyId = this.store.party()?.partyId;
    if (!partyId) {
      return;
    }
    try {
      this.owners.set(await this.client.owners(partyId));
      this.loadError.set(null);
    } catch (failure) {
      this.loadError.set(messageFor(toApiProblem(failure)));
    }
  }
}

/** "12.5" or "12,5" → 12.5; null when it is not a number with at most two decimals. */
export function parsePercent(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}
