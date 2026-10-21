import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '../../shared/ui';
import { SessionsListComponent } from './sessions-list.component';

/** Sessions (UX 7.7): who is signed in now, and recent sessions, with Force sign-out. */
@Component({
  selector: 'ib-sessions-page',
  imports: [PageHeaderComponent, SessionsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ib-page-header title="Sessions" />
    <ib-sessions-list />
  `,
})
export class SessionsPage {}
