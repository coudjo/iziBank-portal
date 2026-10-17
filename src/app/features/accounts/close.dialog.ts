import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import type { AccountCloseStatus, AccountView, LookupRow } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { LookupsService } from '../../core/lookups/lookups.service';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  FormControlDirective,
  FormFieldComponent,
  IconComponent,
  InputDirective,
} from '../../shared/ui';
import { CLOSE_CHECK_LABELS, label } from './account-labels';
import { AccountsClient } from './accounts.client';

export interface CloseDialogData {
  account: AccountView;
}

/**
 * Close account (UX 6.8): the check list first (balance zero, no holds, no pending items). Failed checks keep the
 * confirm button disabled. The user picks a reason and types the account number to confirm.
 */
@Component({
  selector: 'ib-close-dialog',
  imports: [
    BannerComponent,
    ButtonComponent,
    FormControlDirective,
    FormFieldComponent,
    IconComponent,
    InputDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    ul {
      list-style: none;
      margin: 0 0 var(--ib-space-4);
      padding: 0;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
      min-height: var(--ib-touch-target);
    }
    .passed {
      color: var(--ib-success-text);
    }
    .failed {
      color: var(--ib-danger-text);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
    }
  `,
  template: `
    <form (submit)="$event.preventDefault(); confirm()" novalidate>
      @if (failure(); as text) {
        <ib-banner tone="danger" [message]="text" />
      }
      @if (status(); as current) {
        <ul aria-label="Checks before closing">
          @for (check of current.checks; track check.code) {
            <li [class.passed]="check.passed" [class.failed]="!check.passed">
              <ib-icon [name]="check.passed ? 'check-circle' : 'close-circle'" />
              <span
                >{{ checkLabel(check.code)
                }}<span class="ib-visually-hidden">{{ check.passed ? ': done' : ': not yet' }}</span></span
              >
            </li>
          }
        </ul>
      } @else {
        <p aria-live="polite">Checking the account…</p>
      }
      <ib-form-field label="Reason" [required]="true" [error]="reasonError()">
        <select ibInput ibControl data-autofocus (change)="reasonId.set(+$any($event.target).value || null)">
          <option value="">Choose a reason</option>
          @for (reason of reasons(); track reason.id) {
            <option [value]="reason.id">{{ reason.name }}</option>
          }
        </select>
      </ib-form-field>
      <ib-form-field
        label="Type the account number to confirm"
        [required]="true"
        [hint]="data.account.accountNumber"
      >
        <input
          ibInput
          ibControl
          inputmode="numeric"
          autocomplete="off"
          spellcheck="false"
          (input)="typed.set($any($event.target).value.trim())"
        />
      </ib-form-field>
      <div class="actions">
        <ib-button (click)="ref.close()">Cancel</ib-button>
        <ib-button variant="danger" type="submit" [disabled]="!ready()" [loading]="guard.busy()"
          >Close account</ib-button
        >
      </div>
    </form>
  `,
})
export class CloseDialogComponent {
  protected readonly ref = inject<NzModalRef<CloseDialogComponent, boolean>>(NzModalRef);
  protected readonly data = inject<CloseDialogData>(NZ_MODAL_DATA);
  private readonly client = inject(AccountsClient);
  private readonly lookups = inject(LookupsService);

  protected readonly guard = new SubmitGuard();
  protected readonly status = signal<AccountCloseStatus | null>(null);
  protected readonly reasons = signal<LookupRow[]>([]);
  protected readonly reasonId = signal<number | null>(null);
  protected readonly typed = signal('');
  protected readonly reasonError = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly ready = computed(
    () => !!this.status()?.canClose && this.typed() === this.data.account.accountNumber,
  );

  constructor() {
    void this.check();
    this.lookups.list('close-reasons').then(
      (rows) => this.reasons.set(rows),
      (error) => this.failure.set(messageFor(toApiProblem(error))),
    );
  }

  protected async confirm(): Promise<void> {
    const reasonId = this.reasonId();
    this.reasonError.set(reasonId === null ? 'Choose why the account is closing.' : null);
    if (reasonId === null || !this.ready()) {
      return;
    }
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        await this.client.close(this.data.account.accountId, reasonId);
        this.ref.close(true);
      } catch (error) {
        this.failure.set(messageFor(toApiProblem(error)));
        await this.check();
      }
    });
  }

  private async check(): Promise<void> {
    try {
      this.status.set(await this.client.closeCheck(this.data.account.accountId));
    } catch (error) {
      this.failure.set(messageFor(toApiProblem(error)));
    }
  }

  protected checkLabel(code: string): string {
    return label(CLOSE_CHECK_LABELS, code);
  }
}
