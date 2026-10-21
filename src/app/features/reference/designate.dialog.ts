import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NzModalRef } from 'ng-zorro-antd/modal';
import type { StaffSummary } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
} from '../../shared/ui';
import { SecurityClient } from '../admin';
import { ReferenceClient } from './reference.client';

/**
 * Designate a credit officer (UX 7.7): pick a staff member by code or name. Picking needs the staff list (SEC/USERS
 * view); without it the dialog says who can help (api-requests P18). Resolves true when designated.
 */
@Component({
  selector: 'ib-designate-dialog',
  imports: [BannerComponent, ButtonComponent, FormControlDirective, FormFieldComponent, InputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-3);
    }
  `,
  template: `
    @if (failure(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }
    @if (unavailable()) {
      <ib-banner
        tone="info"
        message="You cannot see the staff list."
        description="Ask an administrator to designate the credit officer."
      />
      <div class="actions">
        <ib-button (click)="ref.close(false)">Close</ib-button>
      </div>
    } @else {
      <form (submit)="$event.preventDefault(); save()" novalidate>
        <ib-form-field label="Search staff" hint="Staff code or name">
          <input ibInput ibControl type="search" autocomplete="off" data-autofocus (input)="typed($event)" />
        </ib-form-field>
        <ib-form-field label="Staff member" [required]="true" [error]="error()">
          <select
            ibInput
            ibControl
            [value]="chosen() ?? ''"
            (change)="chosen.set(+$any($event.target).value || null)"
          >
            <option value="">{{ staff().length > 0 ? 'Choose a staff member' : 'No staff match' }}</option>
            @for (person of staff(); track person.staffUserId) {
              <option [value]="person.staffUserId">
                {{ person.fullName }} ({{ person.staffCode }}, {{ person.branchCode }})
              </option>
            }
          </select>
        </ib-form-field>
        <div class="actions">
          <ib-button (click)="ref.close(false)">Cancel</ib-button>
          <ib-button variant="primary" type="submit" [disabled]="!chosen()" [loading]="guard.busy()"
            >Designate</ib-button
          >
        </div>
      </form>
    }
  `,
})
export class DesignateDialogComponent {
  protected readonly ref = inject<NzModalRef<DesignateDialogComponent, boolean>>(NzModalRef);
  private readonly security = inject(SecurityClient);
  private readonly client = inject(ReferenceClient);

  protected readonly guard = new SubmitGuard();
  protected readonly failure = signal<string | null>(null);
  protected readonly unavailable = signal(false);
  private readonly all = signal<StaffSummary[]>([]);
  private readonly term = signal('');
  protected readonly chosen = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly staff = computed(() => {
    const term = this.term().toLowerCase();
    return this.all().filter(
      (person) =>
        !person.isDisabled &&
        (!term ||
          person.staffCode.toLowerCase().includes(term) ||
          person.fullName.toLowerCase().includes(term)),
    );
  });

  constructor() {
    if (!inject(PermissionService).can({ module: 'SEC', subModule: 'USERS', action: 'view' })) {
      this.unavailable.set(true);
      return;
    }
    this.security.staff({ page: 1, pageSize: 100 }).then(
      (page) => this.all.set(page.items),
      (failure) => {
        const problem = toApiProblem(failure);
        if (problem.status === 403) {
          this.unavailable.set(true);
        } else {
          this.failure.set(messageFor(problem));
        }
      },
    );
  }

  protected typed(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value.trim());
    this.chosen.set(null);
  }

  protected async save(): Promise<void> {
    const staffUserId = this.chosen();
    if (!staffUserId) {
      this.error.set('Choose a staff member.');
      return;
    }
    this.error.set(null);
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        await this.client.designateCreditOfficer(staffUserId);
        this.ref.close(true);
      } catch (failure) {
        this.failure.set(messageFor(toApiProblem(failure)));
      }
    });
  }
}
