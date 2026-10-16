import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ButtonComponent } from '../ui/button.component';
import { formatSize, newIdempotencyKey } from './image-compress';
import { SIGNATURE_INK } from './pixel-colours';

export const SIGNATURE_MAX_BYTES = 1024 * 1024;
export const SIGNATURE_MAX_WIDTH = 2000;
export const SIGNATURE_MAX_HEIGHT = 1000;
const HEIGHT_CSS = 200;

export interface CapturedSignature {
  blob: Blob;
  width: number;
  height: number;
  idempotencyKey: string;
}

type Point = [x: number, y: number];

/**
 * `ib-signature-pad` (frontend plan 6.6, F4-04): finger, stylus or mouse through pointer events, scaled for the
 * device pixel ratio but never beyond 2000 × 1000 px. Accept needs a signature and the confirmation tick. Output is
 * a PNG of at most 1 MB. Drawing is path-based input, so it has no keyboard equivalent (WCAG 2.1.1 exception).
 */
@Component({
  selector: 'ib-signature-pad',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .pad {
      position: relative;
      width: 100%;
      height: ${HEIGHT_CSS}px;
      border: 1px solid var(--ib-border-control);
      border-radius: var(--ib-radius-md);
      background: var(--ib-surface);
      touch-action: none;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      cursor: crosshair;
    }
    .line {
      position: absolute;
      left: 8%;
      right: 8%;
      bottom: 28%;
      border-bottom: 1px dashed var(--ib-border-control);
      pointer-events: none;
    }
    .hint {
      position: absolute;
      left: 8%;
      bottom: calc(28% - 22px);
      color: var(--ib-ink-meta);
      font-size: 13px;
      pointer-events: none;
    }
    .confirm {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
      min-height: var(--ib-touch-target);
      margin-top: var(--ib-space-2);
      cursor: pointer;
    }
    .confirm input {
      width: 20px;
      height: 20px;
      accent-color: var(--ib-primary);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-2);
    }
    .meta {
      margin: var(--ib-space-2) 0 0;
      color: var(--ib-ink-muted);
    }
    .error {
      margin: var(--ib-space-2) 0 0;
      color: var(--ib-danger-text);
    }
  `,
  template: `
    <div class="pad" #pad>
      <canvas
        #canvas
        role="img"
        aria-label="Signature area. Sign with a finger, stylus or mouse."
        (pointerdown)="down($event)"
        (pointermove)="move($event)"
        (pointerup)="up($event)"
        (pointercancel)="up($event)"
      ></canvas>
      <span class="line" aria-hidden="true"></span>
      @if (!hasInk()) {
        <span class="hint" aria-hidden="true">Sign above the line</span>
      }
    </div>
    <label class="confirm">
      <input type="checkbox" [checked]="confirmed()" (change)="confirmed.set($any($event.target).checked)" />
      The customer has signed in front of me
    </label>
    <div class="actions">
      <ib-button (click)="clear()" [disabled]="!hasInk()">Clear</ib-button>
      <ib-button variant="primary" [disabled]="!canAccept()" [loading]="working()" (click)="accept()"
        >Accept</ib-button
      >
    </div>
    <div aria-live="polite">
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      @if (result(); as done) {
        <p class="meta" data-testid="signature-result">
          Signature ready: PNG, {{ size(done.blob.size) }}, {{ done.width }} × {{ done.height }} px
        </p>
      }
    </div>
  `,
})
export class SignaturePadComponent {
  readonly accepted = output<CapturedSignature>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly pad = viewChild.required<ElementRef<HTMLElement>>('pad');
  protected readonly hasInk = signal(false);
  protected readonly confirmed = signal(false);
  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<CapturedSignature | null>(null);
  protected readonly canAccept = computed(() => this.hasInk() && this.confirmed());

  /** Strokes in CSS pixels, kept so the drawing survives a resize. */
  private strokes: Point[][] = [];
  private current: Point[] | null = null;
  private scale = 1;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.resize();
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(this.pad().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  clear(): void {
    this.strokes = [];
    this.current = null;
    this.hasInk.set(false);
    this.result.set(null);
    this.error.set(null);
    this.redraw();
  }

  protected down(event: PointerEvent): void {
    event.preventDefault();
    this.canvas().nativeElement.setPointerCapture(event.pointerId);
    this.current = [this.point(event)];
    this.strokes.push(this.current);
    this.result.set(null);
    this.redraw();
  }

  protected move(event: PointerEvent): void {
    if (!this.current) {
      return;
    }
    const events = event.getCoalescedEvents?.() ?? [event];
    for (const item of events.length > 0 ? events : [event]) {
      this.current.push(this.point(item));
    }
    this.hasInk.set(true);
    this.redraw();
  }

  protected up(event: PointerEvent): void {
    if (this.current && this.current.length === 1) {
      // A tap leaves a dot.
      this.current.push([this.current[0][0] + 0.5, this.current[0][1] + 0.5]);
      this.hasInk.set(true);
      this.redraw();
    }
    this.current = null;
    const canvas = this.canvas().nativeElement;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  protected async accept(): Promise<void> {
    if (!this.canAccept()) {
      return;
    }
    this.working.set(true);
    this.error.set(null);
    try {
      const canvas = this.canvas().nativeElement;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob || blob.size > SIGNATURE_MAX_BYTES) {
        this.error.set('The signature could not be saved as a small enough image. Clear it and sign again.');
        return;
      }
      const signature = {
        blob,
        width: canvas.width,
        height: canvas.height,
        idempotencyKey: newIdempotencyKey(),
      };
      this.result.set(signature);
      this.accepted.emit(signature);
    } finally {
      this.working.set(false);
    }
  }

  protected readonly size = formatSize;

  private point(event: PointerEvent): Point {
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  private resize(): void {
    const canvas = this.canvas().nativeElement;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || HEIGHT_CSS;
    // Device pixel ratio for sharp lines, capped so the PNG stays within 2000 × 1000 px.
    this.scale = Math.min(
      window.devicePixelRatio || 1,
      SIGNATURE_MAX_WIDTH / width,
      SIGNATURE_MAX_HEIGHT / height,
    );
    canvas.width = Math.floor(width * this.scale);
    canvas.height = Math.floor(height * this.scale);
    this.redraw();
  }

  private redraw(): void {
    const canvas = this.canvas().nativeElement;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = SIGNATURE_INK;
    for (const stroke of this.strokes) {
      context.beginPath();
      stroke.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
      context.stroke();
    }
  }
}
