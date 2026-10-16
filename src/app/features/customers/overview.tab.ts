import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { KycChecklistItem } from '../../core/api/api-types';
import { IconComponent } from '../../shared/ui';
import { CHECKLIST_TABS } from './customer-labels';
import { CustomerRecordStore } from './customer-record.store';
import { hasTab } from './customer-tabs';

/** Overview tab: the Complete the profile card and accounts held (UX 6.2 steps 3 and 4, 7.3; F5-04). */
@Component({
  selector: 'ib-customer-overview-tab',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      gap: var(--ib-space-4);
      align-items: start;
    }
    @media (max-width: 1279.98px) {
      :host {
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
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
      min-height: var(--ib-touch-target);
      border-top: 1px solid var(--ib-line);
    }
    li:first-child {
      border-top: 0;
    }
    .done {
      color: var(--ib-success-text);
    }
    .missing {
      color: var(--ib-warning-text);
    }
    .label {
      flex: 1;
    }
    .optional {
      color: var(--ib-ink-meta);
      font-size: 13px;
    }
    .status {
      font-size: 13px;
      color: var(--ib-ink-muted);
    }
    .complete {
      margin: var(--ib-space-3) 0 0;
      color: var(--ib-success-text);
    }
    .empty {
      margin: 0;
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    @if (store.overview(); as overview) {
      <section aria-labelledby="profile-title">
        <h2 id="profile-title">Complete the profile ({{ doneCount() }} of {{ items().length }} done)</h2>
        <ul>
          @for (item of items(); track item.code) {
            <li>
              @if (item.done) {
                <ib-icon name="check-circle" class="done" />
              } @else {
                <ib-icon name="exclamation-circle" class="missing" />
              }
              <span class="label">
                {{ item.label }}
                @if (!item.requiredForKyc) {
                  <span class="optional">(not needed for KYC)</span>
                }
              </span>
              @if (item.done) {
                <span class="status">Done</span>
              } @else if (tabFor(item); as tab) {
                <a [routerLink]="['..', tab]"
                  >Add<span class="ib-visually-hidden"> {{ item.label }}</span></a
                >
              } @else {
                <span class="status">Missing</span>
              }
            </li>
          }
        </ul>
        @if (overview.checklist.isComplete) {
          <p class="complete">
            Everything needed for KYC is in place. A KYC officer can now verify this customer.
          </p>
        }
      </section>

      <section aria-labelledby="accounts-title">
        <h2 id="accounts-title">Accounts held</h2>
        @if (overview.accounts.length === 0) {
          <p class="empty">No accounts yet.</p>
        }
      </section>
    }
  `,
})
export class CustomerOverviewTab {
  protected readonly store = inject(CustomerRecordStore);

  protected readonly items = computed(() => this.store.overview()?.checklist.items ?? []);
  protected readonly doneCount = computed(() => this.items().filter((item) => item.done).length);

  /** The tab that completes an item, when that tab exists in this build. */
  protected tabFor(item: KycChecklistItem): string | null {
    const tab = CHECKLIST_TABS[item.code];
    const type = this.store.party()?.partyTypeCode ?? 'INDIVIDUAL';
    return tab && hasTab(type, tab) ? tab : null;
  }
}
