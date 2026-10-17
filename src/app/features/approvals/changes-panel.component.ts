import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FieldChange } from './json-diff';

/** "Changes since last approval" (UX 6.6 step 3): each field with its old and new value side by side. */
@Component({
  selector: 'ib-changes-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      text-align: left;
      vertical-align: top;
      padding: var(--ib-space-2) var(--ib-space-3) var(--ib-space-2) 0;
      border-bottom: 1px solid var(--ib-line);
      overflow-wrap: anywhere;
    }
    th {
      font-size: 13px;
      color: var(--ib-ink-muted);
    }
    ul {
      margin: 0;
      padding-left: var(--ib-space-4);
    }
    .removed {
      color: var(--ib-danger-text);
    }
    .added {
      color: var(--ib-success-text);
    }
    .empty {
      color: var(--ib-ink-muted);
      margin: 0;
    }
  `,
  template: `
    @if (changes().length === 0) {
      <p class="empty">No field changes.</p>
    } @else {
      <table>
        <caption class="ib-visually-hidden">
          {{
            caption()
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          @for (change of changes(); track change.field) {
            <tr>
              <th scope="row">{{ change.field }}</th>
              @if (change.removed || change.added) {
                <td>
                  @if (change.removed?.length) {
                    <ul class="removed" aria-label="Removed">
                      @for (item of change.removed; track item) {
                        <li>
                          <span aria-hidden="true">− </span>{{ item
                          }}<span class="ib-visually-hidden"> (removed)</span>
                        </li>
                      }
                    </ul>
                  } @else {
                    —
                  }
                </td>
                <td>
                  @if (change.added?.length) {
                    <ul class="added" aria-label="Added">
                      @for (item of change.added; track item) {
                        <li>
                          <span aria-hidden="true">+ </span>{{ item
                          }}<span class="ib-visually-hidden"> (added)</span>
                        </li>
                      }
                    </ul>
                  } @else {
                    —
                  }
                </td>
              } @else {
                <td>{{ change.before }}</td>
                <td>{{ change.after }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class ChangesPanelComponent {
  readonly changes = input.required<readonly FieldChange[]>();
  readonly caption = input('Changes');
}
