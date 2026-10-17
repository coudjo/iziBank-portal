import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AccountBalanceView,
  ActivityPage,
  AccountClassificationView,
  AccountCloseStatus,
  AccountOpened,
  AccountPage,
  AccountSearchRequest,
  AccountView,
  ClassificationOption,
  FreezeActionRequest,
  FreezeActionResult,
  FreezeActionView,
  OpenAccountRequest,
  ProductPage,
} from '../../core/api/api-types';
import { ConfigService } from '../../core/config/config.service';

/**
 * Account calls (API A5). Search is a POST so customer names and numbers never appear in URLs (API ADR A5-p).
 * Opening and holds carry an `Idempotency-Key`, so a retry after a timeout cannot duplicate (UX 9 request 8).
 */
@Injectable({ providedIn: 'root' })
export class AccountsClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  search(request: Partial<AccountSearchRequest>): Promise<AccountPage> {
    return firstValueFrom(this.http.post<AccountPage>(`${this.base}/accounts/search`, request));
  }

  get(accountId: number): Promise<AccountView> {
    return firstValueFrom(this.http.get<AccountView>(`${this.base}/accounts/${accountId}`));
  }

  balance(accountId: number): Promise<AccountBalanceView> {
    return firstValueFrom(this.http.get<AccountBalanceView>(`${this.base}/accounts/${accountId}/balance`));
  }

  /** Products that can be opened at the counter: approved, active, not frozen, savings or current. */
  openableProducts(): Promise<ProductPage> {
    return firstValueFrom(
      this.http.get<ProductPage>(`${this.base}/products`, { params: { openable: true, pageSize: 100 } }),
    );
  }

  open(request: OpenAccountRequest, idempotencyKey: string): Promise<AccountOpened> {
    return firstValueFrom(
      this.http.post<AccountOpened>(`${this.base}/accounts`, request, { headers: key(idempotencyKey) }),
    );
  }

  approve(accountId: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/accounts/${accountId}/supervise`, null));
  }

  reject(accountId: number, reason: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/accounts/${accountId}/reject`, { reason }));
  }

  freezeHistory(accountId: number): Promise<FreezeActionView[]> {
    return firstValueFrom(
      this.http.get<FreezeActionView[]>(`${this.base}/accounts/${accountId}/freeze-actions`),
    );
  }

  freezeAction(
    accountId: number,
    request: FreezeActionRequest,
    idempotencyKey: string,
  ): Promise<FreezeActionResult> {
    return firstValueFrom(
      this.http.post<FreezeActionResult>(`${this.base}/accounts/${accountId}/freeze-actions`, request, {
        headers: key(idempotencyKey),
      }),
    );
  }

  closeCheck(accountId: number): Promise<AccountCloseStatus> {
    return firstValueFrom(
      this.http.get<AccountCloseStatus>(`${this.base}/accounts/${accountId}/close-check`),
    );
  }

  close(accountId: number, closeReasonId: number): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/accounts/${accountId}/close`, { closeReasonId }),
    );
  }

  dormancy(accountId: number, step: 'mark' | 'reactivate'): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/accounts/${accountId}/dormancy/${step}`, null));
  }

  classificationCatalog(): Promise<ClassificationOption[]> {
    return firstValueFrom(this.http.get<ClassificationOption[]>(`${this.base}/account-classifications`));
  }

  classifications(accountId: number): Promise<AccountClassificationView[]> {
    return firstValueFrom(
      this.http.get<AccountClassificationView[]>(`${this.base}/accounts/${accountId}/classifications`),
    );
  }

  assignClassification(
    accountId: number,
    classificationId: number,
    subClassificationId: number | null,
  ): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/accounts/${accountId}/classifications`, {
        accountClassificationId: classificationId,
        accountSubClassificationId: subClassificationId,
      }),
    );
  }

  removeClassification(accountId: number, assignmentId: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/accounts/${accountId}/classifications/${assignmentId}`),
    );
  }

  addReminder(accountId: number, reminderText: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/accounts/${accountId}/reminders`, { reminderText }),
    );
  }

  removeReminder(accountId: number, reminderId: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/accounts/${accountId}/reminders/${reminderId}`),
    );
  }

  /** The activity log for this account (audit permission). Account numbers are not personal data. */
  activity(accountNumber: string, page: number, pageSize: number): Promise<ActivityPage> {
    return firstValueFrom(
      this.http.get<ActivityPage>(`${this.base}/audit/activity`, {
        params: { entityType: 'Account', entityId: accountNumber, page, pageSize },
      }),
    );
  }
}

function key(value: string): HttpHeaders {
  return new HttpHeaders({ 'Idempotency-Key': value });
}
