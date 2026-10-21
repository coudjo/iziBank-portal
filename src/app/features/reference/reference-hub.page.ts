import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PermissionService } from '../../core/permissions/permission.service';
import { IconComponent, PageHeaderComponent } from '../../shared/ui';
import { REFERENCE_SCREENS } from './reference-rules';

/** Administration > Reference (UX 7.7): one card per screen this user may open. */
@Component({
  selector: 'ib-reference-hub-page',
  imports: [RouterLink, IconComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
      gap: var(--ib-space-3);
    }
    a {
      display: flex;
      gap: var(--ib-space-3);
      align-items: flex-start;
      height: 100%;
      padding: var(--ib-space-4);
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      color: var(--ib-ink);
      text-decoration: none;
    }
    a:hover {
      border-color: var(--ib-primary);
    }
    a:focus-visible {
      outline: 2px solid var(--ib-focus);
      outline-offset: 2px;
    }
    .label {
      display: block;
      font-weight: 650;
      color: var(--ib-primary);
      margin-bottom: var(--ib-space-1);
    }
    .description {
      color: var(--ib-ink-muted);
    }
    ib-icon {
      font-size: 20px;
      color: var(--ib-primary);
    }
  `,
  template: `
    <ib-page-header title="Reference data" />
    <ul aria-label="Reference data">
      @for (screen of screens(); track screen.path) {
        <li>
          <a [routerLink]="screen.link">
            <ib-icon [name]="screen.icon" />
            <span>
              <span class="label">{{ screen.label }}</span>
              <span class="description">{{ screen.description }}</span>
            </span>
          </a>
        </li>
      }
    </ul>
  `,
})
export class ReferenceHubPage {
  private readonly permissions = inject(PermissionService);
  protected readonly screens = computed(() =>
    REFERENCE_SCREENS.filter((screen) => this.permissions.can(screen.permission)),
  );
}
