import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import type { AccountView, FreezeActionResult } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatMoney } from '../../core/formats/money';
import { newIdempotencyKey } from '../../shared/capture/image-compress';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
} from '../../shared/ui';
import { AccountsClient } from './accounts.client';

export interface HoldDialogData {
  account: AccountView;
  /** True to release a hold, false to place one. */
  release: boolean;
}

/**
 * Hold amount and Release hold (UX 6.8): amount and remarks, with the new available balance shown before the user
 * confirms. One `Idempotency-Key` per dialog, so pressing again after a timeout cannot hold twice.
 */
@Component({
  selector: 'ib-hold-dialog',
  imports: [BannerComponent, ButtonComponent, FormControlDirective, FormFieldComponent, InputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    dl {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--ib-space-1) var(--ib-space-4);
      margin: 0 0 var(--ib-space-4);
    }
    dt {
      color: var(--ib-ink-muted);
    }
    dd {
      margin: 0;
      text-align: right;
    }
    .after {
      font-weight: 650;
    }
    textarea {
      min-height: 4.5rem;
      resize: vertical;
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
      <dl>
        <dt>Held now</dt>
        <dd class="ib-num">{{ money(held()) }}</dd>
        <dt>Available now</dt>
        <dd class="ib-num">{{ money(available()) }}</dd>
        <dt class="after">Available after</dt>
        <dd class="ib-num after" data-testid="available-after">{{ money(after()) }}</dd>
      </dl>
      <ib-form-field
        label="Amount"
        [required]="true"
        [hint]="data.release ? 'Up to ' + money(held()) : null"
        [error]="amountError()"
      >
        <input
          ibInput
          ibControl
          inputmode="decimal"
          autocomplete="off"
          data-autofocus
          (input)="amountText.set($any($event.target).value)"
        />
      </ib-form-field>
      <ib-form-field label="Remarks" [required]="true" [error]="remarksError()">
        <textarea
          ibInput
          ibControl
          maxlength="200"
          (input)="remarks.set($any($event.target).value)"
        ></textarea>
      </ib-form-field>
      <div class="actions">
        <ib-button (click)="ref.close()">Cancel</ib-button>
        <ib-button variant="primary" type="submit" [loading]="guard.busy()">{{
          data.release ? 'Release hold' : 'Hold amount'
        }}</ib-button>
      </div>
    </form>
  `,
})
export class HoldDialogComponent {
  protected readonly ref = inject<NzModalRef<HoldDialogComponent, FreezeActionResult>>(NzModalRef);
  protected readonly data = inject<HoldDialogData>(NZ_MODAL_DATA);
  private readonly client = inject(AccountsClient);
  private readonly key = newIdempotencyKey();

  protected readonly guard = new SubmitGuard();
  protected readonly amountText = signal('');
  protected readonly remarks = signal('');
  protected readonly amountError = signal<string | null>(null);
  protected readonly remarksError = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);

  protected readonly held = signal(this.data.account.balance.freezedAmount);
  protected readonly available = signal(this.data.account.balance.availableBalance);
  protected readonly amount = computed(() => parseAmount(this.amountText()));
  protected readonly after = computed(() => {
    const amount = this.amount() ?? 0;
    return this.available() + (this.data.release ? amount : -amount);
  });

  protected async confirm(): Promise<void> {
    const amount = this.amount();
    this.amountError.set(
      amount === null || amount <= 0
        ? 'Enter an amount greater than zero, with at most two decimal places.'
        : this.data.release && amount > this.held()
          ? 'You cannot release more than is held.'
          : null,
    );
    this.remarksError.set(this.remarks().trim() ? null : 'Give the reason for this hold.');
    if (this.amountError() || this.remarksError()) {
      return;
    }
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        const result = await this.client.freezeAction(
          this.data.account.accountId,
          {
            action: this.data.release ? 'RELEASE_AMOUNT' : 'HOLD_AMOUNT',
            amount,
            remarks: this.remarks().trim(),
          },
          this.key,
        );
        this.ref.close(result);
      } catch (error) {
        const problem = toApiProblem(error);
        const field = problem.errors?.['amount']?.[0];
        if (field) {
          this.amountError.set(field);
        } else {
          this.failure.set(messageFor(problem));
        }
      }
    });
  }

  protected money(amount: number): string {
    return formatMoney(amount, this.data.account.currencyCode);
  }
}

/** `1,250.50` or `1250.5` to a number; null when it is not a money amount. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[\s,]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    return null;
  }
  return Number(clean);
}
