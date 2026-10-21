import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RoleGroupSummary } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import {
  BannerComponent,
  ButtonComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  EmptyDirective,
  EmptyStateComponent,
  IconComponent,
  PageHeaderComponent,
  StatusChipComponent,
} from '../../shared/ui';
import { SecurityClient } from './security.client';

/**
 * Role groups (UX 6.10 step 3, 7.7): every group with its member count. Seeded groups show a lock; they can be
 * edited (with approval) but not removed. A group with a change waiting says so.
 */
@Component({
  selector: 'ib-role-groups-list-page',
  imports: [
    RouterLink,
    BannerComponent,
    ButtonComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    EmptyDirective,
    EmptyStateComponent,
    IconComponent,
    PageHeaderComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .name {
      font-weight: 600;
    }
    .muted {
      color: var(--ib-ink-muted);
    }
    .kind {
      display: inline-flex;
      align-items: center;
      gap: var(--ib-space-1);
    }
    .pending {
      display: block;
      color: var(--ib-warning-text);
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-1);
    }
    .meta {
      margin: 0 0 var(--ib-space-2);
      color: var(--ib-ink-muted);
    }
    .new {
      display: inline-flex;
      align-items: center;
      font-weight: 550;
    }
  `,
  template: `
    <ib-page-header title="Role groups">
      <div ibActions>
        @if (canAdd()) {
          <a class="ant-btn ant-btn-primary new" routerLink="/admin/role-groups/new">New role group</a>
        }
      </div>
    </ib-page-header>
    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
      <ib-button (click)="load()">Try again</ib-button>
    } @else {
      <ib-data-table
        caption="Role groups"
        [rows]="rows()"
        [total]="rows().length"
        [page]="1"
        [pageSize]="100"
        [loading]="loading()"
        [trackBy]="track"
      >
        <ng-template ibColumn="Name" let-row>
          <a class="ib-row-link name" [routerLink]="['/admin/role-groups', row.roleGroupId]">{{
            row.roleGroupName
          }}</a>
          @if (row.pendingChangeRequestId) {
            <span class="pending">Change awaiting approval</span>
          }
        </ng-template>
        <ng-template ibColumn="Code" let-row
          ><span class="ib-num muted">{{ row.roleGroupCode }}</span></ng-template
        >
        <ng-template ibColumn="Kind" let-row>
          <span class="kind">
            @if (row.isSystemGroup) {
              <ib-icon name="lock" />System
            } @else {
              Custom
            }
          </span>
        </ng-template>
        <ng-template ibColumn="Members" align="end" let-row
          ><span class="ib-num">{{ row.memberCount }}</span></ng-template
        >
        <ng-template ibColumn="Status" let-row>
          <ib-status-chip domain="record" [code]="row.isActive ? 'ACTIVE' : 'INACTIVE'" />
        </ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            <a class="ib-row-link name" [routerLink]="['/admin/role-groups', row.roleGroupId]">{{
              row.roleGroupName
            }}</a>
            <ib-status-chip domain="record" [code]="row.isActive ? 'ACTIVE' : 'INACTIVE'" />
          </div>
          <p class="meta">
            {{ row.isSystemGroup ? 'System' : 'Custom' }} · {{ members(row.memberCount) }}
            @if (row.pendingChangeRequestId) {
              <span class="pending">Change awaiting approval</span>
            }
          </p>
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state
            title="No role groups"
            message="Role groups you create appear here."
            icon="safety-certificate"
          />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class RoleGroupsListPage {
  private readonly client = inject(SecurityClient);
  private readonly permissions = inject(PermissionService);

  protected readonly rows = signal<RoleGroupSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly canAdd = computed(() =>
    this.permissions.can({ module: 'SEC', subModule: 'PERMISSIONS', action: 'add' }),
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.client.roleGroups();
      this.rows.set([...rows].sort((a, b) => Number(b.isActive) - Number(a.isActive) || compare(a, b)));
    } catch (failure) {
      this.error.set(messageFor(toApiProblem(failure)));
    } finally {
      this.loading.set(false);
    }
  }

  protected members(count: number): string {
    return count === 1 ? '1 member' : `${count} members`;
  }

  protected track(row: RoleGroupSummary): number {
    return row.roleGroupId;
  }
}

function compare(a: RoleGroupSummary, b: RoleGroupSummary): number {
  return a.roleGroupName < b.roleGroupName ? -1 : a.roleGroupName > b.roleGroupName ? 1 : 0;
}
