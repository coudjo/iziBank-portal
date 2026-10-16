import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { LookupRow } from '../api/api-types';
import { ConfigService } from '../config/config.service';

/** Lookup lists (`GET /lookups/{type}`), active rows only, cached for the session. They hold no personal data. */
@Injectable({ providedIn: 'root' })
export class LookupsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');
  private readonly cache = new Map<string, Promise<LookupRow[]>>();

  list(type: string): Promise<LookupRow[]> {
    let rows = this.cache.get(type);
    if (!rows) {
      rows = firstValueFrom(this.http.get<LookupRow[]>(`${this.base}/lookups/${encodeURIComponent(type)}`));
      rows.catch(() => this.cache.delete(type));
      this.cache.set(type, rows);
    }
    return rows;
  }
}
