import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import type { MeResponse, TokenResponse } from '../api/api-types';
import { ConfigService } from '../config/config.service';
import { PermissionService } from '../permissions/permission.service';
import { InMemoryStores } from '../session/in-memory-stores';
import { SignOutBroadcast } from './sign-out-broadcast';
import { StoredToken, TokenStorage } from './token-storage';

/** Session state and the auth endpoints (frontend plan 5, F2-02). Customer data never goes to storage. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(TokenStorage);
  private readonly permissions = inject(PermissionService);
  private readonly broadcast = inject(SignOutBroadcast);
  private readonly stores = inject(InMemoryStores);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  private readonly token = signal<StoredToken | null>(this.storage.read());
  private readonly profile = signal<MeResponse | null>(null);
  private readonly sessionMax = signal<string | null>(null);
  private readonly tokenBranch = signal<number | null>(null);

  private readonly started = new Subject<void>();

  /** Emits after each successful sign-in (not after a refresh). */
  readonly sessionStarted$ = this.started.asObservable();

  /** Why the last session ended (problem type), shown once on the sign-in page. */
  readonly endedReason = signal<string | null>(null);

  readonly isSignedIn = computed(() => this.token() !== null);
  readonly me = this.profile.asReadonly();
  readonly mustChangeSecretKey = computed(() => this.profile()?.mustChangeSecretKey ?? false);
  readonly accessToken = computed(() => this.token()?.accessToken ?? null);
  readonly expiresAt = computed(() => this.token()?.expiresAt ?? null);
  readonly sessionMaxExpiresAt = this.sessionMax.asReadonly();
  /** The branch written into the current token (the API's default branch for this session). */
  readonly tokenBranchId = this.tokenBranch.asReadonly();

  constructor() {
    this.broadcast.signedOut$.subscribe(() => this.clear('auth.session-ended'));
  }

  /** `keepContext` keeps the working branch: used when the same person signs back in over the page. */
  async login(staffCode: string, secretKey: string, branchId?: number, keepContext = false): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<TokenResponse>(`${this.base}/auth/login`, {
        staffCode,
        secretKey,
        branchId: branchId ?? null,
      }),
    );
    this.accept(response);
    this.endedReason.set(null);
    if (!keepContext) {
      this.started.next();
    }
    await this.loadMe();
  }

  /**
   * Re-sign-in over the page after the session ended. Returns true when the same person signed back in,
   * false when someone else did (the caller then discards in-memory work).
   */
  async reauthenticate(staffCode: string, secretKey: string): Promise<boolean> {
    const previous = this.profile();
    const sameCode = !!previous && previous.staffCode.toUpperCase() === staffCode.trim().toUpperCase();
    await this.login(staffCode, secretKey, undefined, sameCode);
    return sameCode && this.profile()?.staffUserId === previous.staffUserId;
  }

  async changeSecretKey(currentSecretKey: string, newSecretKey: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<TokenResponse>(`${this.base}/auth/change-secret-key`, {
        currentSecretKey,
        newSecretKey,
      }),
    );
    this.accept(response);
    await this.loadMe();
  }

  async refresh(): Promise<void> {
    const response = await firstValueFrom(this.http.post<TokenResponse>(`${this.base}/auth/refresh`, null));
    this.accept(response);
  }

  async loadMe(): Promise<MeResponse> {
    const me = await firstValueFrom(this.http.get<MeResponse>(`${this.base}/auth/me`));
    this.profile.set(me);
    this.permissions.set(me.permissions);
    return me;
  }

  /** Makes sure the profile is loaded after a reload. Returns false when there is no usable session. */
  async ensureProfile(): Promise<boolean> {
    if (!this.token()) {
      return false;
    }
    if (this.profile()) {
      return true;
    }
    try {
      await this.loadMe();
      return true;
    } catch {
      this.clear(null);
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.base}/auth/logout`, null));
    } catch {
      // The session may already be closed on the server; signing out locally is what matters.
    }
    this.clear(null);
    this.broadcast.announce();
  }

  /** Drops the local session. `reason` is a problem type explaining why, or null for a normal sign-out. */
  clear(reason: string | null): void {
    this.storage.clear();
    this.token.set(null);
    this.profile.set(null);
    this.sessionMax.set(null);
    this.tokenBranch.set(null);
    this.permissions.clear();
    this.stores.resetAll();
    this.endedReason.set(reason);
  }

  private accept(response: TokenResponse): void {
    const stored: StoredToken = {
      accessToken: response.accessToken,
      expiresAt: response.expiresAt,
      sessionId: response.sessionId,
    };
    this.storage.write(stored);
    this.token.set(stored);
    this.sessionMax.set(response.sessionMaxExpiresAt);
    this.tokenBranch.set(response.branchId);
  }
}
