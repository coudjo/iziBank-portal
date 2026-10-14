import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One h1 per page (frontend plan 4.4). The h1 takes focus after navigation. */
@Component({
  selector: 'ib-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <div class="titles">
        <ng-content select="[ibBreadcrumb]" />
        <h1 tabindex="-1" data-page-title>{{ title() }}</h1>
        @if (subtitle()) {
          <p class="subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="actions"><ng-content select="[ibActions]" /></div>
    </div>
  `,
  styles: `
    .header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--ib-space-3);
      margin-bottom: var(--ib-space-5);
    }
    h1:focus {
      outline: none;
    }
    h1:focus-visible {
      outline: 2px solid var(--ib-focus);
      outline-offset: 2px;
    }
    .subtitle {
      margin: var(--ib-space-1) 0 0;
      color: var(--ib-ink-muted);
    }
    .actions {
      display: flex;
      gap: var(--ib-space-2);
    }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
}
