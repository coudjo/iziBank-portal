import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from '../../shared/ui';
import { FOUR_EYES } from './four-eyes-text';

/** The sticky approval bar (UX 6.6 step 2): Approve, and Reject where allowed, with four-eyes in text. */
@Component({
  selector: 'ib-approval-bar',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      position: sticky;
      bottom: 0;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: var(--ib-space-3);
      padding: var(--ib-space-3) 0;
      background: var(--ib-page);
      border-top: 1px solid var(--ib-line);
    }
    p {
      margin: 0;
      flex: 1 1 18rem;
      color: var(--ib-ink-muted);
    }
  `,
  host: { role: 'group', 'aria-label': 'Decision' },
  template: `
    @if (own()) {
      <p>{{ fourEyes }}</p>
    } @else if (note()) {
      <p>{{ note() }}</p>
    }
    @if (canReject()) {
      <ib-button variant="danger" [disabled]="own()" [loading]="busy()" (click)="rejected.emit()"
        >Reject</ib-button
      >
    }
    <ib-button variant="primary" [disabled]="own()" [loading]="busy()" (click)="approved.emit()"
      >Approve</ib-button
    >
  `,
})
export class ApprovalBarComponent {
  readonly own = input(false);
  readonly canReject = input(true);
  readonly busy = input(false);
  readonly note = input<string | null>(null);
  readonly approved = output<void>();
  readonly rejected = output<void>();

  protected readonly fourEyes = FOUR_EYES;
}
