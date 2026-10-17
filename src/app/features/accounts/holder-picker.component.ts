import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PartySearchRow } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { searchTerm } from '../../core/formats/phone';
import {
  ButtonComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  StatusChipComponent,
} from '../../shared/ui';
import { CustomersClient, approvalCode, partyTypeLabel } from '../customers';

export type HolderRole = 'PRIMARY' | 'JOINT' | 'SIGNATORY' | 'BENEFICIAL_OWNER';

export interface HolderChoice {
  partyId: number;
  partyNumber: string;
  displayName: string;
  partyTypeCode: string;
  role: HolderRole;
}

/**
 * Why this customer cannot take this role, or null (UX 6.7 step 3). Holders must be approved and KYC verified;
 * everyone who signs needs an approved specimen signature (addendum rule 3a). Businesses and groups do not sign.
 */
export function ineligibility(row: PartySearchRow, role: HolderRole): string | null {
  if (row.supervisionState === 'PENDING') {
    return 'Awaiting approval';
  }
  if (row.effectiveKycStatusCode === 'REJECTED') {
    return 'KYC rejected';
  }
  if (row.effectiveKycStatusCode !== 'VERIFIED') {
    return row.effectiveKycStatusCode === 'EXPIRED' ? 'KYC expired' : 'Not KYC verified';
  }
  const signs =
    role === 'JOINT' || role === 'SIGNATORY' || (role === 'PRIMARY' && row.partyTypeCode === 'INDIVIDUAL');
  if ((role === 'JOINT' || role === 'SIGNATORY') && row.partyTypeCode !== 'INDIVIDUAL') {
    return 'Only individuals can sign';
  }
  if (signs && !row.hasEffectiveSignature) {
    return 'Capture specimen signature first';
  }
  return null;
}

/** Finds a customer for one holder role, showing who is eligible and why others are not (UX 6.7 step 3). */
@Component({
  selector: 'ib-holder-picker',
  imports: [
    RouterLink,
    ButtonComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    ul {
      list-style: none;
      margin: 0 0 var(--ib-space-3);
      padding: 0;
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      padding: var(--ib-space-2) var(--ib-space-3);
      border-top: 1px solid var(--ib-line);
    }
    li:first-child {
      border-top: 0;
    }
    .who {
      display: flex;
      flex-direction: column;
      gap: var(--ib-space-1);
    }
    .name {
      font-weight: 600;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-1);
      align-items: center;
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    .why {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ib-space-2);
      color: var(--ib-ink-muted);
    }
    .why a {
      text-decoration: underline;
    }
    .status {
      color: var(--ib-ink-muted);
      margin: 0 0 var(--ib-space-3);
    }
  `,
  template: `
    <ib-form-field [label]="label()" hint="Name, customer number, mobile or ID number">
      <input
        ibInput
        ibControl
        type="search"
        autocomplete="off"
        spellcheck="false"
        data-autofocus
        (input)="typed($event)"
      />
    </ib-form-field>
    <p class="status" aria-live="polite">{{ status() }}</p>
    @if (rows().length > 0) {
      <ul [attr.aria-label]="label() + ' results'">
        @for (row of rows(); track row.partyId) {
          <li>
            <div class="who">
              <span class="name">{{ row.displayName }}</span>
              <span class="chips">
                <span class="ib-num">{{ row.partyNumber }}</span>
                <span>{{ type(row.partyTypeCode) }}</span>
                <ib-status-chip domain="kyc" [code]="row.effectiveKycStatusCode" />
                <ib-status-chip domain="approval" [code]="approval(row.supervisionState)" />
              </span>
            </div>
            @if (excluded().includes(row.partyId)) {
              <span class="why">Already added</span>
            } @else if (why(row); as reason) {
              <span class="why">
                <span>{{ reason }}</span>
                <a [routerLink]="['/customers', row.partyId]"
                  >Open customer<span class="ib-visually-hidden"> {{ row.displayName }}</span></a
                >
              </span>
            } @else {
              <ib-button (click)="choose(row)"
                >Choose<span class="ib-visually-hidden"> {{ row.displayName }}</span></ib-button
              >
            }
          </li>
        }
      </ul>
    }
  `,
})
export class HolderPickerComponent {
  readonly label = input.required<string>();
  readonly holderRole = input.required<HolderRole>();
  readonly excluded = input<readonly number[]>([]);
  readonly picked = output<HolderChoice>();

  private readonly client = inject(CustomersClient);
  protected readonly rows = signal<PartySearchRow[]>([]);
  protected readonly status = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  protected typed(event: Event): void {
    const text = (event.target as HTMLInputElement).value.trim();
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (text.length < 2) {
      this.request++;
      this.rows.set([]);
      this.status.set('');
      return;
    }
    this.status.set('Searching…');
    this.timer = setTimeout(() => void this.search(text), 250);
  }

  protected why(row: PartySearchRow): string | null {
    return ineligibility(row, this.holderRole());
  }

  protected choose(row: PartySearchRow): void {
    this.picked.emit({
      partyId: row.partyId,
      partyNumber: row.partyNumber,
      displayName: row.displayName,
      partyTypeCode: row.partyTypeCode,
      role: this.holderRole(),
    });
  }

  private async search(text: string): Promise<void> {
    const id = ++this.request;
    const individualsOnly = this.holderRole() === 'JOINT' || this.holderRole() === 'SIGNATORY';
    try {
      const page = await this.client.search({
        q: searchTerm(text),
        partyType: individualsOnly ? 'INDIVIDUAL' : null,
        pageSize: 8,
      });
      if (id === this.request) {
        this.rows.set(page.items);
        this.status.set(page.totalCount === 0 ? 'No customers match.' : `${page.totalCount} found.`);
      }
    } catch (failure) {
      if (id === this.request) {
        this.rows.set([]);
        this.status.set(messageFor(toApiProblem(failure)));
      }
    }
  }

  protected readonly type = partyTypeLabel;
  protected readonly approval = approvalCode;
}
