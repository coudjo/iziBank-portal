import { signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiProblem, toApiProblem } from '../../core/errors/api-problem';
import { UploadRequest, UploadService } from './upload.service';

export type UploadState = 'idle' | 'uploading' | 'failed' | 'cancelled' | 'done';

/**
 * One file's upload (UX 3.2 "Upload on mobile data"): progress, cancel, and retry with the same request, so the
 * same Idempotency-Key. The captured file stays in memory until the upload succeeds or the screen closes.
 */
export class UploadTask {
  readonly state = signal<UploadState>('idle');
  readonly percent = signal(0);
  readonly problem = signal<ApiProblem | null>(null);
  private request: UploadRequest | null = null;
  private onDone: (() => void | Promise<void>) | null = null;
  private subscription: Subscription | null = null;

  constructor(private readonly uploads: UploadService) {}

  /** `onDone` runs after a success, whether it came from this attempt or a later Retry. */
  start(request: UploadRequest, onDone?: () => void | Promise<void>): Promise<boolean> {
    this.request = request;
    this.onDone = onDone ?? null;
    return this.send();
  }

  retry(): Promise<boolean> {
    return this.request ? this.send() : Promise.resolve(false);
  }

  cancel(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    if (this.state() === 'uploading') {
      this.state.set('cancelled');
    }
  }

  private send(): Promise<boolean> {
    const request = this.request!;
    this.cancel();
    this.state.set('uploading');
    this.percent.set(0);
    this.problem.set(null);
    return new Promise((resolve) => {
      this.subscription = this.uploads.upload(request).subscribe({
        next: (event) => {
          if (event.kind === 'progress') {
            this.percent.set(event.percent);
          } else {
            this.percent.set(100);
            this.state.set('done');
            void this.onDone?.();
            resolve(true);
          }
        },
        error: (failure: unknown) => {
          this.problem.set(toApiProblem(failure));
          this.state.set('failed');
          resolve(false);
        },
        complete: () => {
          if (this.state() === 'cancelled') {
            resolve(false);
          }
        },
      });
      this.subscription.add(() => {
        if (this.state() === 'cancelled') {
          resolve(false);
        }
      });
    });
  }
}
