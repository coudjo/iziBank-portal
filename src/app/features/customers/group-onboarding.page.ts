import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type { LookupRow } from '../../core/api/api-types';
import { LookupsService } from '../../core/lookups/lookups.service';
import { InMemoryStores } from '../../core/session/in-memory-stores';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { ButtonComponent, PageHeaderComponent } from '../../shared/ui';
import { CustomerPickerComponent } from './customer-picker.component';
import { CREATED_STATE } from './customer-record.page';
import { CustomersClient } from './customers.client';
import {
  GROUP_FIELDS,
  GROUP_MESSAGES,
  GROUP_STEPS,
  GroupStep,
  createGroupForm,
  groupDetails,
  groupStepOf,
} from './group-form';
import { GroupFieldsComponent } from './group-fields.component';
import type { PartyChoice } from './new-individual.dialog';
import { OnboardingFlow } from './onboarding-flow';
import { OnboardingFrameComponent } from './onboarding-frame.component';

/** Onboard a group (UX 6.4, F6): the group, then its chairperson, who becomes the first member. */
@Component({
  selector: 'ib-group-onboarding-page',
  imports: [
    ButtonComponent,
    CustomerPickerComponent,
    GroupFieldsComponent,
    OnboardingFrameComponent,
    PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  styles: `
    .chosen {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-3);
      padding: var(--ib-space-3) var(--ib-space-4);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      background: var(--ib-surface-subtle);
    }
    .name {
      font-weight: 600;
    }
    .help {
      margin: 0 0 var(--ib-space-4);
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    <ib-page-header title="New group" />
    <ib-onboarding-frame [flow]="flow" [titles]="titles" (cancelled)="cancel()">
      <ib-group-fields
        [hidden]="flow.current() !== 'group'"
        [group]="form.controls.group"
        [submitted]="flow.wasSubmitted('group')"
      />
      <div [hidden]="flow.current() !== 'chairperson'" data-field="chairperson">
        <p class="help">
          The chairperson must be an individual customer. They become the group's first member.
        </p>
        @if (chairperson(); as person) {
          <div class="chosen">
            <div>
              <span class="name">{{ person.displayName }}</span>
              <span class="ib-num"> ({{ person.partyNumber }})</span>
            </div>
            <ib-button (click)="chairperson.set(null)"
              >Change<span class="ib-visually-hidden"> chairperson</span></ib-button
            >
          </div>
        } @else {
          <ib-customer-picker label="Find the chairperson" (picked)="choose($event)" />
        }
      </div>
    </ib-onboarding-frame>
  `,
})
export class GroupOnboardingPage implements HasUnsavedChanges {
  private readonly client = inject(CustomersClient);
  private readonly router = inject(Router);
  private readonly frame = viewChild.required(OnboardingFrameComponent);

  protected readonly form = createGroupForm();
  protected readonly titles = ['Group', 'Chairperson'];
  protected readonly chairperson = signal<PartyChoice | null>(null);
  private readonly roles = signal<LookupRow[]>([]);

  protected readonly flow = new OnboardingFlow<GroupStep>(
    {
      steps: GROUP_STEPS,
      groups: this.form.controls,
      fields: GROUP_FIELDS,
      messages: GROUP_MESSAGES,
      stepOf: groupStepOf,
      duplicates: [],
      conflicts: { 'group.member-in-other-group': 'chairperson', 'group.chairperson-exists': 'chairperson' },
      extraChecks: (step) =>
        step === 'chairperson' && !this.chairperson()
          ? [{ field: 'chairperson', message: 'Choose the chairperson.' }]
          : [],
      create: () => this.create(),
      find: () => this.findSaved(),
      onCreated: (partyId) =>
        void this.router.navigate(['/customers', partyId, 'members'], { state: { [CREATED_STATE]: true } }),
      focusStep: () => this.frame().focusStep(),
    },
    this.client,
  );

  constructor() {
    const unregister = inject(InMemoryStores).register(() => {
      this.flow.reset();
      this.chairperson.set(null);
    });
    inject(DestroyRef).onDestroy(unregister);
    inject(LookupsService)
      .list('group-member-roles')
      .then(
        (rows) => this.roles.set(rows),
        () => undefined,
      );
  }

  hasUnsavedChanges(): boolean {
    return this.flow.dirty() || (!this.flow.done() && this.chairperson() !== null);
  }

  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  protected choose(choice: PartyChoice): void {
    this.chairperson.set(choice);
    this.flow.problems.set([]);
    this.flow.message.set(null);
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/customers');
  }

  private create() {
    const chairperson = this.chairperson()!;
    const roleId = this.roles().find((role) => role.code === 'CHAIRPERSON')?.id ?? null;
    return this.client.createGroup({
      ...groupDetails(this.form),
      members: [{ memberPartyId: chairperson.partyId, groupMemberRoleId: roleId, joinedOn: null }],
    });
  }

  private async findSaved() {
    const name = this.form.controls.group.controls.groupName.value.trim();
    const page = await this.client.search({ q: name, partyType: 'GROUP', pageSize: 10 });
    const match = page.items.find((row) => row.displayName.toLowerCase() === name.toLowerCase());
    return match
      ? { partyId: match.partyId, partyNumber: match.partyNumber, displayName: match.displayName }
      : null;
  }
}
