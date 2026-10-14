import { Injectable } from '@angular/core';

/**
 * Feature stores that hold customer data in memory register a reset here. When a different person signs in
 * through the re-sign-in dialog, every store is cleared (frontend plan 6.1).
 */
@Injectable({ providedIn: 'root' })
export class InMemoryStores {
  private readonly resets = new Set<() => void>();

  register(reset: () => void): () => void {
    this.resets.add(reset);
    return () => this.resets.delete(reset);
  }

  resetAll(): void {
    for (const reset of this.resets) {
      reset();
    }
  }
}
