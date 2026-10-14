import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AuthService } from '../../core/auth/auth.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import {
  BannerComponent,
  ButtonComponent,
  FormControlDirective,
  FormFieldComponent,
  ToastService,
} from '../../shared/ui';
import { passwordRules } from './password-rules';

/** Change password, also the forced first-sign-in screen (UX 6.1, frontend plan 7.2). */
@Component({
  selector: 'ib-change-password-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NzInputModule,
    NzIconModule,
    ButtonComponent,
    BannerComponent,
    FormFieldComponent,
    FormControlDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  styles: `
    .rules {
      list-style: none;
      margin: 0 0 var(--ib-space-4);
      padding: var(--ib-space-3);
      background: var(--ib-surface-subtle);
      border-radius: var(--ib-radius-sm);
    }
    .rules li {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
      padding: 2px 0;
      color: var(--ib-ink-muted);
    }
    .rules li.met {
      color: var(--ib-success-text);
    }
  `,
  template: `
    <main id="main" tabindex="-1">
      <div class="card">
        <span class="wordmark" aria-hidden="true">iziBank</span>
        <h1 tabindex="-1" data-page-title>Change your password</h1>
        @if (forced()) {
          <p class="lead">You need a new password before you continue.</p>
        }
        @if (error(); as message) {
          <ib-banner tone="danger" [message]="message" />
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <ib-form-field label="Current password" [required]="true" [error]="currentError()">
            <input
              nz-input
              ibControl
              type="password"
              formControlName="current"
              autocomplete="current-password"
            />
          </ib-form-field>

          <ib-form-field label="New password" [required]="true">
            <input
              nz-input
              ibControl
              type="password"
              formControlName="next"
              autocomplete="new-password"
              aria-describedby="password-rules"
            />
          </ib-form-field>

          <ul class="rules" id="password-rules" aria-label="Password rules">
            @for (rule of rules(); track rule.id) {
              <li [class.met]="rule.met">
                <span nz-icon [nzType]="rule.met ? 'check-circle' : 'minus-circle'" aria-hidden="true"></span>
                <span>{{ rule.label }}</span>
                <span class="ib-visually-hidden">{{ rule.met ? '(met)' : '(not met yet)' }}</span>
              </li>
            }
          </ul>

          <ib-form-field label="Confirm new password" [required]="true" [error]="confirmError()">
            <input nz-input ibControl type="password" formControlName="confirm" autocomplete="new-password" />
          </ib-form-field>

          <ib-button variant="primary" type="submit" [block]="true" [loading]="busy()" [disabled]="!ready()">
            Change password
          </ib-button>
        </form>

        <p class="links">
          @if (forced()) {
            <a href="" (click)="$event.preventDefault(); signOut()">Sign out</a>
          } @else {
            <a routerLink="/dashboard">Cancel</a>
          }
        </p>
      </div>
    </main>
  `,
})
export class ChangePasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly form = inject(NonNullableFormBuilder).group({
    current: ['', Validators.required],
    next: ['', Validators.required],
    confirm: ['', Validators.required],
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly forced = this.auth.mustChangeSecretKey;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly currentError = signal<string | null>(null);

  protected readonly rules = computed(() =>
    passwordRules(this.values().next ?? '', this.auth.me()?.staffCode ?? '', this.values().current ?? ''),
  );

  protected readonly confirmError = computed(() => {
    const { next, confirm } = this.values();
    return confirm && next !== confirm ? 'The passwords do not match.' : null;
  });

  protected readonly ready = computed(() => {
    const { current, next, confirm } = this.values();
    return !!current && !!next && next === confirm && this.rules().every((rule) => rule.met);
  });

  protected async submit(): Promise<void> {
    if (!this.ready() || this.busy()) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.currentError.set(null);
    const { current, next } = this.form.getRawValue();
    try {
      await this.auth.changeSecretKey(current, next);
      this.form.reset();
      this.toast.success('Your password has been changed.');
      await this.router.navigateByUrl('/dashboard');
    } catch (failure) {
      const problem = toApiProblem(failure);
      if (problem.type === 'auth.current-secret-key-wrong') {
        this.currentError.set(messageFor(problem));
      } else {
        this.error.set(messageFor(problem));
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
