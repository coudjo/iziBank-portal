import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  FormControlDirective,
  FormFieldComponent,
  IconComponent,
  InputDirective,
} from '../../shared/ui';
import { initialPasswordRules, passwordMessages } from './admin-labels';
import { SecurityClient } from './security.client';

export interface ResetPasswordData {
  staffUserId: number;
  staffCode: string;
  fullName: string;
}

/**
 * Reset password (UX 6.10 step 6): a temporary password the person must change at next sign-in. Their open session
 * ends. Resolves true when the password was reset.
 */
@Component({
  selector: 'ib-reset-password-dialog',
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
    p {
      margin: 0 0 var(--ib-space-3);
    }
    .rules {
      list-style: none;
      margin: 0 0 var(--ib-space-4);
      padding: 0;
      display: grid;
      gap: var(--ib-space-1);
      color: var(--ib-ink-muted);
    }
    .rules li {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
    }
    .rules li.met {
      color: var(--ib-success-text);
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
      <p>
        {{ data.fullName }} is signed out now and must choose a new password the next time they sign in. Give
        them the temporary password in person.
      </p>
      <ib-form-field label="Temporary password" [required]="true" [error]="error()">
        <input
          ibInput
          ibControl
          type="password"
          autocomplete="new-password"
          data-autofocus
          (input)="password.set($any($event.target).value)"
        />
      </ib-form-field>
      <ul class="rules" aria-label="Password rules">
        @for (rule of rules(); track rule.id) {
          <li [class.met]="rule.met">
            <ib-icon [name]="rule.met ? 'check-circle' : 'minus-circle'" />
            <span
              >{{ rule.label
              }}<span class="ib-visually-hidden">{{ rule.met ? ': done' : ': not yet' }}</span></span
            >
          </li>
        }
      </ul>
      <div class="actions">
        <ib-button (click)="ref.close(false)">Cancel</ib-button>
        <ib-button variant="primary" type="submit" [loading]="guard.busy()">Reset password</ib-button>
      </div>
    </form>
  `,
})
export class ResetPasswordDialogComponent {
  protected readonly ref = inject<NzModalRef<ResetPasswordDialogComponent, boolean>>(NzModalRef);
  protected readonly data = inject<ResetPasswordData>(NZ_MODAL_DATA);
  private readonly client = inject(SecurityClient);

  protected readonly guard = new SubmitGuard();
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly rules = computed(() => initialPasswordRules(this.password(), this.data.staffCode));

  protected async confirm(): Promise<void> {
    if (!this.password()) {
      this.error.set('Enter a temporary password.');
      return;
    }
    if (!this.rules().every((rule) => rule.met)) {
      this.error.set('The password does not meet the rules below.');
      return;
    }
    this.error.set(null);
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        await this.client.resetPassword(this.data.staffUserId, this.password());
        this.ref.close(true);
      } catch (failure) {
        const problem = toApiProblem(failure);
        const rules = problem.errors?.['newSecretKey'];
        if (rules) {
          this.error.set(passwordMessages(rules));
        } else {
          this.failure.set(messageFor(problem));
        }
      }
    });
  }
}
