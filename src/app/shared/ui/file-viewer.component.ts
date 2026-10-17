import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ButtonComponent } from './button.component';

export interface ViewerItem {
  label: string;
  load: () => Promise<Blob>;
}

/**
 * Document, photo and signature viewer (UX 5.5, frontend plan 8): files are fetched only when shown, kept as an
 * in-memory blob URL, and revoked when the viewer moves on or closes. PDFs open in a sandboxed frame. There is no
 * download link.
 */
@Component({
  selector: 'ib-file-viewer',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .frame {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 260px;
      max-height: 70vh;
      background: var(--ib-surface-subtle);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      overflow: auto;
    }
    img {
      max-width: 100%;
      max-height: 68vh;
    }
    iframe {
      width: 100%;
      height: 68vh;
      border: 0;
    }
    .nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-3);
    }
    .label {
      font-weight: 600;
    }
    .status {
      color: var(--ib-ink-muted);
      padding: var(--ib-space-4);
      text-align: center;
    }
  `,
  template: `
    @if (items().length === 0) {
      <p class="status">Nothing to show yet.</p>
    } @else {
      <div class="frame" aria-live="polite">
        @if (error()) {
          <p class="status">{{ error() }}</p>
        } @else if (url(); as source) {
          @if (isPdf()) {
            <iframe
              [src]="trusted()"
              sandbox="allow-scripts"
              [title]="current()?.label ?? 'Document'"
            ></iframe>
          } @else {
            <img [src]="source" [alt]="current()?.label ?? ''" />
          }
        } @else {
          <p class="status">Loading…</p>
        }
      </div>
      <div class="nav">
        <span class="label">{{ current()?.label }} ({{ index() + 1 }} of {{ items().length }})</span>
        @if (items().length > 1) {
          <span>
            <ib-button [disabled]="index() === 0" (click)="index.set(index() - 1)">Previous</ib-button>
            <ib-button [disabled]="index() >= items().length - 1" (click)="index.set(index() + 1)"
              >Next</ib-button
            >
          </span>
        }
      </div>
    }
  `,
})
export class FileViewerComponent {
  readonly items = input.required<readonly ViewerItem[]>();
  readonly start = input(0);

  private readonly sanitizer = inject(DomSanitizer);
  protected readonly index = signal(0);
  protected readonly url = signal<string | null>(null);
  protected readonly isPdf = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly current = computed(() => this.items()[this.index()] ?? null);
  /** Only our own blob: URLs are trusted, and the frame is sandboxed with no permissions. */
  protected readonly trusted = computed((): SafeResourceUrl | null => {
    const url = this.url();
    return url?.startsWith('blob:') ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });
  private request = 0;

  constructor() {
    effect(() => this.index.set(Math.min(this.start(), Math.max(0, this.items().length - 1))));
    effect(() => {
      const item = this.current();
      untracked(() => void this.show(item));
    });
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  private async show(item: ViewerItem | null): Promise<void> {
    const id = ++this.request;
    this.revoke();
    this.error.set(null);
    if (!item) {
      return;
    }
    try {
      const blob = await item.load();
      if (id !== this.request) {
        return;
      }
      this.isPdf.set(blob.type === 'application/pdf');
      this.url.set(URL.createObjectURL(blob));
    } catch {
      if (id === this.request) {
        this.error.set('This file could not be opened. Try again.');
      }
    }
  }

  private revoke(): void {
    const url = this.url();
    if (url) {
      URL.revokeObjectURL(url);
      this.url.set(null);
    }
  }
}
