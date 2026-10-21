import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import type { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { ToastService } from '../../shared/ui';
import { StaffFormComponent } from './staff-form.component';
import { StaffRecordStore } from './staff-record.store';

/** Details tab: name, other branches, password expiry, teller and till account. */
@Component({
  selector: 'ib-staff-details-tab',
  imports: [StaffFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-4);
    }
  `,
  template: `
    @if (store.staff(); as staff) {
      <section aria-label="Staff details">
        <ib-staff-form [staff]="staff" [readOnly]="own()" (saved)="saved()" />
      </section>
    }
  `,
})
export class StaffDetailsTab implements HasUnsavedChanges {
  protected readonly store = inject(StaffRecordStore);
  private readonly toast = inject(ToastService);
  private readonly me = inject(AuthService).me;
  private readonly form = viewChild(StaffFormComponent);

  protected readonly own = computed(() => this.store.staff()?.staff.staffUserId === this.me()?.staffUserId);

  hasUnsavedChanges(): boolean {
    return this.form()?.hasUnsavedChanges() ?? false;
  }

  protected saved(): void {
    this.toast.success('Staff member saved.');
    void this.store.reload();
  }
}
