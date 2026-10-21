import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionsListComponent } from './sessions-list.component';
import { StaffRecordStore } from './staff-record.store';

/** Sessions tab (UX 6.10 step 6): this staff member's sessions with Force sign-out. */
@Component({
  selector: 'ib-staff-sessions-tab',
  imports: [SessionsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.staff(); as staff) {
      <ib-sessions-list [staffUserId]="staff.staff.staffUserId" />
    }
  `,
})
export class StaffSessionsTab {
  protected readonly store = inject(StaffRecordStore);
}
