import { LiveAnnouncer } from '@angular/cdk/a11y';
import { EnvironmentInjector, Injectable, Injector, inject } from '@angular/core';
import type { NzMessageService } from 'ng-zorro-antd/message';

type Tone = 'success' | 'error' | 'info';

/**
 * Short confirmations (UX 5.6): auto-dismiss after 5 seconds, announced to screen readers.
 * The message component is loaded on first use to keep it out of the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly environment = inject(EnvironmentInjector);
  private readonly announcer = inject(LiveAnnouncer);
  private messages: NzMessageService | null = null;

  success(text: string): void {
    this.show('success', text);
  }

  error(text: string): void {
    this.show('error', text);
  }

  info(text: string): void {
    this.show('info', text);
  }

  private show(tone: Tone, text: string): void {
    void this.announcer.announce(text, tone === 'error' ? 'assertive' : 'polite');
    void this.service().then((messages) => messages[tone](text, { nzDuration: 5000 }));
  }

  private async service(): Promise<NzMessageService> {
    if (!this.messages) {
      const { NzMessageService } = await import('ng-zorro-antd/message');
      this.messages = Injector.create({
        providers: [{ provide: NzMessageService }],
        parent: this.environment,
      }).get(NzMessageService);
    }
    return this.messages;
  }
}
