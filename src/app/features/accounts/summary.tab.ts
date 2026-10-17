import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatTimestamp } from '../../core/formats/dates';
import { PermissionService } from '../../core/permissions/permission.service';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  ButtonComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  ToastService,
  statusFor,
} from '../../shared/ui';
import { AccountBalancesComponent } from './balances.component';
import { AccountRecordStore } from './account-record.store';
import { AccountsClient } from './accounts.client';

const REMINDER_LENGTH = 200;

/** Summary tab (UX 7.4): balances, status and reminders. Reminders are added and removed inline (UX 6.8). */
@Component({
  selector: 'ib-account-summary-tab',
  imports: [
    AccountBalancesComponent,
    ButtonComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: var(--ib-space-4);
    }
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
    }
    h2 {
      margin-bottom: var(--ib-space-3);
    }
    .status {
      margin: 0;
    }
    ul {
      list-style: none;
      margin: 0 0 var(--ib-space-3);
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
    .when {
      color: var(--ib-ink-meta);
      font-size: 13px;
    }
    .empty {
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-ink-muted);
    }
    form {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 0 var(--ib-space-3);
    }
    form ib-form-field {
      flex: 1 1 18rem;
    }
    form ib-button {
      margin-bottom: var(--ib-space-4);
    }
  `,
  template: `
    @if (store.account(); as account) {
      <section aria-labelledby="balances-title">
        <h2 id="balances-title">Balances</h2>
        <ib-account-balances [balance]="account.balance" />
      </section>

      <section aria-labelledby="status-title">
        <h2 id="status-title">Status</h2>
        <p class="status">{{ statusText() }}</p>
      </section>

      <section aria-labelledby="reminders-title">
        <h2 id="reminders-title">Reminders</h2>
        @if (account.reminders.length === 0) {
          <p class="empty">No reminders. Reminders show to everyone who opens this account.</p>
        } @else {
          <ul aria-label="Reminders">
            @for (reminder of account.reminders; track reminder.accountReminderId) {
              <li>
                <span>
                  {{ reminder.reminderText }}
                  <span class="when"> · {{ when(reminder.createdOn) }}</span>
                </span>
                @if (canEdit()) {
                  <ib-button variant="quiet" icon="close" (click)="remove(reminder.accountReminderId)"
                    >Remove<span class="ib-visually-hidden">
                      reminder: {{ reminder.reminderText }}</span
                    ></ib-button
                  >
                }
              </li>
            }
          </ul>
        }
        @if (canEdit()) {
          <form (submit)="$event.preventDefault(); add()" novalidate>
            <ib-form-field label="New reminder" [error]="error()" hint="Up to 200 characters">
              <input
                ibInput
                ibControl
                [attr.maxlength]="maxLength"
                autocomplete="off"
                [value]="text()"
                (input)="text.set($any($event.target).value)"
              />
            </ib-form-field>
            <ib-button type="submit" icon="plus" [loading]="guard.busy()">Add reminder</ib-button>
          </form>
        }
      </section>
    }
  `,
})
export class AccountSummaryTab {
  protected readonly store = inject(AccountRecordStore);
  private readonly client = inject(AccountsClient);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);

  protected readonly guard = new SubmitGuard();
  protected readonly maxLength = REMINDER_LENGTH;
  protected readonly text = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly canEdit = computed(
    () =>
      !this.store.closed() && this.permissions.can({ module: 'ACC', subModule: 'ACCOUNT', action: 'edit' }),
  );
  protected readonly statusText = computed(() => {
    const status = statusFor('account', this.store.account()?.status ?? 'ACTIVE');
    return `${status.label}. ${status.explanation}`;
  });

  protected async add(): Promise<void> {
    const text = this.text().trim();
    const accountId = this.store.id;
    if (!text) {
      this.error.set('Enter the reminder.');
      return;
    }
    if (accountId === null) {
      return;
    }
    await this.guard.run(async () => {
      try {
        await this.client.addReminder(accountId, text);
        this.text.set('');
        this.error.set(null);
        this.toast.success('Reminder added.');
        await this.store.reload();
      } catch (failure) {
        const problem = toApiProblem(failure);
        this.error.set(problem.errors?.['reminderText']?.[0] ?? messageFor(problem));
      }
    });
  }

  protected async remove(reminderId: number): Promise<void> {
    const accountId = this.store.id;
    if (accountId === null) {
      return;
    }
    try {
      await this.client.removeReminder(accountId, reminderId);
      this.toast.success('Reminder removed.');
      await this.store.reload();
    } catch (failure) {
      this.toast.error(messageFor(toApiProblem(failure)));
    }
  }

  protected readonly when = formatTimestamp;
}
