import { Injectable, inject, signal } from '@angular/core';
import { InMemoryStores } from '../../core/session/in-memory-stores';

/**
 * The accounts list search and status filter, remembered for the session while the user moves around (UX 5.4), and
 * how global search hands a term to the list (P12). Kept in memory only and cleared when a different person signs in.
 */
@Injectable({ providedIn: 'root' })
export class AccountFiltersStore {
  readonly term = signal('');
  readonly status = signal<string | null>(null);
  readonly page = signal(1);

  constructor() {
    inject(InMemoryStores).register(() => this.clear());
  }

  /** Starts a new search: other filters cleared, first page. */
  search(term: string): void {
    this.status.set(null);
    this.page.set(1);
    this.term.set(term.trim());
  }

  clear(): void {
    this.term.set('');
    this.status.set(null);
    this.page.set(1);
  }
}
