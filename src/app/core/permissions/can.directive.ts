import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { PermissionRule, PermissionService } from './permission.service';

/** `*ibCan="{ module: 'PTY', subModule: 'PARTY', action: 'add' }"` removes the element when not allowed. */
@Directive({ selector: '[ibCan]' })
export class CanDirective {
  readonly ibCan = input.required<PermissionRule>();

  private readonly permissions = inject(PermissionService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private shown = false;

  constructor() {
    effect(() => {
      const allowed = this.permissions.can(this.ibCan());
      if (allowed && !this.shown) {
        this.container.createEmbeddedView(this.template);
        this.shown = true;
      } else if (!allowed && this.shown) {
        this.container.clear();
        this.shown = false;
      }
    });
  }
}
