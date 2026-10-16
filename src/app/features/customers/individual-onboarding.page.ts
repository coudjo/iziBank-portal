import { ChangeDetectionStrategy, Component, DestroyRef, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from '../../core/config/config.service';
import { formatDate } from '../../core/formats/dates';
import { maskTail, normalizeIdNumber } from '../../core/formats/masking';
import { displayPhone } from '../../core/formats/phone';
import { InMemoryStores } from '../../core/session/in-memory-stores';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { PageHeaderComponent } from '../../shared/ui';
import { CREATED_STATE } from './customer-record.page';
import { CustomersClient } from './customers.client';
import {
  FIELD_MESSAGES,
  IndividualStep,
  STEPS,
  STEP_FIELDS,
  createIndividualForm,
  stepOf,
  toRequest,
} from './individual-form';
import { IndividualFieldsComponent } from './individual-fields.component';
import { OnboardingFlow } from './onboarding-flow';
import { OnboardingFrameComponent } from './onboarding-frame.component';

const STEP_TITLES = ['Identity', 'Contact', 'Funds and review'];

/** Onboard an individual customer (UX 6.2, frontend plan 7.4, F5-02 and F5-03). */
@Component({
  selector: 'ib-individual-onboarding-page',
  imports: [IndividualFieldsComponent, OnboardingFrameComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  styles: `
    .review h3 {
      font-size: 15px;
      margin: 0;
    }
    .review-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: var(--ib-space-4) 0 var(--ib-space-2);
    }
    .link {
      font: inherit;
      color: var(--ib-primary);
      background: none;
      border: 0;
      padding: 0 var(--ib-space-1);
      min-height: 24px;
      text-decoration: underline;
      cursor: pointer;
    }
    dl {
      display: grid;
      grid-template-columns: minmax(9rem, 1fr) 2fr;
      gap: var(--ib-space-1) var(--ib-space-4);
      margin: 0;
    }
    dt {
      color: var(--ib-ink-muted);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  `,
  template: `
    <ib-page-header title="New individual customer" />
    <ib-onboarding-frame [flow]="flow" [titles]="titles" (cancelled)="cancel()">
      <!-- All steps stay rendered, so moving between them never re-binds a control (which would drop server errors). -->
      @for (step of steps; track step) {
        <ib-individual-fields
          [hidden]="step !== flow.current()"
          [section]="step"
          [group]="form.controls[step]"
          [submitted]="flow.wasSubmitted(step)"
        />
      }

      @if (flow.current() === 'funds') {
        <div class="review">
          <div class="review-head">
            <h3>Identity</h3>
            <button type="button" class="link" (click)="flow.goTo(0)">
              Edit<span class="ib-visually-hidden"> identity</span>
            </button>
          </div>
          <dl>
            <dt>Name</dt>
            <dd>{{ review().name }}</dd>
            <dt>Date of birth</dt>
            <dd class="ib-num">{{ review().dateOfBirth }}</dd>
            <dt>Nationality</dt>
            <dd>{{ review().nationality }}</dd>
            <dt>ID number</dt>
            <dd class="ib-num">{{ review().idNumber }}</dd>
          </dl>
          <div class="review-head">
            <h3>Contact</h3>
            <button type="button" class="link" (click)="flow.goTo(1)">
              Edit<span class="ib-visually-hidden"> contact</span>
            </button>
          </div>
          <dl>
            <dt>Mobile</dt>
            <dd class="ib-num">{{ review().mobile }}</dd>
            <dt>Address</dt>
            <dd>{{ review().address }}</dd>
          </dl>
        </div>
      }
    </ib-onboarding-frame>
  `,
})
export class IndividualOnboardingPage implements HasUnsavedChanges {
  private readonly client = inject(CustomersClient);
  private readonly router = inject(Router);
  private readonly frame = viewChild.required(OnboardingFrameComponent);

  protected readonly form = createIndividualForm(inject(ConfigService).config.minimumCustomerAgeYears ?? 18);
  protected readonly steps = STEPS;
  protected readonly titles = STEP_TITLES;
  protected readonly flow = new OnboardingFlow<IndividualStep>(
    {
      steps: STEPS,
      groups: this.form.controls,
      fields: STEP_FIELDS,
      messages: FIELD_MESSAGES,
      stepOf,
      duplicates: ['party.duplicate-identification'],
      create: () => this.client.createIndividual(toRequest(this.form)),
      find: () => this.findSaved(),
      onCreated: (partyId) =>
        void this.router.navigate(['/customers', partyId], { state: { [CREATED_STATE]: true } }),
      focusStep: () => this.frame().focusStep(),
    },
    this.client,
  );

  constructor() {
    const unregister = inject(InMemoryStores).register(() => this.flow.reset());
    inject(DestroyRef).onDestroy(unregister);
  }

  hasUnsavedChanges(): boolean {
    return this.flow.dirty();
  }

  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/customers');
  }

  /** Read on each check of the review step; the form's events refresh it. */
  protected review() {
    const { identity, contact } = this.form.getRawValue();
    return {
      name: [identity.title, identity.firstName, identity.lastName].filter(Boolean).join(' '),
      dateOfBirth: formatDate(identity.dateOfBirth),
      nationality: identity.nationality ?? '',
      idNumber: maskTail(normalizeIdNumber(identity.identificationNumber)),
      mobile: displayPhone(contact.mobile),
      address: [contact.address1, contact.address2].filter((line) => line.trim()).join(', '),
    };
  }

  /** Check now (UX 3.1) for an individual: the customer holding this ID number, matched by name. */
  private async findSaved() {
    const { identity } = this.form.getRawValue();
    const page = await this.client.search({
      q: normalizeIdNumber(identity.identificationNumber),
      pageSize: 10,
    });
    const name = `${identity.firstName.trim()} ${identity.lastName.trim()}`.toLowerCase();
    const match =
      page.items.find((row) => row.displayName.toLowerCase() === name) ??
      (page.items.length === 1 ? page.items[0] : undefined);
    return match
      ? { partyId: match.partyId, partyNumber: match.partyNumber, displayName: match.displayName }
      : null;
  }
}
