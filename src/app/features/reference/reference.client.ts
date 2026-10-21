import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  BranchRequest,
  BranchView,
  BusinessDayPage,
  CreditOfficerView,
  CurrencyRequest,
  CurrencyView,
  HolidayView,
  InstitutionProfileView,
  LookupRow,
  LookupTypeInfo,
  UpdateInstitutionProfileRequest,
} from '../../core/api/api-types';
import { ConfigService } from '../../core/config/config.service';
import { LookupsService } from '../../core/lookups/lookups.service';
import { query } from '../../shared/data/list-params';

/**
 * Reference data calls (API A3-01, A3-02, A2-03, A4-11): institution, branches, currencies, holidays, business
 * days, lookups and credit officers. None of it is personal data except credit officer names, which travel in
 * bodies only. Lookup edits clear the portal's lookup cache so forms see them at once.
 */
@Injectable({ providedIn: 'root' })
export class ReferenceClient {
  private readonly http = inject(HttpClient);
  private readonly lookupCache = inject(LookupsService);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  institution(): Promise<InstitutionProfileView> {
    return firstValueFrom(this.http.get<InstitutionProfileView>(`${this.base}/institution-profile`));
  }

  updateInstitution(request: UpdateInstitutionProfileRequest): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/institution-profile`, request));
  }

  branches(includeInactive = true): Promise<BranchView[]> {
    return firstValueFrom(
      this.http.get<BranchView[]>(`${this.base}/branches`, { params: query({ includeInactive }) }),
    );
  }

  createBranch(request: BranchRequest): Promise<{ id: number }> {
    return firstValueFrom(this.http.post<{ id: number }>(`${this.base}/branches`, request));
  }

  updateBranch(branchId: number, request: BranchRequest): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/branches/${branchId}`, request));
  }

  currencies(): Promise<CurrencyView[]> {
    return firstValueFrom(this.http.get<CurrencyView[]>(`${this.base}/currencies`));
  }

  createCurrency(request: CurrencyRequest): Promise<{ id: number }> {
    return firstValueFrom(this.http.post<{ id: number }>(`${this.base}/currencies`, request));
  }

  updateCurrency(currencyId: number, request: CurrencyRequest): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/currencies/${currencyId}`, request));
  }

  holidays(year: number): Promise<HolidayView[]> {
    return firstValueFrom(this.http.get<HolidayView[]>(`${this.base}/holidays`, { params: { year } }));
  }

  addHoliday(holidayDate: string, remarks: string | null): Promise<{ id: number }> {
    return firstValueFrom(this.http.post<{ id: number }>(`${this.base}/holidays`, { holidayDate, remarks }));
  }

  removeHoliday(holidayId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/holidays/${holidayId}`));
  }

  businessDays(branchId: number, page = 1, pageSize = 10): Promise<BusinessDayPage> {
    return firstValueFrom(
      this.http.get<BusinessDayPage>(`${this.base}/branches/${branchId}/business-days`, {
        params: { page, pageSize },
      }),
    );
  }

  openDay(branchId: number, workingDate: string): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(`${this.base}/branches/${branchId}/business-days/open`, { workingDate }),
    );
  }

  closeDay(branchId: number, workingDate: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/branches/${branchId}/business-days/${workingDate}/close`, null),
    );
  }

  lookupTypes(): Promise<LookupTypeInfo[]> {
    return firstValueFrom(this.http.get<LookupTypeInfo[]>(`${this.base}/lookups`));
  }

  lookup(slug: string): Promise<LookupRow[]> {
    return firstValueFrom(
      this.http.get<LookupRow[]>(`${this.base}/lookups/${encodeURIComponent(slug)}`, {
        params: { includeInactive: true },
      }),
    );
  }

  async addLookup(slug: string, code: string, name: string): Promise<{ id: number }> {
    const created = await firstValueFrom(
      this.http.post<{ id: number }>(`${this.base}/lookups/${encodeURIComponent(slug)}`, { code, name }),
    );
    this.lookupCache.forget(slug);
    return created;
  }

  async updateLookup(slug: string, row: LookupRow, name: string, isActive: boolean): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${this.base}/lookups/${encodeURIComponent(slug)}/${row.id}`, {
        code: row.code,
        name,
        isActive,
      }),
    );
    this.lookupCache.forget(slug);
  }

  creditOfficers(): Promise<CreditOfficerView[]> {
    return firstValueFrom(
      this.http.get<CreditOfficerView[]>(`${this.base}/credit-officers`, {
        params: { includeDisabled: true },
      }),
    );
  }

  designateCreditOfficer(staffUserId: number): Promise<{ id: number }> {
    return firstValueFrom(this.http.post<{ id: number }>(`${this.base}/credit-officers`, { staffUserId }));
  }

  setCreditOfficerDisabled(creditOfficerId: number, isDisabled: boolean): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(`${this.base}/credit-officers/${creditOfficerId}`, { isDisabled }),
    );
  }
}
