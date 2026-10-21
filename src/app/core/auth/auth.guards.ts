import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { PermissionRule, PermissionService } from '../permissions/permission.service';
import { AuthService } from './auth.service';

/** Shell routes: a signed-in user whose password does not need changing. */
export const signedInGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!(await auth.ensureProfile())) {
    return router.createUrlTree(['/login']);
  }

  return auth.mustChangeSecretKey() ? router.createUrlTree(['/change-password']) : true;
};

/** The change-password screen needs a session; it is also the forced first-login screen. */
export const changePasswordGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  return (await auth.ensureProfile()) ? true : inject(Router).createUrlTree(['/login']);
};

/** The sign-in page sends signed-in users on to the app. */
export const guestGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.isSignedIn() ? inject(Router).createUrlTree(['/dashboard']) : true;
};

/** canMatch per feature: a denied user never downloads the lazy chunk and sees the not-allowed page. */
export function requirePermission(rule: PermissionRule): CanMatchFn {
  return () => (inject(PermissionService).can(rule) ? true : inject(Router).createUrlTree(['/not-allowed']));
}

/** canMatch for a page that serves several roles: any one rule is enough. */
export function requireAnyPermission(rules: readonly PermissionRule[]): CanMatchFn {
  return () =>
    inject(PermissionService).canAny(rules) ? true : inject(Router).createUrlTree(['/not-allowed']);
}
