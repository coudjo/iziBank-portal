import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ViewportService } from '../../core/layout/viewport.service';

/**
 * `ib-stepper` (frontend plan 4.2): desktop and tablet show every step in a row; phones show "Step 2 of 3" so each
 * step has the whole screen. The current step is marked with aria-current.
 */
@Component({
  selector: 'ib-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (phone()) {
      <p class="compact">Step {{ current() + 1 }} of {{ steps().length }}</p>
    } @else {
      <ol [attr.aria-label]="label()">
        @for (step of steps(); track step; let index = $index) {
          <li
            [class.done]="index < current()"
            [class.current]="index === current()"
            [attr.aria-current]="index === current() ? 'step' : null"
          >
            <span class="number" aria-hidden="true">{{ index < current() ? '✓' : index + 1 }}</span>
            <span>{{ step }}</span>
            @if (index < current()) {
              <span class="ib-visually-hidden">(done)</span>
            }
          </li>
        }
      </ol>
    }
  `,
  styles: `
    ol {
      display: flex;
      gap: var(--ib-space-4);
      list-style: none;
      margin: 0 0 var(--ib-space-5);
      padding: 0;
      counter-reset: step;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
      color: var(--ib-ink-muted);
      font-weight: 550;
    }
    li + li::before {
      content: '';
      width: 32px;
      height: 1px;
      background: var(--ib-border-control);
      margin-right: var(--ib-space-2);
    }
    .number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1px solid var(--ib-border-control);
      background: var(--ib-surface);
      font-variant-numeric: tabular-nums;
    }
    .current {
      color: var(--ib-ink);
    }
    .current .number {
      background: var(--ib-primary);
      border-color: var(--ib-primary);
      color: var(--ib-surface);
    }
    .done .number {
      border-color: var(--ib-success-text);
      color: var(--ib-success-text);
    }
    .compact {
      margin: 0 0 var(--ib-space-2);
      color: var(--ib-ink-muted);
      font-weight: 550;
    }
  `,
})
export class StepperComponent {
  readonly steps = input.required<readonly string[]>();
  readonly current = input.required<number>();
  readonly label = input('Steps');

  protected readonly phone = computed(() => this.viewport.size() === 'phone');
  private readonly viewport = inject(ViewportService);
}
