import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BannerComponent, PageHeaderComponent, TabsComponent } from '../../shared/ui';

/** Audit (UX 6.12, 7.8): the activity log and the data-change log, with a notice that viewing is recorded. */
@Component({
  selector: 'ib-audit-page',
  imports: [RouterOutlet, BannerComponent, PageHeaderComponent, TabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ib-page-header title="Audit" />
    <ib-banner
      tone="info"
      message="Viewing the audit log is itself recorded."
      description="Each search you apply is logged with your staff code. Secret values never appear: the system removes them before they are stored."
    />
    <ib-tabs
      label="Audit logs"
      [tabs]="[
        { label: 'Activity', path: 'activity' },
        { label: 'Data changes', path: 'changes' },
      ]"
    />
    <router-outlet />
  `,
})
export class AuditPage {}
