import { ChangeDetectionStrategy, Component, DestroyRef, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { InMemoryStores } from '../../core/session/in-memory-stores';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { PageHeaderComponent } from '../../shared/ui';
import {
  BUSINESS_FIELDS,
  BUSINESS_MESSAGES,
  BUSINESS_STEPS,
  BusinessStep,
  businessRequest,
  businessStepOf,
  createBusinessForm,
} from './business-form';
import { BusinessFieldsComponent } from './business-fields.component';
import { CREATED_STATE } from './customer-record.page';
import { CustomersClient } from './customers.client';
import { OnboardingFlow } from './onboarding-flow';
import { OnboardingFrameComponent } from './onboarding-frame.component';

/** Onboard a business customer (UX 6.3, F6). Documents and beneficial owners follow on the record. */
@Component({
  selector: 'ib-business-onboarding-page',
  imports: [BusinessFieldsComponent, OnboardingFrameComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  template: `
    <ib-page-header title="New business customer" />
    <ib-onboarding-frame [flow]="flow" [titles]="titles" (cancelled)="cancel()">
      @for (step of steps; track step) {
        <ib-business-fields
          [hidden]="step !== flow.current()"
          [section]="step"
          [group]="form.controls[step]"
          [submitted]="flow.wasSubmitted(step)"
        />
      }
    </ib-onboarding-frame>
  `,
})
export class BusinessOnboardingPage implements HasUnsavedChanges {
  private readonly client = inject(CustomersClient);
  private readonly router = inject(Router);
  private readonly frame = viewChild.required(OnboardingFrameComponent);

  protected readonly form = createBusinessForm();
  protected readonly steps = BUSINESS_STEPS;
  protected readonly titles = ['Business', 'Contact and funds'];
  protected readonly flow = new OnboardingFlow<BusinessStep>(
    {
      steps: BUSINESS_STEPS,
      groups: this.form.controls,
      fields: BUSINESS_FIELDS,
      messages: BUSINESS_MESSAGES,
      stepOf: businessStepOf,
      duplicates: ['party.duplicate-registration'],
      create: () => this.client.createBusiness(businessRequest(this.form)),
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

  /** Check now for a business: registration numbers are not searchable, so match the exact business name. */
  private async findSaved() {
    const name = this.form.controls.business.controls.businessName.value.trim();
    const page = await this.client.search({ q: name, partyType: 'BUSINESS', pageSize: 10 });
    const match = page.items.find((row) => row.displayName.toLowerCase() === name.toLowerCase());
    return match
      ? { partyId: match.partyId, partyNumber: match.partyNumber, displayName: match.displayName }
      : null;
  }
}
