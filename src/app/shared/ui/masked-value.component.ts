import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { maskTail } from '../../core/formats/masking';

const REVEAL_MS = 30_000;

/**
 * `ib-masked-value` (UX 5.5, F4-06): shows the last four characters with a Show control. A revealed value hides
 * again after 30 seconds. Changes are announced.
 */
@Component({
  selector: 'ib-masked-value',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (value()) {
      <span class="value ib-num" data-testid="masked-value">{{ shown() }}</span>
      <button type="button" class="toggle" [attr.aria-pressed]="revealed()" (click)="toggle()">
        <span nz-icon [nzType]="revealed() ? 'eye-invisible' : 'eye'" aria-hidden="true"></span>
        {{ revealed() ? 'Hide' : 'Show' }}<span class="ib-visually-hidden"> {{ label() }}</span>
      </button>
    } @else {
      <span class="none">Not given</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--ib-space-2);
      flex-wrap: wrap;
    }
    .toggle {
      display: inline-flex;
      align-items: center;
      gap: var(--ib-space-1);
      font: inherit;
      color: var(--ib-primary);
      background: none;
      border: 0;
      padding: 0 var(--ib-space-1);
      min-height: 24px;
      cursor: pointer;
      text-decoration: underline;
    }
    .none {
      color: var(--ib-ink-meta);
    }
  `,
})
export class MaskedValueComponent {
  readonly value = input<string | null>(null);
  /** What the value is, for screen readers: "ID number". */
  readonly label = input.required<string>();
  /** Shows the revealed value in a display format (for example a phone number). */
  readonly format = input<(value: string) => string>((value) => value);

  protected readonly revealed = signal(false);
  protected readonly shown = computed(() => {
    const value = this.value() ?? '';
    return this.revealed() ? this.format()(value) : maskTail(value);
  });

  private readonly announcer = inject(LiveAnnouncer);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  protected toggle(): void {
    if (this.revealed()) {
      this.hide(`${this.label()} hidden`);
      return;
    }
    this.revealed.set(true);
    void this.announcer.announce(`${this.label()} shown for 30 seconds`, 'polite');
    this.clearTimer();
    this.timer = setTimeout(() => this.hide(`${this.label()} hidden again`), REVEAL_MS);
  }

  private hide(message: string): void {
    this.clearTimer();
    this.revealed.set(false);
    void this.announcer.announce(message, 'polite');
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
