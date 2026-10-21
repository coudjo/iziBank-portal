import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { PageHeaderComponent, ToastService } from '../../shared/ui';
import { StaffFormComponent, StaffSaved } from './staff-form.component';

/** Create a staff member (UX 6.10 step 1). Role groups are chosen on the record afterwards. */
@Component({
  selector: 'ib-new-staff-page',
  imports: [PageHeaderComponent, StaffFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
    }
  `,
  template: `
    <ib-page-header title="New staff member" />
    <section aria-label="Staff member">
      <ib-staff-form (saved)="created($event)" />
    </section>
  `,
})
export class NewStaffPage implements HasUnsavedChanges {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly form = viewChild.required(StaffFormComponent);
  private leaving = false;

  hasUnsavedChanges(): boolean {
    return !this.leaving && this.form().hasUnsavedChanges();
  }

  protected created(saved: StaffSaved): void {
    this.leaving = true;
    this.toast.success('Staff member created. Now choose their role groups.');
    void this.router.navigate(['/admin/staff', saved.staffUserId, 'role-groups']);
  }
}
