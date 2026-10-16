import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiProblem, isNetworkProblem, toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate } from '../../core/formats/dates';
import { maskTail, normalizeIdNumber } from '../../core/formats/masking';
import { displayPhone } from '../../core/formats/phone';
import { ViewportService } from '../../core/layout/viewport.service';
import { applyServerErrors, formProblems, FormProblem } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import {
  BannerComponent,
  ButtonComponent,
  ErrorSummaryComponent,
  PageHeaderComponent,
  StepperComponent,
} from '../../shared/ui';
import { CREATED_STATE } from './customer-record.page';
import { CustomersClient } from './customers.client';
import { FIELD_MESSAGES, IndividualStep, STEPS, STEP_FIELDS, stepOf, toRequest } from './individual-form';
import { IndividualFieldsComponent } from './individual-fields.component';
import { IndividualOnboardingState } from './individual-onboarding.state';

const STEP_TITLES: Readonly<Record<IndividualStep, string>> = {
  identity: 'Identity',
  contact: 'Contact',
  funds: 'Funds and review',
};

const SESSION_PROBLEMS = new Set([
  'auth.unauthenticated',
  'auth.session-ended',
  'auth.session-superseded',
  'auth.session-timed-out',
  'auth.session-max-exceeded',
  'auth.session-forced',
]);

/** Onboard an individual customer (UX 6.2, frontend plan 7.4, F5-02 and F5-03). */
@Component({
  selector: 'ib-individual-onboarding-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BannerComponent,
    ButtonComponent,
    ErrorSummaryComponent,
    IndividualFieldsComponent,
    PageHeaderComponent,
    StepperComponent,
  ],
  providers: [IndividualOnboardingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  styles: `
    form {
      max-width: 60rem;
    }
    .step-title:focus {
      outline: none;
    }
    .step-title:focus-visible {
      outline: 2px solid var(--ib-focus);
      outline-offset: 2px;
    }
    .step-title {
      margin-bottom: var(--ib-space-4);
    }
    .card {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-5);
      margin-bottom: var(--ib-space-4);
    }
    .bar {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-4);
    }
    .bar--phone {
      position: sticky;
      bottom: 64px;
      z-index: 5;
      background: var(--ib-page);
      padding: var(--ib-space-3) 0;
      border-top: 1px solid var(--ib-line);
    }
    .bar .end {
      display: flex;
      gap: var(--ib-space-2);
      margin-left: auto;
    }
    .panel {
      border: 2px solid var(--ib-warning-text);
      border-radius: var(--ib-radius-md);
      background: var(--ib-surface);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-4);
    }
    .panel h2 {
      font-size: 16px;
      margin-bottom: var(--ib-space-2);
    }
    .panel p {
      margin: 0 0 var(--ib-space-3);
    }
    .panel .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
    }
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
    .review-head:first-of-type {
      margin-top: 0;
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
    <ib-stepper label="Onboarding steps" [steps]="stepTitles" [current]="state.step()" />

    @if (state.duplicate(); as duplicate) {
      <section class="panel" role="alert" aria-labelledby="duplicate-title">
        <h2 id="duplicate-title">This customer may already exist</h2>
        <p>{{ duplicateMessage() }}</p>
        @if (duplicate.partyId !== null) {
          <div class="actions">
            <a [routerLink]="['/customers', duplicate.partyId]">Open that customer</a>
          </div>
        }
      </section>
    }

    @if (state.unconfirmed()) {
      <section class="panel" role="alert" aria-labelledby="unconfirmed-title">
        <h2 id="unconfirmed-title">We could not confirm this was saved</h2>
        @switch (state.check()?.kind) {
          @case ('found') {
            <p>This customer was saved: {{ found()?.displayName }} ({{ found()?.partyNumber }}).</p>
            <div class="actions">
              <ib-button variant="primary" (click)="openFound()">Open the customer</ib-button>
            </div>
          }
          @case ('not-found') {
            <p>The customer was not saved. You can create it now.</p>
            <div class="actions">
              <ib-button variant="primary" [loading]="guard.busy()" (click)="create()">Try again</ib-button>
            </div>
          }
          @case ('failed') {
            <p>We still cannot reach the server. Check the connection, then check again.</p>
            <div class="actions">
              <ib-button variant="primary" [loading]="checking()" (click)="checkNow()">Check now</ib-button>
            </div>
          }
          @default {
            <p>Check before trying again.</p>
            <div class="actions">
              <ib-button variant="primary" [loading]="checking()" (click)="checkNow()">Check now</ib-button>
            </div>
          }
        }
      </section>
    }

    @if (state.message(); as message) {
      <ib-banner tone="danger" [message]="message" />
    }

    <form [formGroup]="state.form" (ngSubmit)="primary()" novalidate>
      <ib-error-summary [problems]="state.problems()" />
      <div class="card">
        <h2 class="step-title" tabindex="-1" #stepTitle>{{ stepTitles[state.step()] }}</h2>
        <!-- All steps stay rendered, so moving between them never re-binds a control (which would drop server errors). -->
        @for (step of steps; track step) {
          <ib-individual-fields
            [hidden]="step !== currentStep()"
            [section]="step"
            [group]="state.form.controls[step]"
            [submitted]="state.submitted()[step]"
          />
        }

        @if (currentStep() === 'funds') {
          <div class="review" aria-labelledby="review-title">
            <h2 id="review-title" class="ib-visually-hidden">Review</h2>
            <div class="review-head">
              <h3>Identity</h3>
              <button type="button" class="link" (click)="goTo(0)">
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
              <button type="button" class="link" (click)="goTo(1)">
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
      </div>

      <div class="bar" [class.bar--phone]="phone()">
        @if (state.step() > 0) {
          <ib-button (click)="back()">Back</ib-button>
        } @else {
          <ib-button variant="quiet" (click)="cancel()">Cancel</ib-button>
        }
        <div class="end">
          @if (currentStep() === 'funds') {
            <ib-button variant="primary" type="submit" [loading]="guard.busy()">Create customer</ib-button>
          } @else {
            <ib-button variant="primary" type="submit">Next</ib-button>
          }
        </div>
      </div>
    </form>
  `,
})
export class IndividualOnboardingPage implements HasUnsavedChanges {
  protected readonly state = inject(IndividualOnboardingState);
  protected readonly guard = new SubmitGuard();
  private readonly checker = new SubmitGuard();
  protected readonly checking = this.checker.busy;
  private readonly client = inject(CustomersClient);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService);
  private readonly stepTitle = viewChild<ElementRef<HTMLElement>>('stepTitle');

  protected readonly stepTitles = STEPS.map((step) => STEP_TITLES[step]);
  protected readonly phone = computed(() => this.viewport.size() === 'phone');
  protected readonly currentStep = computed(() => STEPS[this.state.step()]);
  protected readonly steps = STEPS;
  protected readonly found = computed(() => {
    const check = this.state.check();
    return check?.kind === 'found' ? check : null;
  });

  protected readonly duplicateMessage = computed(() => {
    const duplicate = this.state.duplicate();
    if (!duplicate) {
      return '';
    }
    return messageFor(
      { type: 'party.duplicate-identification', extensions: { existingPartyNumber: duplicate.partyNumber } },
      undefined,
      duplicate.displayName ? { name: duplicate.displayName } : {},
    );
  });

  /** Read on each check of the review step; the form's events refresh it. */
  protected review() {
    const { identity, contact } = this.state.form.getRawValue();
    return {
      name: [identity.title, identity.firstName, identity.lastName].filter(Boolean).join(' '),
      dateOfBirth: formatDate(identity.dateOfBirth),
      nationality: identity.nationality ?? '',
      idNumber: maskTail(normalizeIdNumber(identity.identificationNumber)),
      mobile: displayPhone(contact.mobile),
      address: [contact.address1, contact.address2].filter((line) => line.trim()).join(', '),
    };
  }

  hasUnsavedChanges(): boolean {
    return !this.state.done() && this.state.form.dirty;
  }

  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  protected primary(): void {
    if (this.currentStep() === 'funds') {
      void this.create();
    } else {
      this.next();
    }
  }

  protected next(): void {
    const step = this.currentStep();
    if (!this.validate(step)) {
      return;
    }
    this.goTo(this.state.step() + 1);
  }

  protected back(): void {
    this.goTo(this.state.step() - 1);
  }

  protected goTo(index: number): void {
    this.state.problems.set([]);
    this.state.step.set(Math.max(0, Math.min(STEPS.length - 1, index)));
    setTimeout(() => this.stepTitle()?.nativeElement.focus());
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/customers');
  }

  protected async create(): Promise<void> {
    const invalid = STEPS.find((step) => this.group(step).invalid);
    if (invalid) {
      this.goTo(STEPS.indexOf(invalid));
      this.validate(invalid);
      return;
    }

    await this.guard.run(async () => {
      this.state.clearOutcome();
      try {
        const created = await this.client.createIndividual(toRequest(this.state.form));
        this.finish(created.partyId);
      } catch (failure) {
        await this.failed(toApiProblem(failure));
      }
    });
  }

  protected async checkNow(): Promise<void> {
    await this.checker.run(async () => {
      const { identity } = this.state.form.getRawValue();
      try {
        const page = await this.client.search({
          q: normalizeIdNumber(identity.identificationNumber),
          pageSize: 10,
        });
        const name = `${identity.firstName.trim()} ${identity.lastName.trim()}`.toLowerCase();
        const match =
          page.items.find((row) => row.displayName.toLowerCase() === name) ??
          (page.items.length === 1 ? page.items[0] : undefined);
        this.state.check.set(
          match
            ? {
                kind: 'found',
                partyId: match.partyId,
                partyNumber: match.partyNumber,
                displayName: match.displayName,
              }
            : { kind: 'not-found' },
        );
      } catch {
        this.state.check.set({ kind: 'failed' });
      }
    });
  }

  protected openFound(): void {
    const found = this.found();
    if (found) {
      this.finish(found.partyId);
    }
  }

  private finish(partyId: number): void {
    this.state.done.set(true);
    void this.router.navigate(['/customers', partyId], { state: { [CREATED_STATE]: true } });
  }

  private async failed(problem: ApiProblem): Promise<void> {
    if (isNetworkProblem(problem)) {
      this.state.unconfirmed.set(true);
      return;
    }
    if (problem.type === 'party.duplicate-identification') {
      await this.showDuplicate(String(problem.extensions['existingPartyNumber'] ?? ''));
      return;
    }
    if (problem.status === 400 && problem.errors) {
      this.showServerErrors(problem.errors);
      return;
    }
    if (SESSION_PROBLEMS.has(problem.type)) {
      this.state.message.set('Your session ended. Sign in again, then press Create customer again.');
      return;
    }
    const traceId =
      typeof problem.extensions['traceId'] === 'string' ? problem.extensions['traceId'] : undefined;
    this.state.message.set(messageFor(problem, traceId));
  }

  /** 409 duplicate ID: stay on step 1 with the panel; the form is not cleared (frontend plan 7.4). */
  private async showDuplicate(partyNumber: string): Promise<void> {
    this.state.duplicate.set({ partyNumber, partyId: null, displayName: null });
    this.goTo(0);
    try {
      const page = await this.client.search({ q: partyNumber, pageSize: 5 });
      const row = page.items.find((item) => item.partyNumber === partyNumber);
      if (row) {
        this.state.duplicate.set({ partyNumber, partyId: row.partyId, displayName: row.displayName });
      }
    } catch {
      // The panel still names the customer number.
    }
  }

  /** 400: errors land on their fields; the flow jumps to the first step that has one. */
  private showServerErrors(errors: Record<string, string[]>): void {
    const unmatched: FormProblem[] = [];
    for (const [field, messages] of Object.entries(errors)) {
      const step = stepOf(field);
      if (step) {
        applyServerErrors(this.group(step), { [field]: messages });
      } else {
        unmatched.push(...messages.slice(0, 1).map((message) => ({ field: null, message })));
      }
    }
    const first = STEPS.find((step) => Object.keys(errors).some((field) => stepOf(field) === step));
    if (first) {
      this.goTo(STEPS.indexOf(first));
      this.state.markSubmitted(first);
      this.state.problems.set([
        ...formProblems(this.group(first), STEP_FIELDS[first], FIELD_MESSAGES),
        ...unmatched,
      ]);
    } else {
      this.state.problems.set(unmatched);
    }
  }

  private validate(step: IndividualStep): boolean {
    const group = this.group(step);
    this.state.markSubmitted(step);
    group.markAllAsTouched();
    const problems = formProblems(group, STEP_FIELDS[step], FIELD_MESSAGES);
    this.state.problems.set(problems);
    return problems.length === 0;
  }

  private group(step: IndividualStep): FormGroup {
    return this.state.form.controls[step];
  }
}
