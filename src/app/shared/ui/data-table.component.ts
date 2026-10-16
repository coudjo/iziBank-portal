import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChild,
  contentChildren,
  inject,
  input,
  output,
} from '@angular/core';
import { ViewportService } from '../../core/layout/viewport.service';
import { ButtonComponent } from './button.component';

export interface RowContext<T> {
  $implicit: T;
}

/** A table column: `<ng-template ibColumn header="Name" let-row>…</ng-template>`. */
@Directive({ selector: 'ng-template[ibColumn]' })
export class ColumnDirective<T = unknown> {
  readonly header = input.required<string>({ alias: 'ibColumn' });
  readonly align = input<'start' | 'end'>('start');
  /** Set on the one sortable column; the table shows the direction and emits `sortChange`. */
  readonly sortable = input(false);
  readonly template = inject<TemplateRef<RowContext<T>>>(TemplateRef);
}

/** The card shown for each row below desktop width: `<ng-template ibCard let-row>…</ng-template>`. */
@Directive({ selector: 'ng-template[ibCard]' })
export class CardDirective<T = unknown> {
  readonly template = inject<TemplateRef<RowContext<T>>>(TemplateRef);
}

/** Shown instead of the table when there are no rows. */
@Directive({ selector: 'ng-template[ibEmpty]' })
export class EmptyDirective {
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}

/**
 * `ib-data-table` (frontend plan 4.2, UX 5.4): server paging, one sortable column, and cards below desktop width
 * (frontend plan 4.3). Rows open through a link inside the row; mark it with `class="ib-row-link"` and the whole row
 * becomes clickable for the mouse while keyboards still use the link (ADR 0003).
 */
@Component({
  selector: 'ib-data-table',
  imports: [NgTemplateOutlet, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [attr.aria-busy]="loading() ? 'true' : null">
      @if (!loading() && rows().length === 0 && empty()) {
        <ng-container [ngTemplateOutlet]="empty()!.template" />
      } @else if (cards() && card()) {
        <ul class="cards" [attr.aria-label]="caption()">
          @for (row of rows(); track trackBy()(row)) {
            <li class="card">
              <ng-container
                [ngTemplateOutlet]="card()!.template"
                [ngTemplateOutletContext]="{ $implicit: row }"
              />
            </li>
          }
          @if (loading() && rows().length === 0) {
            @for (row of placeholders; track row) {
              <li class="card card--loading" aria-hidden="true"><span class="bar"></span></li>
            }
          }
        </ul>
      } @else {
        <table>
          <caption class="ib-visually-hidden">
            {{
              caption()
            }}
          </caption>
          <thead>
            <tr>
              @for (column of columns(); track column.header()) {
                <th
                  scope="col"
                  [class.end]="column.align() === 'end'"
                  [attr.aria-sort]="column.sortable() ? (descending() ? 'descending' : 'ascending') : null"
                >
                  @if (column.sortable()) {
                    <button type="button" class="sort" (click)="sortChange.emit(!descending())">
                      {{ column.header() }}
                      <span aria-hidden="true">{{ descending() ? '↓' : '↑' }}</span>
                      <span class="ib-visually-hidden">{{
                        descending()
                          ? 'newest first, select to show oldest first'
                          : 'oldest first, select to show newest first'
                      }}</span>
                    </button>
                  } @else {
                    {{ column.header() }}
                  }
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track trackBy()(row)) {
              <tr>
                @for (column of columns(); track column.header()) {
                  <td [class.end]="column.align() === 'end'">
                    <ng-container
                      [ngTemplateOutlet]="column.template"
                      [ngTemplateOutletContext]="{ $implicit: row }"
                    />
                  </td>
                }
              </tr>
            }
            @if (loading() && rows().length === 0) {
              @for (row of placeholders; track row) {
                <tr aria-hidden="true">
                  <td [attr.colspan]="columns().length"><span class="bar"></span></td>
                </tr>
              }
            }
          </tbody>
        </table>
      }

      @if (total() > pageSize()) {
        <nav class="pager" [attr.aria-label]="caption() + ' pages'">
          <p class="count" aria-live="polite">{{ range() }}</p>
          <div class="buttons">
            <ib-button [disabled]="page() <= 1 || loading()" (click)="pageChange.emit(page() - 1)"
              >Previous</ib-button
            >
            <ib-button [disabled]="page() >= pages() || loading()" (click)="pageChange.emit(page() + 1)"
              >Next</ib-button
            >
          </div>
        </nav>
      } @else if (rows().length > 0) {
        <p class="count" aria-live="polite">{{ range() }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
    }
    th,
    td {
      text-align: left;
      padding: var(--ib-space-3) var(--ib-space-4);
      border-bottom: 1px solid var(--ib-line);
      vertical-align: middle;
    }
    th {
      font-weight: 600;
      color: var(--ib-ink-muted);
      background: var(--ib-surface-subtle);
      font-size: 13px;
    }
    .end {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    tbody tr {
      position: relative;
    }
    tbody tr:hover {
      background: var(--ib-surface-subtle);
    }
    .sort {
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
      min-height: 24px;
    }
    .cards {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--ib-space-3);
    }
    .card {
      position: relative;
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
      box-shadow: var(--ib-elevation-card);
    }
    .bar {
      display: block;
      height: 14px;
      border-radius: var(--ib-radius-sm);
      background: var(--ib-surface-subtle);
    }
    .card--loading {
      min-height: 72px;
    }
    .pager {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-3);
      margin-top: var(--ib-space-3);
    }
    .buttons {
      display: flex;
      gap: var(--ib-space-2);
    }
    .count {
      margin: var(--ib-space-3) 0 0;
      color: var(--ib-ink-muted);
    }
    .pager .count {
      margin: 0;
    }
    :host ::ng-deep .ib-row-link::after {
      content: '';
      position: absolute;
      inset: 0;
    }
  `,
})
export class DataTableComponent<T> {
  readonly rows = input.required<readonly T[]>();
  readonly caption = input.required<string>();
  readonly total = input(0);
  readonly page = input(1);
  readonly pageSize = input(25);
  readonly loading = input(false);
  readonly descending = input(true);
  readonly trackBy = input<(row: T) => unknown>((row) => row);

  readonly pageChange = output<number>();
  /** True when the user asks for newest first. */
  readonly sortChange = output<boolean>();

  protected readonly columns = contentChildren(ColumnDirective);
  protected readonly card = contentChild(CardDirective);
  protected readonly empty = contentChild(EmptyDirective);
  protected readonly placeholders = [1, 2, 3];

  private readonly viewport = inject(ViewportService);
  protected readonly cards = computed(() => this.viewport.size() !== 'desktop');
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly range = computed(() => {
    const first = (this.page() - 1) * this.pageSize() + 1;
    const last = first + this.rows().length - 1;
    return `Showing ${first} to ${last} of ${this.total()}`;
  });
}
