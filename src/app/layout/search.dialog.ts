import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NzModalRef } from 'ng-zorro-antd/modal';
import type { PartySearchRow } from '../core/api/api-types';
import { toApiProblem } from '../core/errors/api-problem';
import { messageFor } from '../core/errors/error-catalog';
import { searchTerm } from '../core/formats/phone';
import { CustomerFiltersStore, CustomersClient, approvalCode, partyTypeLabel } from '../features/customers';
import { StatusChipComponent } from '../shared/ui';

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;
const LIMIT = 8;

/**
 * Global search (UX 4.1, frontend plan 7.3, F3-04): one query, results grouped by kind. Customers now; accounts
 * join when the accounts API exists (A6). ID numbers in results are masked by the API.
 */
@Component({
  selector: 'ib-search-dialog',
  imports: [StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .field {
      display: block;
      font-weight: 550;
      margin-bottom: var(--ib-space-1);
    }
    .hint {
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    input {
      width: 100%;
      font-size: 16px;
    }
    .group {
      margin-top: var(--ib-space-4);
    }
    .group-title {
      font-size: 13px;
      font-weight: 650;
      color: var(--ib-ink-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 var(--ib-space-2);
    }
    [role='listbox'] {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: min(60vh, 28rem);
      overflow-y: auto;
    }
    [role='option'] {
      padding: var(--ib-space-2) var(--ib-space-3);
      border-radius: var(--ib-radius-sm);
      cursor: pointer;
      border: 2px solid transparent;
    }
    [role='option'].active {
      border-color: var(--ib-focus);
      background: var(--ib-primary-tint);
    }
    .top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      font-weight: 600;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-1);
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    .status {
      margin: var(--ib-space-3) 0 0;
      color: var(--ib-ink-muted);
    }
    .all {
      font: inherit;
      color: var(--ib-primary);
      background: none;
      border: 0;
      padding: var(--ib-space-2) 0 0;
      text-decoration: underline;
      cursor: pointer;
      min-height: var(--ib-touch-target);
    }
  `,
  template: `
    <label class="field" for="ib-global-search">Search customers or accounts</label>
    <p class="hint" id="ib-global-search-hint">
      Customer number, name, mobile or ID number. At least 2 characters.
    </p>
    <input
      data-autofocus
      id="ib-global-search"
      class="ant-input ib-input"
      type="search"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="list"
      aria-describedby="ib-global-search-hint"
      aria-controls="ib-search-customers"
      [attr.aria-expanded]="rows().length > 0"
      [attr.aria-activedescendant]="activeId()"
      (input)="typed($event)"
      (keydown)="key($event)"
    />

    <p class="status" aria-live="polite">{{ status() }}</p>

    @if (rows().length > 0) {
      <div class="group">
        <p class="group-title" id="ib-search-customers-title">Customers</p>
        <ul id="ib-search-customers" role="listbox" aria-labelledby="ib-search-customers-title">
          @for (row of rows(); track row.partyId; let index = $index) {
            <li
              role="option"
              tabindex="-1"
              [id]="'ib-search-option-' + index"
              [class.active]="index === active()"
              [attr.aria-selected]="index === active()"
              (click)="open(row)"
              (mousemove)="active.set(index)"
              (keydown.enter)="open(row)"
            >
              <div class="top">
                <span>{{ row.displayName }}</span>
                <span class="ib-num">{{ row.partyNumber }}</span>
              </div>
              <div class="meta">
                <span>{{ typeLabel(row.partyTypeCode) }}</span>
                @if (row.identificationNumberMasked) {
                  <span class="ib-num">ID {{ row.identificationNumberMasked }}</span>
                }
                <ib-status-chip domain="kyc" [code]="row.effectiveKycStatusCode" />
                <ib-status-chip domain="approval" [code]="approval(row.supervisionState)" />
              </div>
            </li>
          }
        </ul>
        @if (total() > rows().length) {
          <button type="button" class="all" (click)="showAll()">Show all {{ total() }} customers</button>
        }
      </div>
    }
  `,
})
export class SearchDialogComponent {
  private readonly ref = inject<NzModalRef<SearchDialogComponent, void>>(NzModalRef);
  private readonly client = inject(CustomersClient);
  private readonly filters = inject(CustomerFiltersStore);
  private readonly router = inject(Router);

  protected readonly rows = signal<PartySearchRow[]>([]);
  protected readonly total = signal(0);
  protected readonly active = signal(-1);
  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly activeId = computed(() =>
    this.active() >= 0 ? `ib-search-option-${this.active()}` : null,
  );
  protected readonly status = computed(() => {
    if (this.error()) {
      return this.error();
    }
    if (this.query().trim().length < MIN_LENGTH) {
      return '';
    }
    if (this.loading()) {
      return 'Searching…';
    }
    const count = this.total();
    return count === 0 ? 'No customers match.' : `${count} ${count === 1 ? 'customer' : 'customers'} found.`;
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private request = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  protected typed(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.query.set(text);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (text.trim().length < MIN_LENGTH) {
      this.request++;
      this.rows.set([]);
      this.total.set(0);
      this.active.set(-1);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.timer = setTimeout(() => void this.search(text), DEBOUNCE_MS);
  }

  protected key(event: KeyboardEvent): void {
    const count = this.rows().length;
    if (event.key === 'ArrowDown' && count > 0) {
      event.preventDefault();
      this.active.set((this.active() + 1) % count);
      this.scrollActive();
    } else if (event.key === 'ArrowUp' && count > 0) {
      event.preventDefault();
      this.active.set(this.active() <= 0 ? count - 1 : this.active() - 1);
      this.scrollActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = this.rows()[this.active()];
      if (row) {
        this.open(row);
      } else if (this.query().trim().length >= MIN_LENGTH) {
        this.showAll();
      }
    }
  }

  protected open(row: PartySearchRow): void {
    this.ref.close();
    void this.router.navigate(['/customers', row.partyId]);
  }

  protected showAll(): void {
    this.filters.clear();
    this.filters.update({ q: this.query().trim() });
    this.ref.close();
    void this.router.navigateByUrl('/customers');
  }

  private async search(text: string): Promise<void> {
    const id = ++this.request;
    this.error.set(null);
    try {
      const page = await this.client.search({ q: searchTerm(text), page: 1, pageSize: LIMIT });
      if (id === this.request) {
        this.rows.set(page.items);
        this.total.set(page.totalCount);
        this.active.set(page.items.length > 0 ? 0 : -1);
      }
    } catch (failure) {
      if (id === this.request) {
        this.rows.set([]);
        this.total.set(0);
        this.error.set(messageFor(toApiProblem(failure)));
      }
    } finally {
      if (id === this.request) {
        this.loading.set(false);
      }
    }
  }

  private scrollActive(): void {
    const id = this.activeId();
    if (id) {
      document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
    }
  }

  protected readonly typeLabel = partyTypeLabel;
  protected readonly approval = approvalCode;
}
