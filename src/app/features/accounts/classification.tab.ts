import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { AccountClassificationView, ClassificationOption } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  ToastService,
} from '../../shared/ui';
import { AccountRecordStore } from './account-record.store';
import { AccountsClient } from './accounts.client';

/**
 * Classification tab (UX 6.8, 7.4): the account's classifications, added and removed inline. A sub-classification
 * must belong to the chosen classification; each classification is assigned once.
 */
@Component({
  selector: 'ib-account-classification-tab',
  imports: [BannerComponent, ButtonComponent, FormControlDirective, FormFieldComponent, InputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
    }
    ul {
      list-style: none;
      margin: 0 0 var(--ib-space-4);
      padding: 0;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      padding: var(--ib-space-2) 0;
      border-top: 1px solid var(--ib-line);
    }
    li:first-child {
      border-top: 0;
    }
    .name {
      font-weight: 600;
    }
    .empty {
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-ink-muted);
    }
    form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
      gap: 0 var(--ib-space-3);
      align-items: end;
    }
    @media (max-width: 767.98px) {
      form {
        grid-template-columns: 1fr;
      }
    }
    form ib-button {
      margin-bottom: var(--ib-space-4);
    }
  `,
  template: `
    <section aria-label="Classification">
      @if (message(); as text) {
        <ib-banner tone="danger" [message]="text" />
      }
      @if (rows().length === 0) {
        <p class="empty">No classifications yet.</p>
      } @else {
        <ul aria-label="Classifications">
          @for (row of rows(); track row.assignmentId) {
            <li>
              <span
                ><span class="name">{{ row.classificationName }}</span>
                @if (row.subClassificationName) {
                  · {{ row.subClassificationName }}
                }
              </span>
              @if (canEdit()) {
                <ib-button variant="quiet" icon="close" (click)="remove(row)"
                  >Remove<span class="ib-visually-hidden"> {{ row.classificationName }}</span></ib-button
                >
              }
            </li>
          }
        </ul>
      }
      @if (canEdit() && available().length > 0) {
        <form (submit)="$event.preventDefault(); add()" novalidate>
          <ib-form-field label="Classification" [error]="error()">
            <select ibInput ibControl (change)="pick($event)">
              <option value="" [selected]="chosen() === null">Choose</option>
              @for (option of available(); track option.accountClassificationId) {
                <option
                  [value]="option.accountClassificationId"
                  [selected]="chosen() === option.accountClassificationId"
                >
                  {{ option.classificationName }}
                </option>
              }
            </select>
          </ib-form-field>
          <ib-form-field label="Sub-classification">
            <select ibInput ibControl [disabled]="subs().length === 0" (change)="pickSub($event)">
              <option value="" [selected]="sub() === null">None</option>
              @for (option of subs(); track option.accountSubClassificationId) {
                <option
                  [value]="option.accountSubClassificationId"
                  [selected]="sub() === option.accountSubClassificationId"
                >
                  {{ option.subClassificationName }}
                </option>
              }
            </select>
          </ib-form-field>
          <ib-button type="submit" icon="plus" [loading]="guard.busy()">Add classification</ib-button>
        </form>
      }
    </section>
  `,
})
export class AccountClassificationTab {
  private readonly store = inject(AccountRecordStore);
  private readonly client = inject(AccountsClient);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);

  protected readonly guard = new SubmitGuard();
  protected readonly rows = signal<AccountClassificationView[]>([]);
  protected readonly catalog = signal<ClassificationOption[]>([]);
  protected readonly chosen = signal<number | null>(null);
  protected readonly sub = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly canEdit = computed(
    () =>
      !this.store.closed() &&
      this.permissions.can({ module: 'ACC', subModule: 'CLASSIFICATION', action: 'edit' }),
  );
  /** Classifications the account does not have yet. */
  protected readonly available = computed(() =>
    this.catalog().filter(
      (option) => !this.rows().some((row) => row.accountClassificationId === option.accountClassificationId),
    ),
  );
  protected readonly subs = computed(
    () =>
      this.catalog().find((option) => option.accountClassificationId === this.chosen())?.subClassifications ??
      [],
  );

  constructor() {
    effect(() => {
      const account = this.store.account();
      if (account) {
        untracked(() => void this.load(account.accountId));
      }
    });
    this.client.classificationCatalog().then(
      (options) => this.catalog.set(options),
      () => this.catalog.set([]),
    );
  }

  protected pick(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.chosen.set(value ? Number(value) : null);
    this.sub.set(null);
    this.error.set(null);
  }

  protected pickSub(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.sub.set(value ? Number(value) : null);
  }

  protected async add(): Promise<void> {
    const accountId = this.store.id;
    const chosen = this.chosen();
    if (chosen === null) {
      this.error.set('Choose a classification.');
      return;
    }
    if (accountId === null) {
      return;
    }
    await this.guard.run(async () => {
      try {
        await this.client.assignClassification(accountId, chosen, this.sub());
        this.chosen.set(null);
        this.sub.set(null);
        this.toast.success('Classification added.');
        await this.load(accountId);
      } catch (failure) {
        const problem = toApiProblem(failure);
        this.error.set(Object.values(problem.errors ?? {})[0]?.[0] ?? messageFor(problem));
      }
    });
  }

  protected async remove(row: AccountClassificationView): Promise<void> {
    const accountId = this.store.id;
    if (accountId === null) {
      return;
    }
    try {
      await this.client.removeClassification(accountId, row.assignmentId);
      this.toast.success('Classification removed.');
      await this.load(accountId);
    } catch (failure) {
      this.toast.error(messageFor(toApiProblem(failure)));
    }
  }

  private async load(accountId: number): Promise<void> {
    try {
      this.rows.set(await this.client.classifications(accountId));
      this.message.set(null);
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    }
  }
}
