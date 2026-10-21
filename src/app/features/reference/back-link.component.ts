import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** "Reference data" link above each reference screen's title. */
@Component({
  selector: 'ib-reference-back',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    a {
      display: inline-flex;
      align-items: center;
      min-height: var(--ib-touch-target);
    }
  `,
  template: `<a routerLink="/reference">‹ Reference data</a>`,
})
export class ReferenceBackComponent {}
