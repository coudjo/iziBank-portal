import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { messageFor } from '../../core/errors/error-catalog';
import { ViewportService } from '../../core/layout/viewport.service';
import { BannerComponent, ButtonComponent, ErrorSummaryComponent, StepperComponent } from '../../shared/ui';
import { OnboardingView } from './onboarding-flow';

/**
 * The frame every onboarding flow shares: steps, the duplicate and "could not confirm" panels, the error summary,
 * the step card and the Back / Next / Create bar (sticky on phones). Step content is projected.
 */
@Component({
  selector: 'ib-onboarding-frame',
  imports: [RouterLink, BannerComponent, ButtonComponent, ErrorSummaryComponent, StepperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    form {
      max-width: 60rem;
    }
    .step-title {
      margin-bottom: var(--ib-space-4);
    }
    .step-title:focus {
      outline: none;
    }
    .step-title:focus-visible {
      outline: 2px solid var(--ib-focus);
      outline-offset: 2px;
    }
    .card {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-5);
      margin-bottom: var(--ib-space-4);
    }
    @media (max-width: 767.98px) {
      .card {
        padding: var(--ib-space-4);
      }
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
    .end {
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
      max-width: 60rem;
    }
    .panel h2 {
      font-size: 16px;
      margin-bottom: var(--ib-space-2);
    }
    .panel p {
      margin: 0 0 var(--ib-space-3);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
    }
  `,
  template: `
    <ib-stepper label="Onboarding steps" [steps]="titles()" [current]="flow().step()" />

    @if (flow().duplicate(); as duplicate) {
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

    @if (flow().unconfirmed()) {
      <section class="panel" role="alert" aria-labelledby="unconfirmed-title">
        <h2 id="unconfirmed-title">We could not confirm this was saved</h2>
        @switch (flow().check()?.kind) {
          @case ('found') {
            <p>This customer was saved: {{ found()?.displayName }} ({{ found()?.partyNumber }}).</p>
            <div class="actions">
              <ib-button variant="primary" (click)="flow().openFound()">Open the customer</ib-button>
            </div>
          }
          @case ('not-found') {
            <p>The customer was not saved. You can create it now.</p>
            <div class="actions">
              <ib-button variant="primary" [loading]="flow().guard.busy()" (click)="flow().create()"
                >Try again</ib-button
              >
            </div>
          }
          @case ('failed') {
            <p>We still cannot reach the server. Check the connection, then check again.</p>
            <div class="actions">
              <ib-button variant="primary" [loading]="flow().checking()" (click)="flow().checkNow()"
                >Check now</ib-button
              >
            </div>
          }
          @default {
            <p>Check before trying again.</p>
            <div class="actions">
              <ib-button variant="primary" [loading]="flow().checking()" (click)="flow().checkNow()"
                >Check now</ib-button
              >
            </div>
          }
        }
      </section>
    }

    @if (flow().message(); as message) {
      <ib-banner tone="danger" [message]="message" />
    }

    <form (submit)="$event.preventDefault(); flow().primary()" novalidate>
      <ib-error-summary [problems]="flow().problems()" />
      <div class="card">
        <h2 class="step-title" tabindex="-1" #stepTitle>{{ titles()[flow().step()] }}</h2>
        <ng-content />
      </div>
      <div class="bar" [class.bar--phone]="phone()">
        @if (flow().step() > 0) {
          <ib-button (click)="flow().back()">Back</ib-button>
        } @else {
          <ib-button variant="quiet" (click)="cancelled.emit()">Cancel</ib-button>
        }
        <div class="end">
          @if (flow().isLast()) {
            <ib-button variant="primary" type="submit" [loading]="flow().guard.busy()"
              >Create customer</ib-button
            >
          } @else {
            <ib-button variant="primary" type="submit">Next</ib-button>
          }
        </div>
      </div>
    </form>
  `,
})
export class OnboardingFrameComponent {
  readonly flow = input.required<OnboardingView>();
  readonly titles = input.required<readonly string[]>();
  readonly cancelled = output<void>();

  private readonly stepTitle = viewChild.required<ElementRef<HTMLElement>>('stepTitle');
  private readonly viewport = inject(ViewportService);
  protected readonly phone = computed(() => this.viewport.size() === 'phone');
  protected readonly found = computed(() => {
    const check = this.flow().check();
    return check?.kind === 'found' ? check : null;
  });
  protected readonly duplicateMessage = computed(() => {
    const duplicate = this.flow().duplicate();
    if (!duplicate) {
      return '';
    }
    return messageFor(
      { type: duplicate.type, extensions: { existingPartyNumber: duplicate.partyNumber } },
      undefined,
      duplicate.displayName ? { name: duplicate.displayName } : {},
    );
  });

  /** Called by the flow after each step change. */
  focusStep(): void {
    this.stepTitle().nativeElement.focus();
  }
}
