import { Injectable, inject, signal } from '@angular/core';
import { InMemoryStores } from '../../core/session/in-memory-stores';

export interface CustomerFilters {
  q: string;
  partyType: string | null;
  kycStatus: string | null;
  supervision: string | null;
  creditOfficerId: number | null;
  oldestFirst: boolean;
  page: number;
}

const EMPTY: CustomerFilters = {
  q: '',
  partyType: null,
  kycStatus: null,
  supervision: null,
  creditOfficerId: null,
  oldestFirst: false,
  page: 1,
};

/**
 * The customers list filters, remembered for the session while the user moves around (UX 5.4). Kept in memory only
 * and cleared on sign-out or when a different person signs in.
 */
@Injectable({ providedIn: 'root' })
export class CustomerFiltersStore {
  readonly filters = signal<CustomerFilters>(EMPTY);

  constructor() {
    inject(InMemoryStores).register(() => this.filters.set(EMPTY));
  }

  update(change: Partial<CustomerFilters>): void {
    this.filters.update((current) => ({ ...current, page: 1, ...change }));
  }

  goTo(page: number): void {
    this.filters.update((current) => ({ ...current, page }));
  }

  clear(): void {
    this.filters.set(EMPTY);
  }

  get hasFilters(): boolean {
    const current = this.filters();
    return (
      current.q.trim().length > 0 ||
      current.partyType !== null ||
      current.kycStatus !== null ||
      current.supervision !== null ||
      current.creditOfficerId !== null
    );
  }
}
