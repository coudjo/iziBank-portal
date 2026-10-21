import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ActivityPage, ChangePage } from '../../core/api/api-types';
import { ConfigService } from '../../core/config/config.service';
import { query } from '../../shared/data/list-params';

export interface ActivityFilter {
  staffUserId: number | null;
  eventCode: string | null;
  entityType: string | null;
  entityId: string | null;
  from: string | null;
  to: string | null;
}

export interface ChangeFilter {
  staffUserId: number | null;
  tableName: string | null;
  recordId: string | null;
  from: string | null;
  to: string | null;
}

/**
 * Audit log reads (API A2-08). The API records every read as AUDIT_VIEW, so the viewer queries only when the user
 * asks (Apply), not on every keystroke.
 */
@Injectable({ providedIn: 'root' })
export class AuditClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  activity(filter: ActivityFilter, page: number, pageSize: number): Promise<ActivityPage> {
    return firstValueFrom(
      this.http.get<ActivityPage>(`${this.base}/audit/activity`, {
        params: query({ ...filter, page, pageSize }),
      }),
    );
  }

  changes(filter: ChangeFilter, page: number, pageSize: number): Promise<ChangePage> {
    return firstValueFrom(
      this.http.get<ChangePage>(`${this.base}/audit/changes`, {
        params: query({ ...filter, page, pageSize }),
      }),
    );
  }
}
