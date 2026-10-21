import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  BranchView,
  CreateStaffRequest,
  ModuleView,
  RoleGroupDetail,
  RoleGroupMember,
  RoleGroupRequest,
  RoleGroupSummary,
  SessionPage,
  StaffDetail,
  StaffPage,
  UpdateStaffRequest,
} from '../../core/api/api-types';
import { ConfigService } from '../../core/config/config.service';
import { query } from '../../shared/data/list-params';

/**
 * Security administration calls (API A2-04 to A2-10): staff, role groups, modules, sessions. Role group changes and
 * assignments return a change request (HTTP 202) that a second person approves. Staff codes and names travel only
 * in bodies, never in URLs.
 */
@Injectable({ providedIn: 'root' })
export class SecurityClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  staff(params: { search?: string | null; page: number; pageSize: number }): Promise<StaffPage> {
    return firstValueFrom(this.http.get<StaffPage>(`${this.base}/staff-users`, { params: query(params) }));
  }

  staffMember(staffUserId: number): Promise<StaffDetail> {
    return firstValueFrom(this.http.get<StaffDetail>(`${this.base}/staff-users/${staffUserId}`));
  }

  createStaff(request: CreateStaffRequest): Promise<{ id: number }> {
    return firstValueFrom(this.http.post<{ id: number }>(`${this.base}/staff-users`, request));
  }

  updateStaff(staffUserId: number, request: UpdateStaffRequest): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/staff-users/${staffUserId}`, request));
  }

  resetPassword(staffUserId: number, newSecretKey: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/staff-users/${staffUserId}/reset-secret-key`, { newSecretKey }),
    );
  }

  /** Replaces the role groups in one branch; waits for approval. Returns the change request id. */
  async assignRoleGroups(staffUserId: number, branchId: number, roleGroupCodes: string[]): Promise<number> {
    const body = await firstValueFrom(
      this.http.put<{ changeRequestId: number }>(`${this.base}/staff-users/${staffUserId}/role-groups`, {
        branchId,
        roleGroupCodes,
      }),
    );
    return body.changeRequestId;
  }

  roleGroups(): Promise<RoleGroupSummary[]> {
    return firstValueFrom(this.http.get<RoleGroupSummary[]>(`${this.base}/role-groups`));
  }

  roleGroup(roleGroupId: number): Promise<RoleGroupDetail> {
    return firstValueFrom(this.http.get<RoleGroupDetail>(`${this.base}/role-groups/${roleGroupId}`));
  }

  members(roleGroupId: number): Promise<RoleGroupMember[]> {
    return firstValueFrom(
      this.http.get<RoleGroupMember[]>(`${this.base}/role-groups/${roleGroupId}/members`),
    );
  }

  async createRoleGroup(request: RoleGroupRequest): Promise<number> {
    const body = await firstValueFrom(
      this.http.post<{ changeRequestId: number }>(`${this.base}/role-groups`, request),
    );
    return body.changeRequestId;
  }

  async updateRoleGroup(roleGroupId: number, request: RoleGroupRequest): Promise<number> {
    const body = await firstValueFrom(
      this.http.put<{ changeRequestId: number }>(`${this.base}/role-groups/${roleGroupId}`, request),
    );
    return body.changeRequestId;
  }

  async deactivateRoleGroup(roleGroupId: number): Promise<number> {
    const body = await firstValueFrom(
      this.http.post<{ changeRequestId: number }>(`${this.base}/role-groups/${roleGroupId}/deactivate`, null),
    );
    return body.changeRequestId;
  }

  modules(): Promise<ModuleView[]> {
    return firstValueFrom(this.http.get<ModuleView[]>(`${this.base}/modules`));
  }

  sessions(params: { openOnly: boolean; page: number; pageSize: number }): Promise<SessionPage> {
    return firstValueFrom(this.http.get<SessionPage>(`${this.base}/sessions`, { params: query(params) }));
  }

  endSession(sessionId: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/sessions/${sessionId}/end`, null));
  }

  branches(): Promise<BranchView[]> {
    return firstValueFrom(this.http.get<BranchView[]>(`${this.base}/branches`));
  }
}
