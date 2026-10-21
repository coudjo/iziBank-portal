import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import type { LookupRow, LookupTypeInfo } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import {
  BannerComponent,
  ButtonComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  DialogService,
  EmptyDirective,
  EmptyStateComponent,
  FormControlDirective,
  FormFieldComponent,
  IconComponent,
  InputDirective,
  PageHeaderComponent,
  StatusChipComponent,
  ToastService,
} from '../../shared/ui';
import { ReferenceBackComponent } from './back-link.component';
import type { LookupDialogData } from './lookup.dialog';
import { lookupName } from './reference-rules';
import { ReferenceClient } from './reference.client';

/**
 * Lookups (UX 7.7): one list at a time, chosen from all the lists the API has. No delete, deactivate only; system
 * values show a lock and cannot be deactivated. The chosen list is in the URL (`/reference/lookups/genders`).
 */
@Component({
  selector: 'ib-lookups-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    EmptyDirective,
    EmptyStateComponent,
    FormControlDirective,
    FormFieldComponent,
    IconComponent,
    InputDirective,
    PageHeaderComponent,
    ReferenceBackComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .pick {
      max-width: 24rem;
    }
    .code {
      display: inline-flex;
      align-items: center;
      gap: var(--ib-space-1);
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-1);
      font-weight: 600;
    }
    .meta {
      margin: 0 0 var(--ib-space-2);
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    <ib-reference-back />
    <ib-page-header title="Lookups">
      <div ibActions>
        @if (canAdd() && slug()) {
          <ib-button variant="primary" icon="plus" (click)="edit(null)">Add value</ib-button>
        }
      </div>
    </ib-page-header>
    <ib-form-field label="List" class="pick">
      <select ibInput ibControl [value]="slug() ?? ''" (change)="pick($event)">
        <option value="" disabled [selected]="!slug()">Choose a list</option>
        @for (type of types(); track type.slug) {
          <option [value]="type.slug" [selected]="type.slug === slug()">{{ name(type.slug) }}</option>
        }
      </select>
    </ib-form-field>
    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
    } @else if (slug(); as current) {
      <ib-data-table
        [caption]="name(current)"
        [rows]="rows()"
        [total]="rows().length"
        [page]="1"
        [pageSize]="100"
        [loading]="loading()"
        [trackBy]="track"
      >
        <ng-template ibColumn="Code" let-row>
          <span class="code ib-num">
            @if (row.isCoded) {
              <ib-icon name="lock" /><span class="ib-visually-hidden">System value </span>
            }
            {{ row.code }}</span
          >
        </ng-template>
        <ng-template ibColumn="Name" let-row>{{ row.name }}</ng-template>
        <ng-template ibColumn="Status" let-row>
          <ib-status-chip domain="record" [code]="row.isActive ? 'ACTIVE' : 'INACTIVE'" />
        </ng-template>
        <ng-template ibColumn="Action" align="end" let-row>
          @if (canEdit()) {
            <ib-button (click)="edit(row)"
              >Edit<span class="ib-visually-hidden"> {{ row.name }}</span></ib-button
            >
          }
        </ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            <span>{{ row.name }}</span>
            <span class="code ib-num">
              @if (row.isCoded) {
                <ib-icon name="lock" /><span class="ib-visually-hidden">System value </span>
              }
              {{ row.code }}</span
            >
          </div>
          <ib-status-chip domain="record" [code]="row.isActive ? 'ACTIVE' : 'INACTIVE'" />
          @if (canEdit()) {
            <ib-button (click)="edit(row)"
              >Edit<span class="ib-visually-hidden"> {{ row.name }}</span></ib-button
            >
          }
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state title="No values" message="Values you add appear here." icon="setting" />
        </ng-template>
      </ib-data-table>
      <p class="meta">
        <ib-icon name="lock" /> System value: the code is used by the system, so it cannot be deactivated.
      </p>
    }
  `,
})
export class LookupsPage {
  /** Route parameter `:slug`, absent on `/reference/lookups`. */
  readonly slug = input<string>();

  private readonly client = inject(ReferenceClient);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly types = signal<LookupTypeInfo[]>([]);
  protected readonly rows = signal<LookupRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canAdd = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'LOOKUPS', action: 'add' }),
  );
  protected readonly canEdit = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'LOOKUPS', action: 'edit' }),
  );

  constructor() {
    this.client.lookupTypes().then(
      (types) =>
        this.types.set([...types].sort((a, b) => (lookupName(a.slug) < lookupName(b.slug) ? -1 : 1))),
      (failure) => this.error.set(messageFor(toApiProblem(failure))),
    );
    effect(() => {
      const slug = this.slug();
      untracked(() => (slug ? void this.load(slug) : this.rows.set([])));
    });
  }

  private async load(slug: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.client.lookup(slug);
      if (slug === this.slug()) {
        this.rows.set(rows);
      }
    } catch (failure) {
      this.error.set(messageFor(toApiProblem(failure)));
    } finally {
      this.loading.set(false);
    }
  }

  protected pick(event: Event): void {
    const slug = (event.target as HTMLSelectElement).value;
    void this.router.navigate(['/reference', 'lookups', slug]);
  }

  protected name(slug: string): string {
    return lookupName(slug);
  }

  protected async edit(row: LookupRow | null): Promise<void> {
    const slug = this.slug();
    if (!slug) {
      return;
    }
    const { LookupDialogComponent } = await import('./lookup.dialog');
    const ref = await this.dialogs.open<
      InstanceType<typeof LookupDialogComponent>,
      LookupDialogData,
      boolean
    >(
      LookupDialogComponent,
      { slug, listName: lookupName(slug), row },
      { title: row ? `Edit ${row.name}` : `Add to ${lookupName(slug)}` },
    );
    ref.afterClose.subscribe((saved) => {
      if (saved) {
        this.toast.success(row ? 'Value saved.' : 'Value added.');
        void this.load(slug);
      }
    });
  }

  protected track(row: LookupRow): number {
    return row.id;
  }
}
