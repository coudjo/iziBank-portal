import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService } from '../../core/config/config.service';
import { IDEMPOTENCY_KEY } from '../../core/http/interceptors';
import { UploadEvent, UploadRequest, UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let http: HttpTestingController;
  const request: UploadRequest = {
    path: 'parties/12/photo',
    method: 'PUT',
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
    contentType: 'image/jpeg',
    idempotencyKey: 'key-made-at-capture',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: { config: { apiBaseUrl: '/api/v1' } } },
      ],
    });
    service = TestBed.inject(UploadService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('retries with the same Idempotency-Key', () => {
    const errors: unknown[] = [];
    service.upload(request).subscribe({ error: (error) => errors.push(error) });
    const first = http.expectOne('/api/v1/parties/12/photo');
    expect(first.request.method).toBe('PUT');
    expect(first.request.headers.get('Content-Type')).toBe('image/jpeg');
    expect(first.request.context.get(IDEMPOTENCY_KEY)).toBe('key-made-at-capture');
    first.error(new ProgressEvent('error'));
    expect(errors).toHaveLength(1);

    const events: UploadEvent<unknown>[] = [];
    service.upload(request).subscribe((event) => events.push(event));
    const retry = http.expectOne('/api/v1/parties/12/photo');
    expect(retry.request.context.get(IDEMPOTENCY_KEY)).toBe('key-made-at-capture');
    retry.flush(null, { status: 204, statusText: 'No Content' });
    expect(events.at(-1)).toEqual({ kind: 'done', body: null });
  });

  it('cancel stops the request', () => {
    const subscription = service.upload(request).subscribe();
    const pending = http.expectOne('/api/v1/parties/12/photo');
    subscription.unsubscribe();
    expect(pending.cancelled).toBe(true);
  });
});
