import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { isNetworkProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { ButtonComponent } from '../ui/button.component';
import { UploadTask } from './upload-task';

/** Progress, Cancel and Retry for an `UploadTask`. Announces the outcome. */
@Component({
  selector: 'ib-upload-status',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      margin-top: var(--ib-space-3);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ib-space-3);
    }
    progress {
      flex: 1 1 12rem;
      height: 10px;
      accent-color: var(--ib-primary);
    }
    .error {
      margin: 0;
      color: var(--ib-danger-text);
      flex: 1 1 100%;
    }
  `,
  template: `
    <div aria-live="polite">
      @switch (task().state()) {
        @case ('uploading') {
          <div class="row">
            <progress max="100" [value]="task().percent()" [attr.aria-label]="'Uploading ' + label()">
              {{ task().percent() }}%
            </progress>
            <span>{{ task().percent() }}%</span>
            <ib-button (click)="task().cancel()">Cancel upload</ib-button>
          </div>
        }
        @case ('failed') {
          <div class="row">
            <p class="error" role="alert">{{ failure() }}</p>
            @if (retryable()) {
              <ib-button variant="primary" (click)="task().retry()">Retry upload</ib-button>
            }
          </div>
        }
        @case ('cancelled') {
          <div class="row">
            <span>Upload cancelled. The file is still here.</span>
            <ib-button (click)="task().retry()">Upload again</ib-button>
          </div>
        }
      }
    </div>
  `,
})
export class UploadStatusComponent {
  readonly task = input.required<UploadTask>();
  readonly label = input('file');

  protected readonly failure = computed(() => {
    const problem = this.task().problem();
    if (!problem) {
      return '';
    }
    return isNetworkProblem(problem)
      ? 'The upload did not finish. The file is still here, so you can retry without capturing it again.'
      : messageFor(problem);
  });
  /** Network failures and timeouts can be retried; a refused file needs a new capture. */
  protected readonly retryable = computed(() => {
    const problem = this.task().problem();
    return (
      !!problem &&
      (isNetworkProblem(problem) || problem.status >= 500 || problem.type === 'idempotency.in-progress')
    );
  });
}
