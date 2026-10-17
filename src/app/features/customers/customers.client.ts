import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ActivityPage,
  BeneficialOwnerView,
  CreateBusinessRequest,
  CreateGroupRequest,
  CreateIndividualRequest,
  CreatedParty,
  CreditOfficerView,
  DocumentDetail,
  DocumentRequest,
  DocumentSummary,
  KycChecklist,
  NextOfKinRequest,
  NextOfKinView,
  PhotoView,
  RegulatoryAttributeView,
  SignatureView,
  GroupMemberView,
  MemberRequest,
  OwnerShareRequest,
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

  createBusiness(request: CreateBusinessRequest): Promise<CreatedParty> {
    return firstValueFrom(this.http.post<CreatedParty>(`${this.base}/parties/businesses`, request));
  }

  updateBusiness(partyId: number, request: CreateBusinessRequest): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/parties/${partyId}/business`, request));
  }

  createGroup(request: CreateGroupRequest): Promise<CreatedParty> {
    return firstValueFrom(this.http.post<CreatedParty>(`${this.base}/parties/groups`, request));
  }

  updateGroup(partyId: number, request: CreateGroupRequest): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/parties/${partyId}/group`, request));
  }

  owners(partyId: number): Promise<BeneficialOwnerView[]> {
    return firstValueFrom(
      this.http.get<BeneficialOwnerView[]>(`${this.base}/parties/${partyId}/beneficial-owners`),
    );
  }

  replaceOwners(partyId: number, owners: OwnerShareRequest[]): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(`${this.base}/parties/${partyId}/beneficial-owners`, { beneficialOwners: owners }),
    );
  }

  members(partyId: number): Promise<GroupMemberView[]> {
    return firstValueFrom(this.http.get<GroupMemberView[]>(`${this.base}/parties/${partyId}/members`));
  }

  addMember(partyId: number, request: MemberRequest): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/parties/${partyId}/members`, request));
  }

  leave(partyId: number, memberPartyId: number, leftOn: string | null): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/parties/${partyId}/members/${memberPartyId}/leave`, { leftOn }),
    );
  }

  changeRole(partyId: number, memberPartyId: number, groupMemberRoleId: number): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(`${this.base}/parties/${partyId}/members/${memberPartyId}/role`, {
        groupMemberRoleId,
      }),
    );
  }

  checklist(partyId: number): Promise<KycChecklist> {
    return firstValueFrom(this.http.get<KycChecklist>(`${this.base}/parties/${partyId}/kyc/checklist`));
  }

  /** KYC verify is also the approval of the customer record (ADR D3). */
  verifyKyc(partyId: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/parties/${partyId}/kyc/verify`, null));
  }

  rejectKyc(partyId: number, reason: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/parties/${partyId}/kyc/reject`, { reason }));
  }

  documents(partyId: number): Promise<DocumentSummary[]> {
    return firstValueFrom(this.http.get<DocumentSummary[]>(`${this.base}/parties/${partyId}/documents`));
  }

  document(partyId: number, documentId: number): Promise<DocumentDetail> {
    return firstValueFrom(
      this.http.get<DocumentDetail>(`${this.base}/parties/${partyId}/documents/${documentId}`),
    );
  }

  addDocument(partyId: number, request: DocumentRequest): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(`${this.base}/parties/${partyId}/documents`, request),
    );
  }

  updateDocument(partyId: number, documentId: number, request: DocumentRequest): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(`${this.base}/parties/${partyId}/documents/${documentId}`, request),
    );
  }

  deleteDocument(partyId: number, documentId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/parties/${partyId}/documents/${documentId}`));
  }

  /** Images are fetched only when someone opens them (UX 5.5), as a Blob kept in memory. */
  documentImage(partyId: number, documentId: number): Promise<Blob> {
    return this.blob(`parties/${partyId}/documents/${documentId}/image`);
  }

  photo(partyId: number): Promise<PhotoView> {
    return firstValueFrom(this.http.get<PhotoView>(`${this.base}/parties/${partyId}/photo`));
  }

  photoImage(partyId: number): Promise<Blob> {
    return this.blob(`parties/${partyId}/photo/image`);
  }

  approvePhoto(partyId: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/parties/${partyId}/photo/supervise`, null));
  }

  rejectPhoto(partyId: number, reason: string | null): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/parties/${partyId}/photo/reject`, { reason }));
  }

  signature(partyId: number): Promise<SignatureView> {
    return firstValueFrom(this.http.get<SignatureView>(`${this.base}/parties/${partyId}/signature`));
  }

  signatureImage(partyId: number, pending: boolean): Promise<Blob> {
    return this.blob(`parties/${partyId}/signature/image?pending=${pending}`);
  }

  approveSignature(partyId: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/parties/${partyId}/signature/supervise`, null));
  }

  rejectSignature(partyId: number, reason: string | null): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/parties/${partyId}/signature/reject`, { reason }),
    );
  }

  nextOfKin(partyId: number): Promise<NextOfKinView[]> {
    return firstValueFrom(this.http.get<NextOfKinView[]>(`${this.base}/parties/${partyId}/next-of-kin`));
  }

  addNextOfKin(partyId: number, request: NextOfKinRequest): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/parties/${partyId}/next-of-kin`, request));
  }

  updateNextOfKin(partyId: number, id: number, request: NextOfKinRequest): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/parties/${partyId}/next-of-kin/${id}`, request));
  }

  deleteNextOfKin(partyId: number, id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/parties/${partyId}/next-of-kin/${id}`));
  }

  attributes(partyId: number): Promise<RegulatoryAttributeView[]> {
    return firstValueFrom(
      this.http.get<RegulatoryAttributeView[]>(`${this.base}/parties/${partyId}/regulatory-attributes`),
    );
  }

  attributeHistory(partyId: number, code: string): Promise<RegulatoryAttributeView[]> {
    return firstValueFrom(
      this.http.get<RegulatoryAttributeView[]>(
        `${this.base}/parties/${partyId}/regulatory-attributes/${encodeURIComponent(code)}/history`,
      ),
    );
  }

  setAttribute(partyId: number, code: string, attributeValue: string | null): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(
        `${this.base}/parties/${partyId}/regulatory-attributes/${encodeURIComponent(code)}`,
        {
          attributeValue,
        },
      ),
    );
  }

  /** The activity log for one customer (SEC/AUDIT view). The API logs customers by customer number. */
  activity(partyNumber: string, page: number, pageSize: number): Promise<ActivityPage> {
    return firstValueFrom(
      this.http.get<ActivityPage>(`${this.base}/audit/activity`, {
        params: { entityType: 'Party', entityId: partyNumber, page, pageSize },
      }),
    );
  }

  private blob(path: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.base}/${path}`, { responseType: 'blob' }));
  }
}
