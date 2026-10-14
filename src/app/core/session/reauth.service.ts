import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, defer, finalize, map, shareReplay, switchMap, take, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { DialogService } from '../../shared/ui/dialog.service';
import { ToastService } from '../../shared/ui/toast.service';
import { InMemoryStores } from './in-memory-stores';
import type { ReSignInData, ReSignInDialogComponent, ReSignInResult } from './re-sign-in.dialog';

/**
 * One re-sign-in dialog at a time, shared by every request that hit an ended session (frontend plan 6.1).
 * Emits true when the same person signed back in, so a failed GET may be replayed once.
 */
@Injectable({ providedIn: 'root' })
export class ReauthService {
  private readonly auth = inject(AuthService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly stores = inject(InMemoryStores);
  private pending: Observable<boolean> | null = null;

  get isOpen(): boolean {
    return this.pending !== null;
  }

  request(reason: string): Observable<boolean> {
    if (this.pending) {
      return this.pending;
    }

    this.pending = defer(() => this.open(reason)).pipe(
      switchMap((ref) => ref.afterClose),
      take(1),
      tap((result) => this.handle(result, reason)),
      map((result) => result === 'same-user'),
      finalize(() => (this.pending = null)),
      shareReplay(1),
    );
    this.pending.subscribe();
    return this.pending;
  }

  private async open(reason: string) {
    const { ReSignInDialogComponent: component } = await import('./re-sign-in.dialog');
    return this.dialogs.open<ReSignInDialogComponent, ReSignInData, ReSignInResult>(
      component,
      { reason, staffCode: this.auth.me()?.staffCode ?? null },
      { title: 'Sign in again', dismissible: false },
    );
  }

  private handle(result: ReSignInResult | undefined, reason: string): void {
    if (result === 'different-user') {
      this.stores.resetAll();
      void this.router.navigateByUrl('/dashboard');
      this.toast.info('Your previous work was discarded because a different user signed in.');
    } else if (result !== 'same-user') {
      this.stores.resetAll();
      this.auth.clear(reason);
      void this.router.navigateByUrl('/login');
    }
  }
}
