import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DocumentSummary, LookupRow } from '../../core/api/api-types';
import { LookupsService } from '../../core/lookups/lookups.service';
import { AuthService } from '../../core/auth/auth.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate } from '../../core/formats/dates';
import { PermissionService } from '../../core/permissions/permission.service';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  FileViewerComponent,
  IconComponent,
  StatusChipComponent,
  ToastService,
  ViewerItem,
} from '../../shared/ui';
import { CHECKLIST_TABS } from './customer-labels';
import { CustomerRecordStore } from './customer-record.store';
import { hasTab } from './customer-tabs';
import { CustomersClient } from './customers.client';
import { FOUR_EYES_MESSAGE, isOwnWork } from './four-eyes';

/**
 * KYC tab and the verify-and-approve screen (UX 6.5, 7.3; F7): details and checklist on the left, documents and
 * photo on the right, with Verify and approve and Reject in a sticky bar. Verifying also approves the record (D3).
 */
@Component({
  selector: 'ib-customer-kyc-tab',
  imports: [
    RouterLink,
    BannerComponent,
    ButtonComponent,
    FileViewerComponent,
    IconComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .split {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      gap: var(--ib-space-4);
      align-items: start;
    }
    @media (max-width: 1279.98px) {
      .split {
        grid-template-columns: 1fr;
      }
    }
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
    .pep {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
      padding: var(--ib-space-3);
      margin-bottom: var(--ib-space-3);
      border: 2px solid var(--ib-danger-text);
      border-radius: var(--ib-radius-md);
      color: var(--ib-danger-text);
      background: var(--ib-danger-bg);
      font-weight: 650;
    }
    dl {
      display: grid;
      grid-template-columns: minmax(8rem, 1fr) 2fr;
      gap: var(--ib-space-1) var(--ib-space-3);
      margin: 0;
    }
    dt {
      color: var(--ib-ink-muted);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
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
    li span.label {
      flex: 1;
    }
    .done {
      color: var(--ib-success-text);
    }
    .missing {
      color: var(--ib-warning-text);
    }
    .status {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-3);
    }
    .bar {
      position: sticky;
      bottom: 0;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: var(--ib-space-3);
      padding: var(--ib-space-3) 0;
      background: var(--ib-page);
      border-top: 1px solid var(--ib-line);
    }
    .reason {
      margin: 0;
      color: var(--ib-ink-muted);
      flex: 1 1 18rem;
    }
    a {
      text-decoration: underline;
    }
  `,
  template: `
    @if (message(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }
    @if (store.overview(); as overview) {
      <div class="split">
        <div>
          <section aria-labelledby="kyc-status-title">
            <h2 id="kyc-status-title">Identity checks</h2>
            @if (overview.party.isPoliticallyExposed) {
              <p class="pep" role="note">
                <ib-icon name="warning" /> Politically exposed person. Apply enhanced due diligence.
              </p>
            }
            <div class="status">
              <ib-status-chip domain="kyc" [code]="overview.checklist.effectiveStatus" [explain]="true" />
              <ib-status-chip domain="approval" [code]="approval()" [explain]="true" />
            </div>
            @if (overview.party.individual; as person) {
              <dl>
                <dt>Name</dt>
                <dd>{{ overview.party.displayName }}</dd>
                <dt>Date of birth</dt>
                <dd class="ib-num">{{ date(person.dateOfBirth) }}</dd>
                <dt>Nationality</dt>
                <dd>{{ person.nationality }}</dd>
                <dt>Source of funds</dt>
                <dd>{{ overview.party.sourceOfFunds || '—' }}</dd>
                <dt>Occupation</dt>
                <dd>{{ overview.party.occupationOrSector || '—' }}</dd>
              </dl>
            }
          </section>
          <section aria-labelledby="kyc-checklist-title">
            <h2 id="kyc-checklist-title">Checklist</h2>
            <ul>
              @for (item of overview.checklist.items; track item.code) {
                <li>
                  <ib-icon
                    [name]="item.done ? 'check-circle' : 'exclamation-circle'"
                    [class]="item.done ? 'done' : 'missing'"
                  />
                  <span class="label">{{ item.label }}</span>
                  @if (item.done) {
                    <span>Done</span>
                  } @else if (tabFor(item.code); as tab) {
                    <a [routerLink]="['..', tab]"
                      >Add<span class="ib-visually-hidden"> {{ item.label }}</span></a
                    >
                  } @else {
                    <span>Missing</span>
                  }
                </li>
              }
            </ul>
          </section>
        </div>
        <section aria-labelledby="kyc-files-title">
          <h2 id="kyc-files-title">Documents and photo</h2>
          @if (viewing()) {
            <ib-file-viewer [items]="files()" />
          } @else if (files().length > 0) {
            <p>
              {{ files().length }} {{ files().length === 1 ? 'file' : 'files' }} to check. Opening them is
              logged.
            </p>
            <ib-button icon="eye" (click)="viewing.set(true)">Show documents and photo</ib-button>
          } @else {
            <p>No photo or document images yet.</p>
          }
        </section>
      </div>

      @if (canSupervise()) {
        <div class="bar" role="group" aria-label="KYC decision">
          @if (blocked(); as reason) {
            <p class="reason" id="kyc-blocked">{{ reason }}</p>
          }
          @if (overview.checklist.effectiveStatus !== 'REJECTED') {
            <ib-button variant="danger" [loading]="rejecting.busy()" (click)="reject()">Reject</ib-button>
          }
          @if (overview.checklist.effectiveStatus !== 'VERIFIED' || approval() === 'PENDING') {
            <ib-button
              variant="primary"
              [disabled]="blocked() !== null"
              [loading]="verifying.busy()"
              (click)="verify()"
              >Verify and approve</ib-button
            >
          }
        </div>
      }
    }
  `,
})
export class CustomerKycTab {
  protected readonly store = inject(CustomerRecordStore);
  private readonly client = inject(CustomersClient);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly me = inject(AuthService).me;

  protected readonly message = signal<string | null>(null);
  protected readonly viewing = signal(false);
  protected readonly verifying = new SubmitGuard();
  protected readonly rejecting = new SubmitGuard();
  private readonly documents = signal<DocumentSummary[]>([]);
  private readonly types = signal<LookupRow[]>([]);

  protected readonly canSupervise = computed(() =>
    this.permissions.can({ module: 'PTY', subModule: 'KYC', action: 'supervise' }),
  );
  protected readonly approval = computed(() =>
    this.store.party()?.supervisionState === 'PENDING' ? 'PENDING' : 'APPROVED',
  );
  protected readonly ownWork = computed(() => {
    const party = this.store.party();
    return isOwnWork(this.me()?.staffUserId, party?.createdByUserId, party?.modifiedByUserId);
  });
  /** Why Verify is unavailable, shown in text so touch users see it too (frontend plan 6.3). */
  protected readonly blocked = computed((): string | null => {
    const overview = this.store.overview();
    if (!overview) {
      return null;
    }
    if (this.ownWork()) {
      return FOUR_EYES_MESSAGE;
    }
    const missing = overview.checklist.items.filter((item) => item.requiredForKyc && !item.done);
    return missing.length > 0
      ? `Missing: ${missing.map((item) => item.label.toLowerCase()).join(', ')}.`
      : null;
  });

  protected readonly files = computed((): ViewerItem[] => {
    const overview = this.store.overview();
    if (!overview) {
      return [];
    }
    const partyId = overview.party.partyId;
    const items: ViewerItem[] = [];
    if (overview.photo.hasPhoto) {
      items.push({ label: 'Photo', load: () => this.client.photoImage(partyId) });
    }
    for (const document of this.documents().filter((row) => row.hasImage)) {
      items.push({
        label: `${this.typeName(document.documentTypeCode)} ${document.documentNumberMasked}`,
        load: () => this.client.documentImage(partyId, document.partyIdentificationDocumentId),
      });
    }
    return items;
  });

  constructor() {
    inject(LookupsService)
      .list('identification-document-types')
      .then(
        (rows) => this.types.set(rows),
        () => undefined,
      );
    effect(() => {
      const party = this.store.party();
      if (party && party.partyTypeCode !== 'GROUP') {
        untracked(() =>
          this.client.documents(party.partyId).then(
            (rows) => this.documents.set(rows),
            () => this.documents.set([]),
          ),
        );
      }
    });
  }

  protected async verify(): Promise<void> {
    const party = this.store.party();
    if (!party || this.blocked()) {
      return;
    }
    await this.verifying.run(async () => {
      this.message.set(null);
      try {
        await this.client.verifyKyc(party.partyId);
        this.toast.success('KYC verified and the customer approved.');
        await this.store.reload();
      } catch (failure) {
        this.message.set(messageFor(toApiProblem(failure)));
      }
    });
  }

  protected async reject(): Promise<void> {
    const party = this.store.party();
    if (!party) {
      return;
    }
    const reason = await this.dialogs.reason({
      title: 'Reject KYC?',
      message: `${party.displayName}'s identity checks will be marked as rejected. The reason is kept in the activity log.`,
      label: 'Reason',
      confirmLabel: 'Reject',
      maxLength: 300,
    });
    if (!reason) {
      return;
    }
    await this.rejecting.run(async () => {
      this.message.set(null);
      try {
        await this.client.rejectKyc(party.partyId, reason);
        this.toast.success('KYC rejected.');
        await this.store.reload();
      } catch (failure) {
        this.message.set(messageFor(toApiProblem(failure)));
      }
    });
  }

  protected tabFor(code: string): string | null {
    const tab = CHECKLIST_TABS[code];
    return tab && hasTab(this.store.party()?.partyTypeCode ?? 'INDIVIDUAL', tab) ? tab : null;
  }

  private typeName(code: string): string {
    return this.types().find((row) => row.code === code)?.name ?? documentLabel(code);
  }

  protected readonly date = formatDate;
}

/** Document type codes as words (lookups carry names, but the summary rows carry codes only). */
export function documentLabel(code: string): string {
  const words = code.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
