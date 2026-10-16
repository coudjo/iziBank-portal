import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyStateComponent } from '../../shared/ui';

/** Placeholder for record tabs not built yet. Development builds only (frontend plan 7.5). */
@Component({
  selector: 'ib-customer-coming-tab',
  imports: [EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ib-empty-state
    title="Coming soon"
    message="This tab is built in a later task."
    icon="appstore"
  />`,
})
export class CustomerComingTab {}
