import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { LedgerAccountPage, LedgerAccountRequest, LedgerAccountView } from '../../core/api/api-types';
import { ConfigService } from '../../core/config/config.service';
import { EditOutcome, ListParams, query } from '../../shared/data/list-params';

/** Chart of accounts calls (API A3-03). Codes and names here are not personal data. */
@Injectable({ providedIn: 'root' })
export class LedgerClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  ledgerAccounts(params: ListParams): Promise<LedgerAccountPage> {
    return firstValueFrom(
      this.http.get<LedgerAccountPage>(`${this.base}/ledger-accounts`, {
        params: query({ ...params, ledgerAccountTypeId: params.typeId }),
      }),
    );
  }

  ledgerAccount(ledgerAccountId: number): Promise<LedgerAccountView> {
    return firstValueFrom(
      this.http.get<LedgerAccountView>(`${this.base}/ledger-accounts/${ledgerAccountId}`),
    );
  }

  createLedgerAccount(request: LedgerAccountRequest): Promise<{ id: number }> {
    return firstValueFrom(this.http.post<{ id: number }>(`${this.base}/ledger-accounts`, request));
  }

  async updateLedgerAccount(ledgerAccountId: number, request: LedgerAccountRequest): Promise<EditOutcome> {
    const body = await firstValueFrom(
      this.http.put<{ changeRequestId?: number } | null>(
        `${this.base}/ledger-accounts/${ledgerAccountId}`,
        request,
      ),
    );
    return { changeRequestId: body?.changeRequestId ?? null };
  }
}
