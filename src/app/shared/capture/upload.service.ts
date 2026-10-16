import { HttpClient, HttpContext, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map } from 'rxjs';
import { ConfigService } from '../../core/config/config.service';
import { IDEMPOTENCY_KEY } from '../../core/http/interceptors';

export interface UploadRequest {
  /** API path relative to the base URL, for example `parties/12/photo`. */
  path: string;
  method: 'PUT' | 'POST';
  blob: Blob;
  contentType: string;
  /** Created when the file was captured; every retry of the same file sends the same key. */
  idempotencyKey: string;
}

export type UploadEvent<T> = { kind: 'progress'; percent: number } | { kind: 'done'; body: T | null };

/**
 * `UploadService` (frontend plan 6.6, F4-05): sends the raw file body with progress. Unsubscribing cancels the
 * request. A retry is a new call with the same request, so it carries the same `Idempotency-Key` and the API replays
 * the first result instead of saving twice.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  upload<T>(request: UploadRequest): Observable<UploadEvent<T>> {
    return this.http
      .request<T>(request.method, `${this.base}/${request.path.replace(/^\//, '')}`, {
        body: request.blob,
        headers: { 'Content-Type': request.contentType },
        context: new HttpContext().set(IDEMPOTENCY_KEY, request.idempotencyKey),
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        filter(
          (event) => event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response,
        ),
        map((event): UploadEvent<T> => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent = event.total ? Math.round((100 * event.loaded) / event.total) : 0;
            return { kind: 'progress', percent };
          }
          return { kind: 'done', body: event.type === HttpEventType.Response ? event.body : null };
        }),
      );
  }
}
