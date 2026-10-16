import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  untracked,
} from '@angular/core';
import type { FormProblem } from '../forms/form-errors';

/**
 * `ib-error-summary` (UX 5.3): lists every problem at the top of the form. Each item moves focus to its field.
 * The summary takes focus when it appears, so set `problems` on submit, not on every keystroke.
 */
@Component({
  selector: 'ib-error-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (problems().length > 0) {
      <div class="summary" role="alert" tabindex="-1" aria-labelledby="ib-error-summary-title">
        <h2 id="ib-error-summary-title">{{ title() }}</h2>
        <ul>
          @for (problem of problems(); track $index) {
            <li>
              @if (problem.field) {
                <button type="button" class="link" (click)="focusField(problem.field)">
                  {{ problem.message }}
                </button>
              } @else {
                {{ problem.message }}
              }
            </li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    .summary {
      border: 2px solid var(--ib-danger-text);
      border-radius: var(--ib-radius-md);
      background: var(--ib-surface);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-5);
    }
    h2 {
      font-size: 16px;
      margin-bottom: var(--ib-space-2);
    }
    ul {
      margin: 0;
      padding-left: var(--ib-space-5);
      color: var(--ib-danger-text);
    }
    li + li {
      margin-top: var(--ib-space-1);
    }
    .link {
      font: inherit;
      color: var(--ib-danger-text);
      background: none;
      border: 0;
      padding: 0;
      text-align: left;
      text-decoration: underline;
      cursor: pointer;
      min-height: 24px;
    }
  `,
})
export class ErrorSummaryComponent {
  readonly problems = input<readonly FormProblem[]>([]);
  readonly title = input('There is a problem');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect(() => {
      if (this.problems().length > 0) {
        untracked(() => this.host.nativeElement.querySelector<HTMLElement>('.summary')?.focus());
      }
    });
  }

  protected focusField(field: string): void {
    const scope = this.host.nativeElement.closest('form') ?? document;
    const target = scope.querySelector<HTMLElement>(`[formcontrolname="${field}"], [data-field="${field}"]`);
    const focusable = target?.matches('input, select, textarea, button')
      ? target
      : target?.querySelector<HTMLElement>('input, select, textarea, button');
    focusable?.focus();
    focusable?.scrollIntoView({ block: 'center' });
  }
}
