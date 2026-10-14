import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { BranchContext } from '../../core/branch/branch-context';
import { EmptyStateComponent, PageHeaderComponent } from '../../shared/ui';

/** Dashboard (UX 7.1). Widgets arrive with their data (customers, accounts, approvals). */
@Component({
  selector: 'ib-dashboard-page',
  imports: [PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ib-page-header title="Dashboard" [subtitle]="greeting()" />
    <ib-empty-state
      icon="appstore"
      title="Nothing waiting for you yet"
      message="Work for you, such as approvals and KYC checks, will appear here once customers and accounts are in the system."
    />
  `,
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  private readonly branch = inject(BranchContext);

  protected readonly greeting = computed(() => {
    const name = this.auth.me()?.fullName ?? '';
    const branch = this.branch.current()?.branchName;
    return branch ? `Signed in as ${name}, ${branch}` : `Signed in as ${name}`;
  });
}
