import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EmptyStateComponent, PageHeaderComponent } from '../../shared/ui';

@Component({
  selector: 'ib-not-allowed-page',
  imports: [PageHeaderComponent, EmptyStateComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ib-page-header title="You cannot open this page" />
    <ib-empty-state
      icon="lock"
      title="Your role groups do not include this area"
      message="Ask an administrator if you need access."
    >
      <a routerLink="/dashboard">Go to the dashboard</a>
    </ib-empty-state>
  `,
})
export class NotAllowedPage {}

@Component({
  selector: 'ib-not-found-page',
  imports: [PageHeaderComponent, EmptyStateComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ib-page-header title="Page not found" />
    <ib-empty-state
      icon="info-circle"
      title="There is no page at this address"
      message="Check the link, or start again from the dashboard."
    >
      <a routerLink="/dashboard">Go to the dashboard</a>
    </ib-empty-state>
  `,
})
export class NotFoundPage {}

/** Development builds only: a screen that is in the navigation but not built yet. */
@Component({
  selector: 'ib-coming-soon-page',
  imports: [PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ib-page-header [title]="title" />
    <ib-empty-state
      icon="setting"
      title="Coming in a later step"
      message="This screen is planned and not built yet. It is hidden in production builds."
    />
  `,
})
export class ComingSoonPage {
  protected readonly title =
    (inject(ActivatedRoute).snapshot.data['title'] as string | undefined) ?? 'Coming soon';
}
