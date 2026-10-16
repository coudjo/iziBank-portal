import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ButtonComponent } from '../ui/button.component';
import {
  CAPTURE_MESSAGES,
  CaptureError,
  PreparedFile,
  formatSize,
  newIdempotencyKey,
  prepareFile,
} from './image-compress';

export interface CapturedFile extends PreparedFile {
  /** Created at capture, reused for every retry of this file's upload (addendum section 4). */
  idempotencyKey: string;
}

/**
 * `ib-image-capture` (frontend plan 6.6, F4-03): Take photo opens the camera on phones and tablets; Choose file
 * opens the picker (and is the fallback when the camera is not available or not allowed). The prepared file stays in
 * memory; its preview URL is revoked when replaced or when the component goes away.
 */
@Component({
  selector: 'ib-image-capture',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
    }
    input {
      display: none;
    }
    .preview {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ib-space-3);
      margin-top: var(--ib-space-3);
    }
    img {
      max-width: 160px;
      max-height: 160px;
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-sm);
      background: var(--ib-surface-subtle);
    }
    .error {
      margin: var(--ib-space-2) 0 0;
      color: var(--ib-danger-text);
    }
    .meta {
      margin: 0;
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    <div class="buttons" role="group" [attr.aria-label]="label()">
      <ib-button icon="camera" [loading]="working()" (click)="camera.click()">Take photo</ib-button>
      <ib-button icon="upload" [disabled]="working()" (click)="picker.click()">Choose file</ib-button>
    </div>
    <input
      #camera
      type="file"
      accept="image/*"
      capture="environment"
      tabindex="-1"
      aria-hidden="true"
      (change)="picked($event)"
    />
    <input
      #picker
      type="file"
      [attr.accept]="accept()"
      tabindex="-1"
      aria-hidden="true"
      (change)="picked($event)"
    />

    <div aria-live="polite">
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      @if (file(); as ready) {
        <div class="preview" data-testid="capture-result">
          @if (previewUrl(); as url) {
            <img [src]="url" [alt]="'Preview of the ' + label().toLowerCase()" />
          }
          <p class="meta">{{ summary() }}</p>
        </div>
      }
    </div>
  `,
})
export class ImageCaptureComponent {
  /** What is captured, for example "Photo" or "ID document". */
  readonly label = input.required<string>();
  readonly allowPdf = input(false);
  readonly captured = output<CapturedFile>();

  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly file = signal<CapturedFile | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly accept = computed(() =>
    this.allowPdf() ? 'image/jpeg,image/png,application/pdf' : 'image/jpeg,image/png',
  );
  protected readonly summary = computed(() => {
    const file = this.file();
    if (!file) {
      return '';
    }
    const kind = file.type === 'application/pdf' ? 'PDF' : 'JPEG';
    const size = file.width ? `, ${file.width} × ${file.height} px` : '';
    return `Ready: ${kind}, ${formatSize(file.blob.size)}${size}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  /** Forgets the captured file (after a successful upload, or when the screen is closed). */
  clear(): void {
    this.revoke();
    this.file.set(null);
    this.error.set(null);
  }

  protected async picked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0];
    input.value = '';
    if (!chosen) {
      return;
    }
    this.working.set(true);
    this.error.set(null);
    try {
      const prepared = await prepareFile(chosen, { allowPdf: this.allowPdf() });
      const file: CapturedFile = { ...prepared, idempotencyKey: newIdempotencyKey() };
      this.revoke();
      this.file.set(file);
      this.previewUrl.set(file.type === 'application/pdf' ? null : URL.createObjectURL(file.blob));
      this.captured.emit(file);
    } catch (failure) {
      this.error.set(CAPTURE_MESSAGES[failure instanceof CaptureError ? failure.code : 'unreadable']);
    } finally {
      this.working.set(false);
    }
  }

  private revoke(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.previewUrl.set(null);
    }
  }
}
