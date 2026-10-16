import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import type { LookupRow, PartyDetail } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate } from '../../core/formats/dates';
import { displayPhone } from '../../core/formats/phone';
import { LookupsService } from '../../core/lookups/lookups.service';
import { CanDirective } from '../../core/permissions/can.directive';
import { FormProblem, applyServerErrors, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  ErrorSummaryComponent,
  MaskedValueComponent,
  ToastService,
} from '../../shared/ui';
import {
  BUSINESS_FIELDS,
  BUSINESS_MESSAGES,
  BUSINESS_STEPS,
  businessChangesControlled,
  businessFromParty,
  businessRequest,
  businessStepOf,
  createBusinessForm,
} from './business-form';
import { BusinessFieldsComponent } from './business-fields.component';
import { CustomerRecordStore } from './customer-record.store';
import { CustomersClient } from './customers.client';
import {
  GROUP_FIELDS,
  GROUP_MESSAGES,
  createGroupForm,
  groupChangesControlled,
  groupDetails,
  groupFromParty,
} from './group-form';
import { GroupFieldsComponent } from './group-fields.component';

const CONTROLLED_WARNING = 'Changing this will send the customer back for approval and reset KYC to pending.';

/**
 * Details of a business or a group (F6), read only until Edit. Controlled fields (business name, registration
 * number, TIN, group name) on an approved customer warn first (UX 5.2).
 */
@Component({
  selector: 'ib-organisation-details',
  imports: [
    CanDirective,
    BannerComponent,
    BusinessFieldsComponent,
    ButtonComponent,
    ErrorSummaryComponent,
    GroupFieldsComponent,
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
      <form (submit)="$event.preventDefault(); save()" novalidate aria-label="Edit customer details">
        @if (message(); as text) {
          <ib-banner tone="danger" [message]="text" />
        }
        <ib-error-summary [problems]="problems()" />
        @if (isBusiness()) {
          <section aria-labelledby="edit-business">
            <h2 id="edit-business">Business</h2>
            <ib-business-fields
              section="business"
              [group]="business.controls.business"
              [submitted]="submitted()"
            />
          </section>
          <section aria-labelledby="edit-contact">
            <h2 id="edit-contact">Contact and funds</h2>
            <ib-business-fields
              section="contact"
              [group]="business.controls.contact"
              [submitted]="submitted()"
            />
          </section>
        } @else {
          <section aria-labelledby="edit-group">
            <h2 id="edit-group">Group</h2>
            <ib-group-fields [group]="group.controls.group" [submitted]="submitted()" />
          </section>
        }
        <div class="bar">
          <ib-button (click)="cancel()">Cancel</ib-button>
          <ib-button variant="primary" type="submit" [loading]="guard.busy()">Save changes</ib-button>
        </div>
      </form>
    } @else {
      <div class="toolbar">
        @if (isBusiness()) {
          <ib-button
            *ibCan="{ module: 'PTY', subModule: 'PARTY', action: 'edit' }"
            icon="edit"
            (click)="edit()"
            >Edit details</ib-button
          >
        } @else {
          <ib-button
            *ibCan="{ module: 'PTY', subModule: 'GROUPS', action: 'edit' }"
            icon="edit"
            (click)="edit()"
            >Edit details</ib-button
          >
        }
      </div>
      @if (party().business; as business) {
        <section aria-labelledby="business-title">
          <h2 id="business-title">Business</h2>
          <dl>
            <dt>Business name</dt>
            <dd>{{ business.businessName }}</dd>
            <dt>Registration number</dt>
            <dd class="ib-num">{{ business.registrationNumber || '—' }}</dd>
            <dt>Legal form</dt>
            <dd>{{ categoryName(business.businessCategoryId) }}</dd>
            <dt>Tax identification number</dt>
            <dd>
              <ib-masked-value label="Tax identification number" [value]="business.taxIdentificationNumber" />
            </dd>
            <dt>Incorporation date</dt>
            <dd class="ib-num">{{ date(business.incorporationDate) || '—' }}</dd>
          </dl>
        </section>
      }
      @if (party().group; as group) {
        <section aria-labelledby="group-title">
          <h2 id="group-title">Group</h2>
          <dl>
            <dt>Group name</dt>
            <dd>{{ group.groupName }}</dd>
            <dt>Formation date</dt>
            <dd class="ib-num">{{ date(group.formationDate) || '—' }}</dd>
            <dt>Meeting frequency</dt>
            <dd>{{ group.meetingFrequency || '—' }}</dd>
            <dt>Chairperson</dt>
            <dd>{{ group.chairpersonName ?? 'None yet' }}</dd>
            <dt>Active members</dt>
            <dd class="ib-num">{{ group.activeMemberCount }}</dd>
          </dl>
        </section>
      }
      <section aria-labelledby="org-contact-title">
        <h2 id="org-contact-title">Contact</h2>
        <dl>
          <dt>Mobile</dt>
          <dd><ib-masked-value label="Mobile" [value]="party().mobile" [format]="phone" /></dd>
          <dt>Phone</dt>
          <dd class="ib-num">{{ phone(party().phone ?? '') || '—' }}</dd>
          <dt>Email</dt>
          <dd>{{ party().emailAddress || '—' }}</dd>
          <dt>Address</dt>
          <dd>{{ address() || '—' }}</dd>
          @if (isBusiness()) {
            <dt>Source of funds</dt>
            <dd>{{ party().sourceOfFunds || '—' }}</dd>
            <dt>Sector</dt>
            <dd>{{ party().occupationOrSector || '—' }}</dd>
          }
        </dl>
      </section>
    }
  `,
})
export class OrganisationDetailsComponent {
  readonly party = input.required<PartyDetail>();

  private readonly store = inject(CustomerRecordStore);
  private readonly client = inject(CustomersClient);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly business = createBusinessForm();
  protected readonly group = createGroupForm();
  protected readonly editing = signal(false);
  protected readonly submitted = signal(false);
  protected readonly problems = signal<FormProblem[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly guard = new SubmitGuard();
  private readonly categories = signal<LookupRow[]>([]);

  protected readonly isBusiness = computed(() => this.party().partyTypeCode === 'BUSINESS');
  protected readonly address = computed(() =>
    [this.party().address1, this.party().address2].filter((line) => !!line?.trim()).join(', '),
  );
  private readonly approved = computed(
    () => this.party().supervisionState !== 'PENDING' || this.party().effectiveKycStatusCode === 'VERIFIED',
  );

  constructor() {
    inject(LookupsService)
      .list('business-categories')
      .then(
        (rows) => this.categories.set(rows),
        () => undefined,
      );
  }

  hasUnsavedChanges(): boolean {
    return this.editing() && (this.isBusiness() ? this.business.dirty : this.group.dirty);
  }

  protected edit(): void {
    if (this.isBusiness()) {
      businessFromParty(this.business, this.party());
    } else {
      groupFromParty(this.group, this.party());
    }
    this.submitted.set(false);
    this.problems.set([]);
    this.message.set(null);
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
    this.business.reset();
    this.group.reset();
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    const groups: [
      FormGroup,
      readonly string[],
      Readonly<Record<string, Readonly<Record<string, string>>>>,
    ][] = this.isBusiness()
      ? BUSINESS_STEPS.map((step) => [this.business.controls[step], BUSINESS_FIELDS[step], BUSINESS_MESSAGES])
      : [[this.group.controls.group, GROUP_FIELDS.group, GROUP_MESSAGES]];
    groups.forEach(([group]) => group.markAllAsTouched());
    const problems = groups.flatMap(([group, fields, messages]) => formProblems(group, fields, messages));
    this.problems.set(problems);
    if (problems.length > 0) {
      return;
    }

    const party = this.party();
    const controlled = this.isBusiness()
      ? businessChangesControlled(this.business, party)
      : groupChangesControlled(this.group, party);
    if (this.approved() && controlled) {
      const confirmed = await this.dialogs.confirm({
        title: 'Send back for approval?',
        message: CONTROLLED_WARNING,
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
        if (this.isBusiness()) {
          await this.client.updateBusiness(party.partyId, businessRequest(this.business));
        } else {
          await this.client.updateGroup(party.partyId, { ...groupDetails(this.group), members: null });
        }
        this.editing.set(false);
        this.toast.success('Changes saved.');
        await this.store.reload();
      } catch (failure) {
        const problem = toApiProblem(failure);
        if (problem.status === 400 && problem.errors) {
          const unmatched: FormProblem[] = [];
          for (const [field, messages] of Object.entries(problem.errors)) {
            const step = this.isBusiness() ? businessStepOf(field) : 'group';
            const target =
              this.isBusiness() && step
                ? this.business.controls[step as 'business' | 'contact']
                : this.group.controls.group;
            unmatched.push(...applyServerErrors(target, { [field]: messages }));
          }
          this.problems.set([
            ...groups.flatMap(([group, fields, messages]) => formProblems(group, fields, messages)),
            ...unmatched,
          ]);
        } else {
          this.message.set(messageFor(problem));
        }
      }
    });
  }

  protected categoryName(id: number | null | undefined): string {
    return this.categories().find((row) => row.id === id)?.name ?? '—';
  }

  protected readonly date = formatDate;
  protected readonly phone = (value: string) => displayPhone(value);
}
