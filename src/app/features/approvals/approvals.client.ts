import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ChangeRequestView, LedgerAccountPage, LedgerAccountView } from '../../core/api/api-types';
import { ConfigService } from '../../core/config/config.service';

/** Approval calls outside the customer feature: security change requests and the chart of accounts. */
@Injectable({ providedIn: 'root' })
export class ApprovalsClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  changeRequests(status = 'PENDING'): Promise<ChangeRequestView[]> {
    return firstValueFrom(
      this.http.get<ChangeRequestView[]>(`${this.base}/change-requests`, { params: { status } }),
    );
  }

  changeRequest(id: number): Promise<ChangeRequestView> {
    return firstValueFrom(this.http.get<ChangeRequestView>(`${this.base}/change-requests/${id}`));
  }

  approveChange(id: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/change-requests/${id}/approve`, null));
  }

  rejectChange(id: number, reason: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/change-requests/${id}/reject`, { reason }));
  }

  ledgerAccounts(params: {
    supervisionState?: string;
    page?: number;
    pageSize?: number;
  }): Promise<LedgerAccountPage> {
    return firstValueFrom(
      this.http.get<LedgerAccountPage>(`${this.base}/ledger-accounts`, {
        params: {
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 100,
          ...(params.supervisionState ? { supervisionState: params.supervisionState } : {}),
        },
      }),
    );
  }

  ledgerAccount(id: number): Promise<LedgerAccountView> {
    return firstValueFrom(this.http.get<LedgerAccountView>(`${this.base}/ledger-accounts/${id}`));
  }

  /** Approves a new account, or its pending rename (one endpoint for both). */
  approveLedger(id: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/ledger-accounts/${id}/approve`, null));
  }

  rejectLedger(id: number, reason: string | null): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/ledger-accounts/${id}/reject`, { reason }));
  }
}
