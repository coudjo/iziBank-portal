import { Injectable, inject, signal } from '@angular/core';
import type { StaffDetail } from '../../core/api/api-types';
import { ApiProblem, toApiProblem } from '../../core/errors/api-problem';
import { SecurityClient } from './security.client';

/** The open staff member, shared by the record page and its tabs. Provided by the record page. */
@Injectable()
export class StaffRecordStore {
  private readonly client = inject(SecurityClient);

  readonly staff = signal<StaffDetail | null>(null);
  readonly problem = signal<ApiProblem | null>(null);
  private staffUserId: number | null = null;
  private request = 0;

  get id(): number | null {
    return this.staffUserId;
  }

  async load(staffUserId: number): Promise<void> {
    if (this.staffUserId !== staffUserId) {
      this.staff.set(null);
    }
    this.staffUserId = staffUserId;
    const id = ++this.request;
    this.problem.set(null);
    try {
      const staff = await this.client.staffMember(staffUserId);
      if (id === this.request) {
        this.staff.set(staff);
      }
    } catch (failure) {
      if (id === this.request) {
        this.staff.set(null);
        this.problem.set(toApiProblem(failure));
      }
    }
  }

  reload(): Promise<void> {
    return this.staffUserId === null ? Promise.resolve() : this.load(this.staffUserId);
  }
}
