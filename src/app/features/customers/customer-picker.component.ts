import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import type { PartySearchRow } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { searchTerm } from '../../core/formats/phone';
import { CanDirective } from '../../core/permissions/can.directive';
import {
  ButtonComponent,
  DialogService,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  StatusChipComponent,
} from '../../shared/ui';
import { approvalCode } from './customer-labels';
import { CustomersClient } from './customers.client';
import type { PartyChoice } from './new-individual.dialog';

/**
 * Picks an individual customer (UX 6.3 step 4, 6.4 steps 2 and 3): search, then Choose. People already chosen are
 * shown disabled with the reason. "Add new individual" creates one inline when the person is not a customer yet.
 */
@Component({
  selector: 'ib-customer-picker',
  imports: [
    CanDirective,
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
    .reason {
      color: var(--ib-ink-muted);
    }
    .status {
      color: var(--ib-ink-muted);
      margin: 0 0 var(--ib-space-3);
    }
    .new {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ib-space-2);
    }
  `,
  template: `
    <ib-form-field [label]="label()" hint="Name, customer number, mobile or ID number">
      <input ibInput ibControl type="search" autocomplete="off" spellcheck="false" (input)="typed($event)" />
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
                <ib-status-chip domain="kyc" [code]="row.effectiveKycStatusCode" />
                <ib-status-chip domain="approval" [code]="approval(row.supervisionState)" />
              </span>
            </div>
            @if (excluded().includes(row.partyId)) {
              <span class="reason">Already added</span>
            } @else {
              <ib-button (click)="choose(row)"
                >Choose<span class="ib-visually-hidden"> {{ row.displayName }}</span></ib-button
              >
            }
          </li>
        }
      </ul>
    }
    <div class="new" *ibCan="{ module: 'PTY', subModule: 'PARTY', action: 'add' }">
      <span>Not a customer yet?</span>
      <ib-button icon="plus" (click)="addNew()">Add new individual</ib-button>
    </div>
  `,
})
export class CustomerPickerComponent {
  readonly label = input.required<string>();
  readonly excluded = input<readonly number[]>([]);
  readonly picked = output<PartyChoice>();

  private readonly client = inject(CustomersClient);
  private readonly dialogs = inject(DialogService);
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

  protected choose(row: PartySearchRow): void {
    this.picked.emit({ partyId: row.partyId, partyNumber: row.partyNumber, displayName: row.displayName });
  }

  protected async addNew(): Promise<void> {
    const { NewIndividualDialogComponent } = await import('./new-individual.dialog');
    const ref = await this.dialogs.open<InstanceType<typeof NewIndividualDialogComponent>, null, PartyChoice>(
      NewIndividualDialogComponent,
      null,
      { title: 'New individual customer', width: 760 },
    );
    ref.afterClose.subscribe((choice) => {
      if (choice) {
        this.picked.emit(choice);
      }
    });
  }

  private async search(text: string): Promise<void> {
    const id = ++this.request;
    try {
      const page = await this.client.search({ q: searchTerm(text), partyType: 'INDIVIDUAL', pageSize: 8 });
      if (id === this.request) {
        this.rows.set(page.items);
        const count = page.totalCount;
        this.status.set(count === 0 ? 'No individual customers match.' : `${count} found.`);
      }
    } catch (failure) {
      if (id === this.request) {
        this.rows.set([]);
        this.status.set(messageFor(toApiProblem(failure)));
      }
    }
  }

  protected readonly approval = approvalCode;
}
