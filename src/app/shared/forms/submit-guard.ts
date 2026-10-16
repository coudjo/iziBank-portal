import { signal } from '@angular/core';

/**
 * SubmitGuard (frontend plan 6.5): while a submission runs, further submissions are ignored, so a second click or
 * Enter press cannot send the form twice. `busy` drives the button's loading state.
 */
export class SubmitGuard {
  private readonly running = signal(false);
  readonly busy = this.running.asReadonly();

  /** Runs `work` unless a submission is already running; returns undefined when it was ignored. */
  async run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (this.running()) {
      return undefined;
    }
    this.running.set(true);
    try {
      return await work();
    } finally {
      this.running.set(false);
    }
  }
}
