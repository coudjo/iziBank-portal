import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  CreateIndividualRequest,
  CreatedParty,
  CreditOfficerView,
  PartyDetail,
  PartyOverview,
  PartySearchPage,
  PartySearchRequest,
} from '../../core/api/api-types';
import { ConfigService } from '../../core/config/config.service';

/**
 * Customer calls (frontend plan 3, rule 4). Search is a POST so names, mobiles and ID numbers never appear in URLs
 * (API ADR A4-n).
 */
@Injectable({ providedIn: 'root' })
export class CustomersClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  search(request: Partial<PartySearchRequest>): Promise<PartySearchPage> {
    return firstValueFrom(this.http.post<PartySearchPage>(`${this.base}/parties/search`, request));
  }

  get(partyId: number): Promise<PartyDetail> {
    return firstValueFrom(this.http.get<PartyDetail>(`${this.base}/parties/${partyId}`));
  }

  overview(partyId: number): Promise<PartyOverview> {
    return firstValueFrom(this.http.get<PartyOverview>(`${this.base}/parties/${partyId}/overview`));
  }

  createIndividual(request: CreateIndividualRequest): Promise<CreatedParty> {
    return firstValueFrom(this.http.post<CreatedParty>(`${this.base}/parties/individuals`, request));
  }

  updateIndividual(partyId: number, request: CreateIndividualRequest): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/parties/${partyId}/individual`, request));
  }

  creditOfficers(): Promise<CreditOfficerView[]> {
    return firstValueFrom(this.http.get<CreditOfficerView[]>(`${this.base}/credit-officers`));
  }
}
