import type { components } from './schema';

type Schemas = components['schemas'];

export type TokenResponse = Schemas['TokenResponse'];
export type MeResponse = Schemas['MeResponse'];
export type PermissionGrant = Schemas['PermissionGrant'];
export type BranchSummary = Schemas['BranchSummary'];
export type LoginRequest = Schemas['LoginRequest'];
export type ChangeSecretKeyRequest = Schemas['ChangeSecretKeyRequest'];
