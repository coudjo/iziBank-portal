import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import type { AccountBalanceView, AccountView } from '../../core/api/api-types';
import { ApiProblem, toApiProblem } from '../../core/errors/api-problem';
import { InMemoryStores } from '../../core/session/in-memory-stores';
import { AccountsClient } from './accounts.client';

/**
 * The open account, shared by the record page and its tabs. Provided by the record page, so it lives only while
 * the record is open, and it is cleared when a different person signs in.
 */
@Injectable()
export class AccountRecordStore implements OnDestroy {
  private readonly client = inject(AccountsClient);

  readonly account = signal<AccountView | null>(null);
  readonly problem = signal<ApiProblem | null>(null);
  readonly loading = signal(false);
  readonly closed = computed(() => !!this.account()?.closedOn);
  readonly approved = computed(() => this.account()?.supervisionState !== 'PENDING');
  /** Changes need an approved, open account (API ADR A5-o). */
  readonly changeable = computed(() => !!this.account() && this.approved() && !this.closed());

  private accountId: number | null = null;
  private request = 0;
  private readonly unregister = inject(InMemoryStores).register(() => this.reset());

  ngOnDestroy(): void {
    this.unregister();
  }

  get id(): number | null {
    return this.accountId;
  }

  async load(accountId: number): Promise<void> {
    if (this.accountId !== accountId) {
      this.account.set(null);
    }
    this.accountId = accountId;
    const id = ++this.request;
    this.loading.set(true);
    this.problem.set(null);
    try {
      const account = await this.client.get(accountId);
      if (id === this.request) {
        this.account.set(account);
      }
    } catch (failure) {
      if (id === this.request) {
        this.account.set(null);
        this.problem.set(toApiProblem(failure));
      }
    } finally {
      if (id === this.request) {
        this.loading.set(false);
      }
    }
  }

  reload(): Promise<void> {
    return this.accountId === null ? Promise.resolve() : this.load(this.accountId);
  }

  /** After a hold or freeze: the new balance and freeze flag without another round trip. */
  applyBalance(balance: AccountBalanceView, isFreezed: boolean): void {
    const account = this.account();
    if (account) {
      const status =
        account.supervisionState === 'PENDING'
          ? 'PENDING_SUPERVISION'
          : account.closedOn
            ? 'CLOSED'
            : isFreezed
              ? 'FROZEN'
              : account.isDormant
                ? 'DORMANT'
                : 'ACTIVE';
      this.account.set({ ...account, balance, status, condition: { ...account.condition, isFreezed } });
    }
  }

  private reset(): void {
    this.request++;
    this.accountId = null;
    this.account.set(null);
    this.problem.set(null);
  }
}
