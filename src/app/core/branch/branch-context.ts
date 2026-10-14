import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/**
 * The branch the user is working in (frontend plan 5, F2-07). `X-Branch-Id` is sent only when the user switched
 * away from the branch in their token. Switching reloads the profile, so permissions follow the branch.
 */
@Injectable({ providedIn: 'root' })
export class BranchContext {
  private readonly auth = inject(AuthService);
  private readonly switchedTo = signal<number | null>(null);

  readonly override = this.switchedTo.asReadonly();

  readonly current = computed(() => {
    const me = this.auth.me();
    if (!me) {
      return null;
    }
    return me.branches.find((branch) => branch.branchId === me.branchId) ?? null;
  });

  readonly canSwitch = computed(() => {
    const me = this.auth.me();
    return !!me && me.canSwitchBranch && me.branches.length > 1;
  });

  constructor() {
    // A new session starts in the token's branch.
    this.auth.sessionStarted$.subscribe(() => this.switchedTo.set(null));
  }

  async switchTo(branchId: number): Promise<void> {
    const previous = this.switchedTo();
    this.switchedTo.set(branchId === this.auth.tokenBranchId() ? null : branchId);
    try {
      await this.auth.loadMe();
    } catch (error) {
      this.switchedTo.set(previous);
      throw error;
    }
  }
}
