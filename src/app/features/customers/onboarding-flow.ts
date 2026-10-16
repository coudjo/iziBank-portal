import { Signal, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import type { CreatedParty } from '../../core/api/api-types';
import { ApiProblem, isNetworkProblem, toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { FormProblem, applyServerErrors, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import { CustomersClient } from './customers.client';

export interface DuplicateCustomer {
  type: string;
  partyNumber: string;
  partyId: number | null;
  displayName: string | null;
}

export type CheckResult =
  | { kind: 'found'; partyId: number; partyNumber: string; displayName: string }
  | { kind: 'not-found' }
  | { kind: 'failed' };

export interface OnboardingConfig<TStep extends string> {
  steps: readonly TStep[];
  groups: Readonly<Record<TStep, FormGroup>>;
  fields: Readonly<Record<TStep, readonly string[]>>;
  messages: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** The step holding an API field name (validation errors). */
  stepOf: (field: string) => TStep | null;
  /** Problem types that mean "this customer already exists"; the flow goes back to the first step. */
  duplicates: readonly string[];
  /** Other 409s that belong to a step, with the message shown there (for example a member in another group). */
  conflicts?: Readonly<Record<string, TStep>>;
  /** Extra checks before Create that the form validators cannot express. Returns problems for the step. */
  extraChecks?: (step: TStep) => FormProblem[];
  create: () => Promise<CreatedParty>;
  /** UX 3.1 Check now: looks for the customer the lost request may have saved. */
  find: () => Promise<{ partyId: number; partyNumber: string; displayName: string } | null>;
  onCreated: (partyId: number) => void;
  focusStep: () => void;
}

/** What the onboarding frame needs from a flow, independent of its step names. */
export interface OnboardingView {
  readonly step: Signal<number>;
  readonly problems: Signal<FormProblem[]>;
  readonly duplicate: Signal<DuplicateCustomer | null>;
  readonly unconfirmed: Signal<boolean>;
  readonly check: Signal<CheckResult | null>;
  readonly message: Signal<string | null>;
  readonly checking: Signal<boolean>;
  readonly guard: SubmitGuard;
  isLast(): boolean;
  primary(): void;
  back(): void;
  create(): Promise<void>;
  checkNow(): Promise<void>;
  openFound(): void;
}

const SESSION_PROBLEMS = new Set([
  'auth.unauthenticated',
  'auth.session-ended',
  'auth.session-superseded',
  'auth.session-timed-out',
  'auth.session-max-exceeded',
  'auth.session-forced',
]);

/**
 * The onboarding steps and submit outcomes shared by individuals, businesses and groups (frontend plan 7.4, UX 3.1
 * and 6.2 to 6.4). Held by the onboarding page, in memory only.
 */
export class OnboardingFlow<TStep extends string> implements OnboardingView {
  readonly step = signal(0);
  private readonly submitted = signal<Readonly<Record<string, boolean>>>({});
  readonly problems = signal<FormProblem[]>([]);
  readonly duplicate = signal<DuplicateCustomer | null>(null);
  readonly unconfirmed = signal(false);
  readonly check = signal<CheckResult | null>(null);
  readonly message = signal<string | null>(null);
  /** Set once the customer exists, so leaving the page no longer asks. */
  readonly done = signal(false);
  readonly guard = new SubmitGuard();
  private readonly checker = new SubmitGuard();
  readonly checking = this.checker.busy;

  constructor(
    private readonly config: OnboardingConfig<TStep>,
    private readonly client: CustomersClient,
  ) {}

  get steps(): readonly TStep[] {
    return this.config.steps;
  }

  current(): TStep {
    return this.config.steps[this.step()];
  }

  isLast(): boolean {
    return this.step() === this.config.steps.length - 1;
  }

  wasSubmitted(step: TStep): boolean {
    return this.submitted()[step] === true;
  }

  dirty(): boolean {
    return !this.done() && this.config.steps.some((step) => this.config.groups[step].dirty);
  }

  primary(): void {
    if (this.isLast()) {
      void this.create();
    } else if (this.validate(this.current())) {
      this.goTo(this.step() + 1);
    }
  }

  back(): void {
    this.goTo(this.step() - 1);
  }

  goTo(index: number): void {
    this.problems.set([]);
    this.step.set(Math.max(0, Math.min(this.config.steps.length - 1, index)));
    setTimeout(() => this.config.focusStep());
  }

  async create(): Promise<void> {
    const invalid = this.config.steps.find((step) => !this.isValid(step));
    if (invalid) {
      this.goTo(this.config.steps.indexOf(invalid));
      this.validate(invalid);
      return;
    }
    await this.guard.run(async () => {
      this.clearOutcome();
      try {
        const created = await this.config.create();
        this.finish(created.partyId);
      } catch (failure) {
        await this.failed(toApiProblem(failure));
      }
    });
  }

  async checkNow(): Promise<void> {
    await this.checker.run(async () => {
      try {
        const found = await this.config.find();
        this.check.set(found ? { kind: 'found', ...found } : { kind: 'not-found' });
      } catch {
        this.check.set({ kind: 'failed' });
      }
    });
  }

  openFound(): void {
    const check = this.check();
    if (check?.kind === 'found') {
      this.finish(check.partyId);
    }
  }

  reset(): void {
    for (const step of this.config.steps) {
      this.config.groups[step].reset();
    }
    this.step.set(0);
    this.submitted.set({});
    this.problems.set([]);
    this.clearOutcome();
  }

  private clearOutcome(): void {
    this.duplicate.set(null);
    this.unconfirmed.set(false);
    this.check.set(null);
    this.message.set(null);
  }

  private finish(partyId: number): void {
    this.done.set(true);
    this.config.onCreated(partyId);
  }

  private async failed(problem: ApiProblem): Promise<void> {
    if (isNetworkProblem(problem)) {
      this.unconfirmed.set(true);
      return;
    }
    if (this.config.duplicates.includes(problem.type)) {
      await this.showDuplicate(problem.type, String(problem.extensions['existingPartyNumber'] ?? ''));
      return;
    }
    const conflictStep = this.config.conflicts?.[problem.type];
    if (conflictStep) {
      this.goTo(this.config.steps.indexOf(conflictStep));
      this.message.set(messageFor(problem));
      return;
    }
    if (problem.status === 400 && problem.errors) {
      this.showServerErrors(problem.errors);
      return;
    }
    if (SESSION_PROBLEMS.has(problem.type)) {
      this.message.set('Your session ended. Sign in again, then press Create customer again.');
      return;
    }
    const traceId =
      typeof problem.extensions['traceId'] === 'string' ? problem.extensions['traceId'] : undefined;
    this.message.set(messageFor(problem, traceId));
  }

  /** A duplicate stays on step 1 with a panel naming the existing customer; the form is not cleared. */
  private async showDuplicate(type: string, partyNumber: string): Promise<void> {
    this.duplicate.set({ type, partyNumber, partyId: null, displayName: null });
    this.goTo(0);
    try {
      const page = await this.client.search({ q: partyNumber, pageSize: 5 });
      const row = page.items.find((item) => item.partyNumber === partyNumber);
      if (row) {
        this.duplicate.set({ type, partyNumber, partyId: row.partyId, displayName: row.displayName });
      }
    } catch {
      // The panel still names the customer number.
    }
  }

  /** 400: errors land on their fields; the flow jumps to the first step that has one. */
  private showServerErrors(errors: Record<string, string[]>): void {
    const unmatched: FormProblem[] = [];
    for (const [field, messages] of Object.entries(errors)) {
      const step = this.config.stepOf(field);
      if (step) {
        unmatched.push(...applyServerErrors(this.config.groups[step], { [field]: messages }));
      } else if (messages[0]) {
        unmatched.push(...messages.map((message) => ({ field: null, message })));
      }
    }
    const first = this.config.steps.find((step) =>
      Object.keys(errors).some((field) => this.config.stepOf(field) === step),
    );
    if (first) {
      this.goTo(this.config.steps.indexOf(first));
      this.markSubmitted(first);
      this.problems.set([...this.stepProblems(first), ...unmatched]);
    } else {
      this.problems.set(unmatched);
    }
  }

  private validate(step: TStep): boolean {
    this.markSubmitted(step);
    this.config.groups[step].markAllAsTouched();
    const problems = this.stepProblems(step);
    this.problems.set(problems);
    return problems.length === 0;
  }

  private isValid(step: TStep): boolean {
    return this.config.groups[step].valid && (this.config.extraChecks?.(step) ?? []).length === 0;
  }

  private stepProblems(step: TStep): FormProblem[] {
    return [
      ...formProblems(this.config.groups[step], this.config.fields[step], this.config.messages),
      ...(this.config.extraChecks?.(step) ?? []),
    ];
  }

  private markSubmitted(step: TStep): void {
    this.submitted.update((current) => ({ ...current, [step]: true }));
  }
}
