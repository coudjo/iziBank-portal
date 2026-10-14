import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AuthService } from '../auth/auth.service';
import { toApiProblem } from '../errors/api-problem';
import { messageFor } from '../errors/error-catalog';
import { BannerComponent, ButtonComponent, FormControlDirective, FormFieldComponent } from '../../shared/ui';

export interface ReSignInData {
  reason: string;
  staffCode: string | null;
}

export type ReSignInResult = 'same-user' | 'different-user' | 'signed-out';

/** UX 5.8: the session ended mid-task; sign in again over the page so in-memory work is kept. */
@Component({
  selector: 'ib-re-sign-in-dialog',
  imports: [
    ReactiveFormsModule,
    NzInputModule,
    BannerComponent,
    ButtonComponent,
    FormFieldComponent,
    FormControlDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      justify-content: space-between;
      margin-top: var(--ib-space-2);
    }
  `,
  template: `
    <ib-banner tone="warning" [message]="reasonMessage" />
    <p>Sign in again to carry on. Your work on this page is kept.</p>
    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
    }
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <ib-form-field label="Staff code" [required]="true">
        <input nz-input ibControl formControlName="staffCode" autocomplete="username" />
      </ib-form-field>
      <ib-form-field label="Password" [required]="true">
        <input
          nz-input
          ibControl
          type="password"
          formControlName="secretKey"
          autocomplete="current-password"
        />
      </ib-form-field>
      <div class="actions">
        <ib-button variant="quiet" (click)="signOut()">Sign out</ib-button>
        <ib-button variant="primary" type="submit" [loading]="busy()">Sign in</ib-button>
      </div>
    </form>
  `,
})
export class ReSignInDialogComponent {
  private readonly data = inject<ReSignInData>(NZ_MODAL_DATA);
  private readonly ref = inject<NzModalRef<ReSignInDialogComponent, ReSignInResult>>(NzModalRef);
  private readonly auth = inject(AuthService);

  protected readonly reasonMessage = messageFor({ type: this.data.reason, extensions: {} });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    staffCode: [this.data.staffCode ?? '', Validators.required],
    secretKey: ['', Validators.required],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      this.error.set(this.form.invalid ? 'Enter your staff code and password.' : null);
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    const { staffCode, secretKey } = this.form.getRawValue();
    try {
      const sameUser = await this.auth.reauthenticate(staffCode.trim(), secretKey);
      this.ref.close(sameUser ? 'same-user' : 'different-user');
    } catch (failure) {
      this.form.controls.secretKey.reset();
      this.error.set(messageFor(toApiProblem(failure)));
    } finally {
      this.busy.set(false);
    }
  }

  protected signOut(): void {
    this.ref.close('signed-out');
  }
}
