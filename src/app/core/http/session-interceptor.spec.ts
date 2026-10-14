import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { BranchContext } from '../branch/branch-context';
import { ConfigService } from '../config/config.service';
import { ReauthService } from '../session/reauth.service';
import { apiHeadersInterceptor, sessionInterceptor } from './interceptors';

describe('session interceptor (frontend plan 6.1 replay rules)', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let token = 'old';
  let sameUser = true;
  const reauth = { request: vi.fn(() => of(sameUser)) };

  beforeEach(() => {
    token = 'old';
    sameUser = true;
    reauth.request.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiHeadersInterceptor, sessionInterceptor])),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: { config: { apiBaseUrl: '/api/v1' } } },
        { provide: ReauthService, useValue: reauth },
        { provide: BranchContext, useValue: { override: () => null } },
        {
          provide: AuthService,
          useValue: { accessToken: () => token, me: () => ({ staffUserId: 1 }) },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  const sessionEnded = { status: 401, statusText: 'Unauthorized' };

  it('replays a failed GET once with the new token after the same user signs back in', async () => {
    const result = firstValueFrom(http.get<{ ok: boolean }>('/api/v1/sessions'));
    const first = backend.expectOne('/api/v1/sessions');
    expect(first.request.headers.get('Authorization')).toBe('Bearer old');

    token = 'new';
    first.flush({ type: 'auth.session-forced' }, sessionEnded);

    const replay = backend.expectOne('/api/v1/sessions');
    expect(replay.request.headers.get('Authorization')).toBe('Bearer new');
    replay.flush({ ok: true });

    expect(await result).toEqual({ ok: true });
    expect(reauth.request).toHaveBeenCalledWith('auth.session-forced');
  });

  it('never replays a write', async () => {
    const result = firstValueFrom(http.post('/api/v1/role-groups', {}));
    backend.expectOne('/api/v1/role-groups').flush({ type: 'auth.session-timed-out' }, sessionEnded);

    await expect(result).rejects.toBeTruthy();
    expect(reauth.request).toHaveBeenCalledWith('auth.session-timed-out');
    backend.expectNone('/api/v1/role-groups');
  });

  it('does not replay when a different user signed in', async () => {
    sameUser = false;
    const result = firstValueFrom(http.get('/api/v1/sessions'));
    backend.expectOne('/api/v1/sessions').flush({ type: 'auth.session-superseded' }, sessionEnded);

    await expect(result).rejects.toBeTruthy();
    backend.expectNone('/api/v1/sessions');
  });

  it('leaves a failed sign-in alone', async () => {
    const result = firstValueFrom(http.post('/api/v1/auth/login', {}));
    backend.expectOne('/api/v1/auth/login').flush({ type: 'auth.invalid-credentials' }, sessionEnded);

    await expect(result).rejects.toBeTruthy();
    expect(reauth.request).not.toHaveBeenCalled();
  });
});
