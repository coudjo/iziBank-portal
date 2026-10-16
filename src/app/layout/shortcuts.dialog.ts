import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Keyboard shortcuts help (UX 5.9), opened with `?`. */
@Component({
  selector: 'ib-shortcuts-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      text-align: left;
      padding: var(--ib-space-2) 0;
      border-bottom: 1px solid var(--ib-line);
    }
    th {
      font-size: 13px;
      color: var(--ib-ink-muted);
    }
    kbd {
      display: inline-block;
      min-width: 1.6em;
      padding: 1px 6px;
      border: 1px solid var(--ib-border-control);
      border-radius: var(--ib-radius-sm);
      font-family: inherit;
      font-size: 13px;
      text-align: center;
      background: var(--ib-surface-subtle);
    }
  `,
  template: `
    <table>
      <caption class="ib-visually-hidden">
        Keyboard shortcuts
      </caption>
      <thead>
        <tr>
          <th scope="col">Key</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><kbd>/</kbd> or <kbd>Ctrl</kbd> + <kbd>K</kbd></td>
          <td>Search customers or accounts</td>
        </tr>
        <tr>
          <td><kbd>Alt</kbd> + <kbd>N</kbd></td>
          <td>New customer on the customer screens</td>
        </tr>
        <tr>
          <td><kbd>Esc</kbd></td>
          <td>Close a dialog or overlay</td>
        </tr>
        <tr>
          <td><kbd>Enter</kbd></td>
          <td>Submit the focused form or confirm the default dialog action</td>
        </tr>
        <tr>
          <td><kbd>?</kbd></td>
          <td>Show this list</td>
        </tr>
      </tbody>
    </table>
  `,
})
export class ShortcutsDialogComponent {}
