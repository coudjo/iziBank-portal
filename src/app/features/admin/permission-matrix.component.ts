import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ModuleView, PermissionGrant } from '../../core/api/api-types';
import { IconComponent } from '../../shared/ui';
import {
  ACTIONS,
  ActionKey,
  MatrixRow,
  NamedGrants,
  allowed,
  grantedBy,
  matrixRows,
  rowKey,
  setFlag,
  stored,
  union,
} from './permission-matrix';

/**
 * The permissions matrix (UX 6.10 step 2): modules and sub-modules against View, Add, Edit, Delete and Approve.
 * Editable for a role group (one checkbox per cell), or read-only for a staff member's groups in a branch, with a
 * "Granted by" column naming the group behind each permission. A tick is an icon plus text, never colour alone.
 */
@Component({
  selector: 'ib-permission-matrix',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .scroll {
      overflow-x: auto;
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      background: var(--ib-surface);
    }
    .scroll:focus-visible {
      outline: 2px solid var(--ib-focus);
      outline-offset: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    caption {
      text-align: left;
      padding: var(--ib-space-2) var(--ib-space-3);
      font-weight: 600;
    }
    th,
    td {
      padding: var(--ib-space-1) var(--ib-space-2);
      border-top: 1px solid var(--ib-line);
      text-align: center;
      white-space: nowrap;
    }
    thead th {
      background: var(--ib-surface-subtle);
      font-weight: 600;
    }
    th[scope='row'] {
      text-align: left;
      font-weight: 500;
      min-width: 12rem;
    }
    tr.module th[scope='row'] {
      font-weight: 650;
    }
    tr.module {
      background: var(--ib-surface-subtle);
    }
    td.by {
      text-align: left;
      white-space: normal;
      color: var(--ib-ink-muted);
      min-width: 12rem;
    }
    label.cell {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: var(--ib-touch-target);
      min-height: var(--ib-touch-target);
      cursor: pointer;
    }
    input[type='checkbox'] {
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .yes {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      color: var(--ib-success-text);
      font-weight: 600;
    }
    .no {
      color: var(--ib-ink-meta);
    }
  `,
  template: `
    <div class="scroll" tabindex="0" role="region" [attr.aria-label]="caption()">
      <table>
        <caption class="ib-visually-hidden">
          {{
            caption()
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Area</th>
            @for (action of actions; track action.key) {
              <th scope="col">{{ action.label }}</th>
            }
            @if (!editable() && showGrantedBy()) {
              <th scope="col">Granted by</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track key(row)) {
            <tr [class.module]="row.subModuleCode === null">
              <th scope="row">{{ row.label }}</th>
              @for (action of actions; track action.key) {
                <td>
                  @if (editable()) {
                    <label class="cell">
                      <input
                        type="checkbox"
                        [checked]="isStored(row, action.key)"
                        [disabled]="disabled()"
                        [attr.aria-label]="action.label + ' on ' + row.label"
                        (change)="toggle(row, action.key, $event)"
                      />
                    </label>
                  } @else if (isAllowed(row, action.key)) {
                    <span class="yes"><ib-icon name="check" />Yes</span>
                  } @else {
                    <span class="no" aria-hidden="true">–</span><span class="ib-visually-hidden">No</span>
                  }
                </td>
              }
              @if (!editable() && showGrantedBy()) {
                <td class="by">{{ by(row) }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class PermissionMatrixComponent {
  readonly modules = input.required<readonly ModuleView[]>();
  readonly caption = input('Permissions');
  /** Edit mode: the role group's own permissions. */
  readonly grants = input<readonly PermissionGrant[]>([]);
  readonly editable = input(false);
  readonly disabled = input(false);
  /** Read-only mode: the groups whose permissions add up (a staff member's groups in one branch). */
  readonly groups = input<readonly NamedGrants[]>([]);
  /** Read-only mode: add the "Granted by" column (off when there is only one group). */
  readonly showGrantedBy = input(true);
  readonly grantsChange = output<PermissionGrant[]>();

  protected readonly actions = ACTIONS;
  protected readonly rows = computed(() => matrixRows(this.modules()));
  private readonly combined = computed(() => union(this.groups()));

  protected key(row: MatrixRow): string {
    return rowKey(row);
  }

  protected isStored(row: MatrixRow, action: ActionKey): boolean {
    return stored(this.grants(), row, action);
  }

  protected isAllowed(row: MatrixRow, action: ActionKey): boolean {
    return allowed(this.combined(), row, action);
  }

  protected by(row: MatrixRow): string {
    const parts = this.groups()
      .map((group) => ({
        name: group.name,
        labels: ACTIONS.filter((action) => grantedBy([group], row, action.key).length > 0).map(
          (action) => action.label,
        ),
      }))
      .filter((part) => part.labels.length > 0)
      .map((part) => `${part.name}: ${part.labels.join(', ')}`);
    return parts.length > 0 ? parts.join('; ') : '—';
  }

  protected toggle(row: MatrixRow, action: ActionKey, event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.grantsChange.emit(setFlag(this.grants(), row, action, on));
  }
}
