import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

/** Cross-tab sign-out (frontend plan 6.1). Carries no personal data. */
@Injectable({ providedIn: 'root' })
export class SignOutBroadcast implements OnDestroy {
  private readonly channel: BroadcastChannel | null =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ib.auth');
  private readonly signedOut = new Subject<void>();

  readonly signedOut$ = this.signedOut.asObservable();

  constructor() {
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === 'signed-out') {
          this.signedOut.next();
        }
      };
    }
  }

  announce(): void {
    this.channel?.postMessage('signed-out');
  }

  ngOnDestroy(): void {
    this.channel?.close();
  }
}
