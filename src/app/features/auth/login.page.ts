import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AuthService } from '../../core/auth/auth.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { BannerComponent, ButtonComponent, FormControlDirective, FormFieldComponent } from '../../shared/ui';

/** Sign in (frontend plan 7.1, UX 6.1). */
@Component({
  selector: 'ib-login-page',
  imports: [
    ReactiveFormsModule,
    NzInputModule,
    NzIconModule,
    ButtonComponent,
    BannerComponent,
    FormFieldComponent,
    FormControlDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  template: `
    <main id="main" tabindex="-1">
      <div class="card">
        <span class="wordmark" aria-hidden="true">iziBank</span>
        <h1 tabindex="-1" data-page-title>Sign in</h1>

        @if (endedMessage(); as ended) {
          <ib-banner tone="info" [message]="ended" />
        }
        @if (error(); as message) {
          <ib-banner tone="danger" [message]="message" />
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <ib-form-field
            label="Staff code"
            [required]="true"
            [error]="fieldError('staffCode', 'Enter your staff code.')"
          >
            <input
              nz-input
              ibControl
              formControlName="staffCode"
              autocomplete="username"
              autocapitalize="characters"
              spellcheck="false"
            />
          </ib-form-field>

          <ib-form-field
            label="Password"
            [required]="true"
            [error]="fieldError('secretKey', 'Enter your password.')"
          >
            <div class="password">
              <input
                nz-input
                ibControl
                formControlName="secretKey"
                [type]="showSecret() ? 'text' : 'password'"
                autocomplete="current-password"
              />
              <button
                type="button"
                class="reveal"
                (click)="showSecret.set(!showSecret())"
                [attr.aria-pressed]="showSecret()"
              >
                <span nz-icon [nzType]="showSecret() ? 'eye-invisible' : 'eye'" aria-hidden="true"></span>
                <span class="ib-visually-hidden">{{ showSecret() ? 'Hide password' : 'Show password' }}</span>
              </button>
            </div>
          </ib-form-field>

          <div class="submit">
            <ib-button variant="primary" type="submit" [block]="true" [loading]="busy()">Sign in</ib-button>
          </div>
        </form>
      </div>
    </main>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    staffCode: ['', Validators.required],
    secretKey: ['', Validators.required],
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly showSecret = signal(false);

  protected readonly endedMessage = computed(() => {
    const reason = this.auth.endedReason();
    return reason ? messageFor({ type: reason, extensions: {} }) : null;
  });

  protected fieldError(name: 'staffCode' | 'secretKey', message: string): string | null {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted()) ? message : null;
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    const { staffCode, secretKey } = this.form.getRawValue();
    try {
      await this.auth.login(staffCode.trim(), secretKey);
      this.form.reset();
      await this.router.navigateByUrl(this.auth.mustChangeSecretKey() ? '/change-password' : '/dashboard');
    } catch (failure) {
      this.form.controls.secretKey.reset();
      this.error.set(messageFor(toApiProblem(failure)));
    } finally {
      this.busy.set(false);
    }
  }
}
