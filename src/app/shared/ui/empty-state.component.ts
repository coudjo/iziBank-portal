import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';

/** Says why something is empty and offers the next action (UX 5.4). */
@Component({
  selector: 'ib-empty-state',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span nz-icon [nzType]="icon()" class="icon" aria-hidden="true"></span>
    <h2>{{ title() }}</h2>
    @if (message()) {
      <p>{{ message() }}</p>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--ib-space-6) var(--ib-space-4);
      color: var(--ib-ink-muted);
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
    }
    .icon {
      font-size: 32px;
      color: var(--ib-primary);
      margin-bottom: var(--ib-space-3);
    }
    p {
      max-width: 48ch;
    }
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  readonly icon = input('inbox');
}
