import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface TabLink {
  label: string;
  /** Relative to the page, for example `details`. */
  path: string;
}

/**
 * `ib-tabs` (frontend plan 4.2): route-aware tabs as a list of links, so each tab has its own URL, works with the
 * keyboard and announces the current one with aria-current. Scrolls sideways on narrow screens.
 */
@Component({
  selector: 'ib-tabs',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav [attr.aria-label]="label()">
      <ul>
        @for (tab of tabs(); track tab.path) {
          <li>
            <a [routerLink]="tab.path" routerLinkActive="active" ariaCurrentWhenActive="page">{{
              tab.label
            }}</a>
          </li>
        }
      </ul>
    </nav>
  `,
  styles: `
    nav {
      border-bottom: 1px solid var(--ib-line);
      margin-bottom: var(--ib-space-5);
      overflow-x: auto;
    }
    ul {
      display: flex;
      gap: var(--ib-space-1);
      list-style: none;
      margin: 0;
      padding: 0;
    }
    a {
      display: flex;
      align-items: center;
      min-height: var(--ib-touch-target);
      padding: 0 var(--ib-space-3);
      color: var(--ib-ink-muted);
      text-decoration: none;
      white-space: nowrap;
      border-bottom: 3px solid transparent;
      font-weight: 550;
    }
    a:hover {
      color: var(--ib-primary);
    }
    a.active {
      color: var(--ib-primary);
      border-bottom-color: var(--ib-primary);
    }
  `,
})
export class TabsComponent {
  readonly tabs = input.required<readonly TabLink[]>();
  readonly label = input.required<string>();
}
