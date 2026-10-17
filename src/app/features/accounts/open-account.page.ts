import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { AccountOpened, LookupRow, PartySearchRow, ProductView } from '../../core/api/api-types';
import { WorkingDateService } from '../../core/branch/working-date.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatMoney } from '../../core/formats/money';
import { ViewportService } from '../../core/layout/viewport.service';
import { LookupsService } from '../../core/lookups/lookups.service';
import { newIdempotencyKey } from '../../shared/capture/image-compress';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import type { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import {
  BannerComponent,
  ButtonComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  PageHeaderComponent,
} from '../../shared/ui';
import { CustomersClient, partyTypeLabel } from '../customers';
import { HOLDER_ROLE_LABELS, OPENED_STATE, PRIMARY_STATE, label } from './account-labels';
import { AccountsClient } from './accounts.client';
import { HolderChoice, HolderPickerComponent, HolderRole, ineligibility } from './holder-picker.component';
import { SigningMode, shapeOf } from './open-account-rules';

const PRODUCT_TYPES: Readonly<Record<string, string>> = { SAVINGS: 'Savings', CURRENT: 'Current' };

/**
 * Open an account (UX 6.7, F9): one page in three sections (product, holders, review), not a wizard. The page is
 * disabled while the business day is closed. On a phone it first suggests a larger screen, with "Continue anyway".
 */
@Component({
  selector: 'ib-open-account-page',
  imports: [
    RouterLink,
    BannerComponent,
    ButtonComponent,
    FormControlDirective,
    FormFieldComponent,
    HolderPickerComponent,
    InputDirective,
    PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .sections {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--ib-space-4);
      align-items: start;
    }
    @media (max-width: 1279.98px) {
      .sections {
        grid-template-columns: 1fr;
      }
    }
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
    }
    h2 {
      margin-bottom: var(--ib-space-3);
    }
    .facts {
      margin: 0 0 var(--ib-space-2);
      color: var(--ib-ink-muted);
    }
    ul.holders {
      list-style: none;
      margin: 0 0 var(--ib-space-3);
      padding: 0;
    }
    ul.holders li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      padding: var(--ib-space-2) 0;
      border-top: 1px solid var(--ib-line);
    }
    ul.holders li:first-child {
      border-top: 0;
    }
    .name {
      font-weight: 600;
    }
    .role {
      display: block;
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    .add {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-3);
    }
    .picker {
      border-top: 1px solid var(--ib-line);
      padding-top: var(--ib-space-3);
    }
    fieldset {
      border: 0;
      margin: 0 0 var(--ib-space-4);
      padding: 0;
    }
    legend {
      font-weight: 550;
      margin-bottom: var(--ib-space-2);
    }
    label.choice {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
      min-height: var(--ib-touch-target);
    }
    .problems {
      margin: 0 0 var(--ib-space-3);
      padding-left: var(--ib-space-5);
      color: var(--ib-warning-text);
    }
    .done {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
    }
    .number {
      font-size: 22px;
      font-weight: 700;
      margin: var(--ib-space-2) 0 var(--ib-space-4);
    }
    .done a {
      display: inline-flex;
      align-items: center;
      font-weight: 550;
    }
    .member {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      padding: var(--ib-space-2) 0;
      border-top: 1px solid var(--ib-line);
    }
    .why {
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    <ib-page-header title="Open account" />

    @if (opened(); as result) {
      <section aria-labelledby="opened-title">
        <h2 id="opened-title">Account opened</h2>
        <ib-banner
          tone="success"
          message="Awaiting approval. The account cannot be used until a supervisor approves it."
        />
        <p class="number ib-num" data-testid="opened-number">{{ result.accountNumber }}</p>
        <p>{{ result.accountName }}</p>
        <div class="done">
          <a
            class="ant-btn ant-btn-primary"
            [routerLink]="['/accounts', result.accountId]"
            [state]="openedState"
            >Done</a
          >
          <ib-button (click)="startAgain()">Open another account</ib-button>
        </div>
      </section>
    } @else if (!workingDate.isOpen()) {
      <ib-banner
        tone="warning"
        message="The business day is not open for this branch."
        description="Accounts open on the working date. Ask a supervisor to open the business day, then try again."
      />
    } @else if (phoneNotice()) {
      <ib-banner
        tone="info"
        message="Opening an account with several holders is easier on a tablet or computer."
      />
      <ib-button (click)="continued.set(true)">Continue anyway</ib-button>
    } @else {
      @if (failure(); as text) {
        <ib-banner tone="danger" [message]="text" />
      }
      <div class="sections">
        <section aria-labelledby="product-title">
          <h2 id="product-title">1 Product</h2>
          <ib-form-field
            label="Product"
            [required]="true"
            hint="Savings and current products you can open here"
          >
            <select ibInput ibControl (change)="pickProduct($event)">
              <option value="" [selected]="productId() === null">Choose a product</option>
              @for (option of products(); track option.productId) {
                <option [value]="option.productId" [selected]="option.productId === productId()">
                  {{ option.productName }} ({{ option.productCode }})
                </option>
              }
            </select>
          </ib-form-field>
          @if (product(); as chosen) {
            <p class="facts">
              {{ productType(chosen.productTypeCode) }} · {{ chosen.currencyCode }}
              @if (chosen.minimumBalance !== null) {
                · Minimum balance {{ money(chosen.minimumBalance, chosen.currencyCode) }}
              }
            </p>
          }
        </section>

        <section aria-labelledby="holders-title">
          <h2 id="holders-title">2 Holders</h2>
          @if (holders().length > 0) {
            <ul class="holders" aria-label="Holders added">
              @for (holder of holders(); track holder.partyId) {
                <li>
                  <span>
                    <span class="name">{{ holder.displayName }}</span>
                    <span class="role"
                      >{{ roleLabel(holder.role) }} · {{ type(holder.partyTypeCode) }} ·
                      <span class="ib-num">{{ holder.partyNumber }}</span></span
                    >
                  </span>
                  <ib-button variant="quiet" icon="close" (click)="remove(holder)"
                    >Remove<span class="ib-visually-hidden"> {{ holder.displayName }}</span></ib-button
                  >
                </li>
              }
            </ul>
          }

          @if (!primary()) {
            <ib-holder-picker label="Primary holder" holderRole="PRIMARY" (picked)="add($event)" />
          } @else {
            <div class="add">
              @if (primary()!.partyTypeCode === 'INDIVIDUAL') {
                <ib-button icon="plus" (click)="adding.set('JOINT')">Add joint holder</ib-button>
              }
              @if (primary()!.partyTypeCode !== 'GROUP') {
                <ib-button icon="plus" (click)="adding.set('SIGNATORY')">Add signatory</ib-button>
              }
              <ib-button icon="plus" (click)="adding.set('BENEFICIAL_OWNER')"
                >Add beneficial owner (info)</ib-button
              >
            </div>
            @if (primary()!.partyTypeCode === 'GROUP') {
              <div aria-labelledby="members-title">
                <h3 id="members-title">Signatories from the group’s active members</h3>
                @for (member of members(); track member.partyId) {
                  <div class="member">
                    <span class="name">{{ member.displayName }}</span>
                    @if (isAdded(member.partyId)) {
                      <span class="why">Added</span>
                    } @else if (why(member); as reason) {
                      <span class="why">{{ reason }}</span>
                    } @else {
                      <ib-button (click)="addMember(member)"
                        >Add as signatory<span class="ib-visually-hidden">
                          {{ member.displayName }}</span
                        ></ib-button
                      >
                    }
                  </div>
                } @empty {
                  <p class="why">{{ membersStatus() }}</p>
                }
              </div>
            }
            @if (adding(); as role) {
              <div class="picker">
                <ib-holder-picker
                  [label]="roleLabel(role)"
                  [holderRole]="role"
                  [excluded]="holderIds()"
                  (picked)="add($event)"
                />
                <ib-button variant="quiet" (click)="adding.set(null)">Cancel</ib-button>
              </div>
            }
          }
        </section>

        <section aria-labelledby="review-title">
          <h2 id="review-title">3 Review</h2>
          <ib-form-field
            label="Account name"
            [required]="true"
            hint="Prefilled from the holders. You can change it."
          >
            <input
              ibInput
              ibControl
              maxlength="150"
              autocomplete="off"
              [value]="accountName()"
              (input)="name.set($any($event.target).value)"
            />
          </ib-form-field>
          @if (shape().needsSigningMode) {
            <fieldset>
              <legend>Operating mode</legend>
              <label class="choice"
                ><input
                  type="radio"
                  name="mode"
                  value="EITHER_TO_SIGN"
                  [checked]="mode() === 'EITHER_TO_SIGN'"
                  (change)="mode.set('EITHER_TO_SIGN')"
                />Either to sign</label
              >
              <label class="choice"
                ><input
                  type="radio"
                  name="mode"
                  value="ALL_TO_SIGN"
                  [checked]="mode() === 'ALL_TO_SIGN'"
                  (change)="mode.set('ALL_TO_SIGN')"
                />All to sign</label
              >
            </fieldset>
          } @else if (primary()) {
            <p class="facts">Operating mode: Single</p>
          }
          @if (attempted() && shape().problems.length > 0) {
            <ul class="problems" aria-label="Before you can open the account">
              @for (problem of shape().problems; track problem) {
                <li>{{ problem }}</li>
              }
            </ul>
          }
          <ib-button variant="primary" [block]="true" [loading]="guard.busy()" (click)="submit()"
            >Open account</ib-button
          >
        </section>
      </div>
    }
  `,
})
export class OpenAccountPage implements HasUnsavedChanges {
  protected readonly workingDate = inject(WorkingDateService);
  private readonly accounts = inject(AccountsClient);
  private readonly customers = inject(CustomersClient);
  private readonly lookups = inject(LookupsService);
  private readonly viewport = inject(ViewportService);

  protected readonly guard = new SubmitGuard();
  protected readonly openedState = { [OPENED_STATE]: true };
  protected readonly products = signal<ProductView[]>([]);
  protected readonly productId = signal<number | null>(null);
  protected readonly holders = signal<HolderChoice[]>([]);
  protected readonly adding = signal<HolderRole | null>(null);
  protected readonly members = signal<PartySearchRow[]>([]);
  protected readonly membersStatus = signal('');
  protected readonly mode = signal<SigningMode | null>(null);
  protected readonly name = signal<string | null>(null);
  protected readonly attempted = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly opened = signal<AccountOpened | null>(null);
  protected readonly continued = signal(false);

  private roles: LookupRow[] = [];
  private modes: LookupRow[] = [];
  private key = newIdempotencyKey();

  protected readonly product = computed(
    () => this.products().find((row) => row.productId === this.productId()) ?? null,
  );
  protected readonly primary = computed(
    () => this.holders().find((holder) => holder.role === 'PRIMARY') ?? null,
  );
  protected readonly holderIds = computed(() => this.holders().map((holder) => holder.partyId));
  protected readonly shape = computed(() => shapeOf(this.holders(), this.mode(), this.productId() !== null));
  protected readonly accountName = computed(() => this.name() ?? this.shape().defaultName);
  protected readonly phoneNotice = computed(() => this.viewport.size() === 'phone' && !this.continued());

  constructor() {
    this.accounts.openableProducts().then(
      (page) => this.products.set(page.items),
      (error) => this.failure.set(messageFor(toApiProblem(error))),
    );
    void Promise.all([this.lookups.list('account-holder-roles'), this.lookups.list('operating-modes')]).then(
      ([roles, modes]) => {
        this.roles = roles;
        this.modes = modes;
      },
      (error) => this.failure.set(messageFor(toApiProblem(error))),
    );
    const start = inject(Router).currentNavigation()?.extras.state?.[PRIMARY_STATE] as string | undefined;
    if (start) {
      void this.preselect(start);
    }
  }

  hasUnsavedChanges(): boolean {
    return this.opened() === null && this.holders().length > 0;
  }

  protected pickProduct(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.productId.set(value ? Number(value) : null);
  }

  protected add(choice: HolderChoice): void {
    this.holders.update((rows) => [...rows.filter((row) => row.partyId !== choice.partyId), choice]);
    this.adding.set(null);
    this.failure.set(null);
    if (choice.role === 'PRIMARY' && choice.partyTypeCode === 'GROUP') {
      void this.loadMembers(choice.partyId);
    }
  }

  protected addMember(member: PartySearchRow): void {
    this.add({
      partyId: member.partyId,
      partyNumber: member.partyNumber,
      displayName: member.displayName,
      partyTypeCode: member.partyTypeCode,
      role: 'SIGNATORY',
    });
  }

  protected remove(holder: HolderChoice): void {
    // Removing the primary holder starts the holders again: the other roles depend on it.
    this.holders.update((rows) => (holder.role === 'PRIMARY' ? [] : rows.filter((row) => row !== holder)));
    if (holder.role === 'PRIMARY') {
      this.members.set([]);
      this.mode.set(null);
    }
  }

  protected isAdded(partyId: number): boolean {
    return this.holderIds().includes(partyId);
  }

  protected why(row: PartySearchRow): string | null {
    return ineligibility(row, 'SIGNATORY');
  }

  protected async submit(): Promise<void> {
    this.attempted.set(true);
    const shape = this.shape();
    const name = this.accountName().trim();
    if (shape.problems.length > 0 || !name) {
      if (!name && shape.problems.length === 0) {
        this.failure.set('Enter the account name.');
      }
      return;
    }
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        const result = await this.accounts.open(
          {
            productId: this.productId(),
            accountName: name,
            operatingModeId: this.modeId(shape.needsSigningMode ? this.mode() : 'SINGLE'),
            holders: this.holders().map((holder) => ({
              partyId: holder.partyId,
              accountHolderRoleId: this.roles.find((role) => role.code === holder.role)?.id ?? null,
            })),
          },
          this.key,
        );
        this.opened.set(result);
        this.key = newIdempotencyKey();
      } catch (error) {
        const problem = toApiProblem(error);
        // A lost connection keeps the key, so pressing again cannot open a second account.
        if (problem.type !== 'network') {
          this.key = newIdempotencyKey();
        }
        const fields = Object.values(problem.errors ?? {}).flat();
        this.failure.set(fields.length > 0 ? fields.join(' ') : messageFor(problem));
      }
    });
  }

  protected startAgain(): void {
    this.opened.set(null);
    this.holders.set([]);
    this.members.set([]);
    this.mode.set(null);
    this.name.set(null);
    this.attempted.set(false);
    this.failure.set(null);
  }

  private modeId(code: string | null): number | null {
    return code ? (this.modes.find((mode) => mode.code === code)?.id ?? null) : null;
  }

  private async loadMembers(groupPartyId: number): Promise<void> {
    this.membersStatus.set('Loading the members…');
    try {
      const active = (await this.customers.members(groupPartyId)).filter((member) => !member.leftOn);
      const rows = await Promise.all(
        active.map(async (member) => {
          const page = await this.customers.search({ q: member.partyNumber, pageSize: 5 });
          return page.items.find((row) => row.partyId === member.memberPartyId) ?? null;
        }),
      );
      this.members.set(rows.filter((row): row is PartySearchRow => row !== null));
      this.membersStatus.set(active.length === 0 ? 'The group has no active members.' : '');
    } catch (error) {
      this.membersStatus.set(messageFor(toApiProblem(error)));
    }
  }

  /** From a customer record: start with that customer as primary holder when they can be one. */
  private async preselect(partyNumber: string): Promise<void> {
    try {
      const page = await this.customers.search({ q: partyNumber, pageSize: 5 });
      const row = page.items.find((item) => item.partyNumber === partyNumber);
      if (row && ineligibility(row, 'PRIMARY') === null) {
        this.add({
          partyId: row.partyId,
          partyNumber: row.partyNumber,
          displayName: row.displayName,
          partyTypeCode: row.partyTypeCode,
          role: 'PRIMARY',
        });
      }
    } catch {
      // The user can still search for the customer.
    }
  }

  protected roleLabel(role: string): string {
    return label(HOLDER_ROLE_LABELS, role);
  }
  protected productType(code: string): string {
    return PRODUCT_TYPES[code] ?? code;
  }
  protected money(amount: number, currency: string): string {
    return formatMoney(amount, currency);
  }
  protected readonly type = partyTypeLabel;
}
