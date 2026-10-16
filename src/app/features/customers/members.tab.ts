import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { GroupMemberView, LookupRow } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate } from '../../core/formats/dates';
import { LookupsService } from '../../core/lookups/lookups.service';
import { CanDirective } from '../../core/permissions/can.directive';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  EmptyStateComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  MenuButtonComponent,
  MenuItem,
  ToastService,
} from '../../shared/ui';
import { CustomerPickerComponent } from './customer-picker.component';
import { CustomerRecordStore } from './customer-record.store';
import { CustomersClient } from './customers.client';
import type { PartyChoice } from './new-individual.dialog';

/**
 * Group members (UX 6.4 steps 3 to 5, F6): individuals only, one active group per person, one chairperson.
 * Leaving keeps the history; former members are listed below.
 */
@Component({
  selector: 'ib-customer-members-tab',
  imports: [
    RouterLink,
    CanDirective,
    BannerComponent,
    ButtonComponent,
    CustomerPickerComponent,
    EmptyStateComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    MenuButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    a {
      text-decoration: underline;
    }
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-4);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-3);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      padding: var(--ib-space-2) 0;
      border-top: 1px solid var(--ib-line);
    }
    li:first-child {
      border-top: 0;
    }
    .meta {
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    .add {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 14rem;
      gap: var(--ib-space-4);
      align-items: start;
    }
    @media (max-width: 767.98px) {
      .add {
        grid-template-columns: 1fr;
      }
    }
    .chosen {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      padding: var(--ib-space-3);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      background: var(--ib-surface-subtle);
      margin-bottom: var(--ib-space-3);
    }
    .bar {
      display: flex;
      justify-content: flex-end;
      gap: var(--ib-space-2);
    }
    details summary {
      cursor: pointer;
      min-height: var(--ib-touch-target);
      display: flex;
      align-items: center;
      font-weight: 600;
    }
  `,
  template: `
    @if (message(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }

    @if (adding()) {
      <section aria-labelledby="add-member-title">
        <h2 id="add-member-title">Add a member</h2>
        <div class="add">
          <div>
            @if (candidate(); as person) {
              <div class="chosen">
                <span>
                  <strong>{{ person.displayName }}</strong>
                  <span class="ib-num">({{ person.partyNumber }})</span>
                </span>
                <ib-button (click)="candidate.set(null)"
                  >Change<span class="ib-visually-hidden"> person</span></ib-button
                >
              </div>
            } @else {
              <ib-customer-picker
                label="Find an individual"
                [excluded]="activeIds()"
                (picked)="candidate.set($event)"
              />
            }
          </div>
          <ib-form-field label="Role" [required]="true">
            <select ibInput ibControl (change)="roleId.set(+$any($event.target).value)">
              @for (role of roles(); track role.id) {
                <option [value]="role.id" [selected]="role.id === roleId()">{{ role.name }}</option>
              }
            </select>
          </ib-form-field>
        </div>
        <div class="bar">
          <ib-button (click)="cancelAdd()">Cancel</ib-button>
          <ib-button
            variant="primary"
            [disabled]="!candidate()"
            [loading]="guard.busy()"
            (click)="addMember()"
            >Add member</ib-button
          >
        </div>
      </section>
    }

    <section aria-labelledby="members-title">
      <div class="head">
        <h2 id="members-title">Members ({{ active().length }})</h2>
        @if (!adding()) {
          <ib-button
            *ibCan="{ module: 'PTY', subModule: 'GROUPS', action: 'edit' }"
            variant="primary"
            icon="plus"
            (click)="startAdd()"
            >Add member</ib-button
          >
        }
      </div>
      @if (active().length === 0) {
        <ib-empty-state
          title="No members yet"
          message="Add the group's members. Each must be an individual customer."
          icon="team"
        />
      } @else {
        <ul aria-label="Active members">
          @for (member of active(); track member.memberPartyId) {
            <li>
              <span>
                <a [routerLink]="['/customers', member.memberPartyId]">{{ member.displayName }}</a>
                <span class="ib-num"> ({{ member.partyNumber }})</span>
                <br />
                <span class="meta">{{ roleName(member) }} · joined {{ date(member.joinedOn) }}</span>
              </span>
              <ib-menu-button
                *ibCan="{ module: 'PTY', subModule: 'GROUPS', action: 'edit' }"
                [label]="'Actions for ' + member.displayName"
                [items]="actionsFor(member)"
                (selected)="act(member, $event)"
              />
            </li>
          }
        </ul>
      }
    </section>

    @if (former().length > 0) {
      <section>
        <details>
          <summary>Former members ({{ former().length }})</summary>
          <ul aria-label="Former members">
            @for (member of former(); track member.groupMemberId) {
              <li>
                <span>
                  {{ member.displayName }} <span class="ib-num">({{ member.partyNumber }})</span>
                  <br />
                  <span class="meta">Joined {{ date(member.joinedOn) }}, left {{ date(member.leftOn) }}</span>
                </span>
              </li>
            }
          </ul>
        </details>
      </section>
    }
  `,
})
export class CustomerMembersTab {
  private readonly store = inject(CustomerRecordStore);
  private readonly client = inject(CustomersClient);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly members = signal<GroupMemberView[]>([]);
  protected readonly roles = signal<LookupRow[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly candidate = signal<PartyChoice | null>(null);
  protected readonly roleId = signal<number | null>(null);
  protected readonly guard = new SubmitGuard();

  protected readonly active = computed(() => this.members().filter((member) => !member.leftOn));
  protected readonly former = computed(() => this.members().filter((member) => !!member.leftOn));
  protected readonly activeIds = computed(() => this.active().map((member) => member.memberPartyId));

  constructor() {
    void this.load();
    inject(LookupsService)
      .list('group-member-roles')
      .then(
        (rows) => this.roles.set(rows),
        () => undefined,
      );
  }

  protected startAdd(): void {
    this.candidate.set(null);
    this.roleId.set(this.roles().find((role) => role.code === 'MEMBER')?.id ?? this.roles()[0]?.id ?? null);
    this.message.set(null);
    this.adding.set(true);
  }

  protected cancelAdd(): void {
    this.adding.set(false);
  }

  protected async addMember(): Promise<void> {
    const person = this.candidate();
    const partyId = this.store.party()?.partyId;
    if (!person || !partyId) {
      return;
    }
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        await this.client.addMember(partyId, {
          memberPartyId: person.partyId,
          groupMemberRoleId: this.roleId(),
          joinedOn: null,
        });
        this.adding.set(false);
        this.toast.success(`${person.displayName} added to the group.`);
        await Promise.all([this.load(), this.store.reload()]);
      } catch (failure) {
        this.message.set(this.describe(failure));
      }
    });
  }

  protected actionsFor(member: GroupMemberView): MenuItem[] {
    const roles = this.roles()
      .filter((role) => role.id !== member.groupMemberRoleId)
      .map((role) => ({ label: `Make ${role.name.toLowerCase()}`, value: `role:${role.id}` }));
    return [...roles, { label: 'Mark as left the group', value: 'leave' }];
  }

  protected async act(member: GroupMemberView, action: string): Promise<void> {
    const partyId = this.store.party()?.partyId;
    if (!partyId) {
      return;
    }
    this.message.set(null);
    try {
      if (action === 'leave') {
        const confirmed = await this.dialogs.confirm({
          title: 'Mark as left?',
          message: `${member.displayName} will be recorded as having left the group today. Their membership history is kept.`,
          confirmLabel: 'Mark as left',
          tone: 'danger',
        });
        if (!confirmed) {
          return;
        }
        await this.client.leave(partyId, member.memberPartyId, null);
        this.toast.success(`${member.displayName} has left the group.`);
      } else if (action.startsWith('role:')) {
        await this.client.changeRole(partyId, member.memberPartyId, Number(action.slice(5)));
        this.toast.success(`${member.displayName}'s role was changed.`);
      }
      await Promise.all([this.load(), this.store.reload()]);
    } catch (failure) {
      this.message.set(this.describe(failure));
    }
  }

  protected roleName(member: GroupMemberView): string {
    return (
      this.roles().find((role) => role.id === member.groupMemberRoleId)?.name ?? member.roleCode ?? 'Member'
    );
  }

  protected readonly date = formatDate;

  private describe(failure: unknown): string {
    const problem = toApiProblem(failure);
    if (problem.status === 400 && problem.errors) {
      return Object.values(problem.errors).flat().join(' ');
    }
    return messageFor(problem);
  }

  private async load(): Promise<void> {
    const partyId = this.store.party()?.partyId;
    if (!partyId) {
      return;
    }
    try {
      this.members.set(await this.client.members(partyId));
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    }
  }
}
