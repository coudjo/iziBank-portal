import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import type { PartyOverview } from '../../core/api/api-types';
import { ApiProblem, toApiProblem } from '../../core/errors/api-problem';
import { InMemoryStores } from '../../core/session/in-memory-stores';
import { CustomersClient } from './customers.client';

/**
 * The open customer record, shared by the record page and its tabs. Provided by the record page, so it lives only
 * while the record is open, and it is cleared when a different person signs in.
 */
@Injectable()
export class CustomerRecordStore implements OnDestroy {
  private readonly client = inject(CustomersClient);

  readonly overview = signal<PartyOverview | null>(null);
  readonly problem = signal<ApiProblem | null>(null);
  readonly loading = signal(false);
  readonly party = computed(() => this.overview()?.party ?? null);

  private partyId: number | null = null;
  private request = 0;

  private readonly unregister = inject(InMemoryStores).register(() => this.reset());

  ngOnDestroy(): void {
    this.unregister();
  }

  async load(partyId: number): Promise<void> {
    if (this.partyId !== partyId) {
      this.overview.set(null);
    }
    this.partyId = partyId;
    const id = ++this.request;
    this.loading.set(true);
    this.problem.set(null);
    try {
      const overview = await this.client.overview(partyId);
      if (id === this.request) {
        this.overview.set(overview);
      }
    } catch (failure) {
      if (id === this.request) {
        this.overview.set(null);
        this.problem.set(toApiProblem(failure));
      }
    } finally {
      if (id === this.request) {
        this.loading.set(false);
      }
    }
  }

  reload(): Promise<void> {
    return this.partyId === null ? Promise.resolve() : this.load(this.partyId);
  }

  private reset(): void {
    this.request++;
    this.partyId = null;
    this.overview.set(null);
    this.problem.set(null);
  }
}
