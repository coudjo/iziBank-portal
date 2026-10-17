import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { PermissionService } from '../../core/permissions/permission.service';
import { messageFor } from '../../core/errors/error-catalog';
import { BannerComponent, ButtonComponent, StatusChipComponent, TabsComponent } from '../../shared/ui';
import { approvalCode, partyTypeLabel } from './customer-labels';
import { CustomerRecordStore } from './customer-record.store';
import { tabsFor } from './customer-tabs';

/** Shown once on the new customer's page (UX 5.2). Passed as router state, never in the URL. */
export const CREATED_STATE = 'ibCreated';

/** Customer record: header, tabs and the open tab (UX 7.3, frontend plan 7.5, F5-04). */
@Component({
  selector: 'ib-customer-record-page',
  imports: [RouterOutlet, RouterLink, BannerComponent, ButtonComponent, StatusChipComponent, TabsComponent],
  providers: [CustomerRecordStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--ib-space-3);
      margin-bottom: var(--ib-space-4);
    }
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--ib-space-2) var(--ib-space-3);
    }
    h1:focus {
      outline: none;
    }
    h1:focus-visible {
      outline: 2px solid var(--ib-focus);
      outline-offset: 2px;
    }
    .number {
      color: var(--ib-ink-muted);
      font-size: 15px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-2);
    }
    .type {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 999px;
      border: 1px solid var(--ib-border-control);
      font-size: 13px;
      font-weight: 550;
      line-height: 20px;
    }
    .pep {
      display: inline-flex;
      align-items: center;
      gap: var(--ib-space-1);
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 650;
      line-height: 20px;
      color: var(--ib-danger-text);
      background: var(--ib-danger-bg);
    }
    .meta {
      margin: var(--ib-space-2) 0 0;
      color: var(--ib-ink-muted);
    }
    .actions {
      display: flex;
      align-items: flex-start;
      gap: var(--ib-space-2);
    }
    .verify {
      display: inline-flex;
      align-items: center;
      font-weight: 550;
    }
    .logged {
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-ink-meta);
      font-size: 13px;
    }
  `,
  template: `
    @if (created && store.party()) {
      <ib-banner tone="success" message="Saved. This customer is awaiting approval by a supervisor." />
    }
    @if (!store.problem()) {
      <p class="logged">Viewing this record is logged.</p>
    }
    <div class="header">
      <div>
        <div class="title-row">
          <h1 tabindex="-1" data-page-title>{{ store.party()?.displayName ?? 'Customer' }}</h1>
          @if (store.party(); as party) {
            <span class="number ib-num">{{ party.partyNumber }}</span>
          }
        </div>
        @if (store.party(); as party) {
          <div class="chips">
            <span class="type">{{ typeLabel(party.partyTypeCode) }}</span>
            <ib-status-chip
              domain="kyc"
              [code]="party.effectiveKycStatusCode ?? party.kycStatusCode ?? 'PENDING'"
              [explain]="true"
            />
            <ib-status-chip domain="approval" [code]="approval(party.supervisionState)" [explain]="true" />
            @if (party.isPoliticallyExposed) {
              <span class="pep"
                >PEP<span class="ib-visually-hidden"> (politically exposed person)</span></span
              >
            }
          </div>
          <p class="meta">Credit officer: {{ store.overview()?.creditOfficerName ?? 'None assigned' }}</p>
        }
      </div>
      @if (canVerify()) {
        <div class="actions">
          <a class="ant-btn ant-btn-primary verify" routerLink="kyc">Verify KYC</a>
        </div>
      }
    </div>

    @if (store.party()) {
      <ib-tabs label="Customer record" [tabs]="tabs()" />
      <router-outlet />
    } @else if (store.problem(); as problem) {
      <ib-banner tone="danger" [message]="problemMessage()!" />
      @if (problem.type !== 'not-found') {
        <ib-button (click)="store.reload()">Try again</ib-button>
      }
    } @else {
      <p aria-live="polite">Loading the customer…</p>
    }
  `,
})
export class CustomerRecordPage {
  /** Route parameter `:id` (component input binding). */
  readonly id = input.required<string>();

  protected readonly store = inject(CustomerRecordStore);
  protected readonly created = inject(Router).currentNavigation()?.extras.state?.[CREATED_STATE] === true;

  private readonly permissions = inject(PermissionService);
  protected readonly tabs = computed(() =>
    tabsFor(this.store.party()?.partyTypeCode ?? 'INDIVIDUAL', (rule) => this.permissions.can(rule)),
  );
  /** UX 7.3 header: Verify KYC for KYC officers while the customer still needs it. */
  protected readonly canVerify = computed(() => {
    const party = this.store.party();
    return (
      !!party &&
      this.permissions.can({ module: 'PTY', subModule: 'KYC', action: 'supervise' }) &&
      (party.effectiveKycStatusCode !== 'VERIFIED' || party.supervisionState === 'PENDING')
    );
  });
  protected readonly problemMessage = computed(() => {
    const problem = this.store.problem();
    // A sensitive read the API refused because it could not log it (frontend plan 7.5).
    return problem ? messageFor(problem) : null;
  });

  constructor() {
    effect(() => {
      const partyId = Number(this.id());
      untracked(() => void this.store.load(partyId));
    });
  }

  protected readonly typeLabel = partyTypeLabel;
  protected readonly approval = approvalCode;
}
