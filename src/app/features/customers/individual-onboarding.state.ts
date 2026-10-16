import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/config/config.service';
import { InMemoryStores } from '../../core/session/in-memory-stores';
import type { FormProblem } from '../../shared/forms/form-errors';
import { IndividualStep, createIndividualForm } from './individual-form';

export interface DuplicateCustomer {
  partyNumber: string;
  partyId: number | null;
  displayName: string | null;
}

export type CheckResult =
  | { kind: 'found'; partyId: number; partyNumber: string; displayName: string }
  | { kind: 'not-found' }
  | { kind: 'failed' };

/**
 * Onboarding state (frontend plan 6.5): provided by the onboarding page, kept in memory only, so steps and the
 * re-sign-in dialog never lose what was entered. Cleared when a different person signs in.
 */
@Injectable()
export class IndividualOnboardingState implements OnDestroy {
  readonly minimumAge = inject(ConfigService).config.minimumCustomerAgeYears ?? 18;
  readonly form = createIndividualForm(this.minimumAge);
  readonly step = signal(0);
  readonly submitted = signal<Readonly<Record<IndividualStep, boolean>>>({
    identity: false,
    contact: false,
    funds: false,
  });
  readonly problems = signal<FormProblem[]>([]);
  readonly duplicate = signal<DuplicateCustomer | null>(null);
  /** UX 3.1: the create request was sent but no answer came back. */
  readonly unconfirmed = signal(false);
  readonly check = signal<CheckResult | null>(null);
  readonly message = signal<string | null>(null);
  /** Set once the customer exists, so leaving the page no longer asks. */
  readonly done = signal(false);

  private readonly unregister = inject(InMemoryStores).register(() => this.reset());

  ngOnDestroy(): void {
    this.unregister();
  }

  markSubmitted(step: IndividualStep): void {
    this.submitted.update((current) => ({ ...current, [step]: true }));
  }

  clearOutcome(): void {
    this.duplicate.set(null);
    this.unconfirmed.set(false);
    this.check.set(null);
    this.message.set(null);
  }

  private reset(): void {
    this.form.reset();
    this.step.set(0);
    this.submitted.set({ identity: false, contact: false, funds: false });
    this.problems.set([]);
    this.clearOutcome();
  }
}
