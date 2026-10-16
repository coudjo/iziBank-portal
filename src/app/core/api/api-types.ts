import type { components } from './schema';

type Schemas = components['schemas'];

export type TokenResponse = Schemas['TokenResponse'];
export type MeResponse = Schemas['MeResponse'];
export type PermissionGrant = Schemas['PermissionGrant'];
export type BranchSummary = Schemas['BranchSummary'];
export type LoginRequest = Schemas['LoginRequest'];
export type ChangeSecretKeyRequest = Schemas['ChangeSecretKeyRequest'];
export type CurrentBusinessDay = Schemas['CurrentBusinessDay'];
export type LookupRow = Schemas['LookupRow'];
export type PartySearchRequest = Schemas['PartySearchRequest'];
export type PartySearchRow = Schemas['PartySearchRow'];
export type PartySearchPage = Schemas['PagedResultOfPartySearchRow'];
export type PartyDetail = Schemas['PartyDetail'];
export type PartyOverview = Schemas['PartyOverview'];
export type KycChecklist = Schemas['KycChecklist'];
export type KycChecklistItem = Schemas['KycChecklistItem'];
export type CreateIndividualRequest = Schemas['CreateIndividualRequest'];
export type CreatedParty = Schemas['CreatedParty'];
export type CreditOfficerView = Schemas['CreditOfficerView'];
