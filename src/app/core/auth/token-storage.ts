import { Injectable } from '@angular/core';

/** The only data the portal keeps in browser storage (frontend plan T13): token, expiry, session id. */
export interface StoredToken {
  accessToken: string;
  expiresAt: string;
  sessionId: number;
}

const KEY = 'ib.session';

@Injectable({ providedIn: 'root' })
export class TokenStorage {
  read(): StoredToken | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) {
        return null;
      }
      const value = JSON.parse(raw) as Partial<StoredToken>;
      return typeof value.accessToken === 'string' &&
        typeof value.expiresAt === 'string' &&
        typeof value.sessionId === 'number'
        ? { accessToken: value.accessToken, expiresAt: value.expiresAt, sessionId: value.sessionId }
        : null;
    } catch {
      return null;
    }
  }

  write(token: StoredToken): void {
    const safe: StoredToken = {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      sessionId: token.sessionId,
    };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(safe));
    } catch {
      // Storage can be unavailable (private mode). The session then lasts until the tab reloads.
    }
  }

  clear(): void {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  }
}
