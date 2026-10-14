import { inject } from '@angular/core';
import { ConfigService } from '../config/config.service';

/** Builds an absolute API path from a path relative to <c>apiBaseUrl</c>, e.g. <c>api('auth/login')</c>. */
export function apiUrl(path: string): string {
  const base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

export function isApiUrl(url: string, base: string): boolean {
  return url.startsWith(base.replace(/\/$/, '') + '/');
}
