import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { BranchContext } from '../branch/branch-context';
import { ConfigService } from '../config/config.service';
import { toApiProblem } from '../errors/api-problem';
import { ReauthService } from '../session/reauth.service';

/** Set on a request that must carry an `Idempotency-Key` (addendum section 4). Create the key when the data is captured. */
export const IDEMPOTENCY_KEY = new HttpContextToken<string | null>(() => null);

const SESSION_PROBLEMS = new Set([
  'auth.unauthenticated',
  'auth.session-ended',
  'auth.session-superseded',
  'auth.session-timed-out',
  'auth.session-max-exceeded',
  'auth.session-forced',
]);

export const apiHeadersInterceptor: HttpInterceptorFn = (request, next) => {
  const base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');
  if (!request.url.startsWith(base + '/')) {
    return next(request);
  }

  const token = inject(AuthService).accessToken();
  const idempotencyKey = request.context.get(IDEMPOTENCY_KEY);
  let headers = request.headers;
  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }
  const branchOverride = inject(BranchContext).override();
  if (branchOverride !== null) {
    headers = headers.set('X-Branch-Id', String(branchOverride));
  }
  if (idempotencyKey) {
    headers = headers.set('Idempotency-Key', idempotencyKey);
  }

  return next(request.clone({ headers }));
};

/** Marks a request that was already replayed after re-sign-in, so it is never replayed twice. */
const REPLAYED = new HttpContextToken<boolean>(() => false);

/**
 * Frontend plan 6.1: when the session ends mid-task the page stays put and the re-sign-in dialog opens.
 * After the same person signs back in, a failed GET is replayed once; a failed write is never replayed (the user
 * presses the button again). Sign-in calls and pages loaded before a session existed are left alone.
 */
export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const reauth = inject(ReauthService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        request.url.endsWith('/auth/login') ||
        auth.me() === null
      ) {
        return throwError(() => error);
      }

      const problem = toApiProblem(error);
      if (!SESSION_PROBLEMS.has(problem.type)) {
        return throwError(() => error);
      }

      const signedBackIn = reauth.request(problem.type);
      if (request.method !== 'GET' || request.context.get(REPLAYED)) {
        return throwError(() => error);
      }

      return signedBackIn.pipe(
        switchMap((sameUser) => {
          const token = auth.accessToken();
          if (!sameUser || !token) {
            return throwError(() => error);
          }
          return next(
            request.clone({
              setHeaders: { Authorization: `Bearer ${token}` },
              context: request.context.set(REPLAYED, true),
            }),
          );
        }),
      );
    }),
  );
};
