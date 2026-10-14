import { EnvironmentInjector, Injectable, Injector, Type, inject } from '@angular/core';
import type { NzModalRef, NzModalService } from 'ng-zorro-antd/modal';

export interface DialogOptions {
  title: string;
  /** Dialogs that must be answered (session dialogs) cannot be dismissed with Esc or the backdrop. */
  dismissible?: boolean;
  width?: number;
}

/**
 * `ib-dialog` (frontend plan 4.2): focus trap, Esc closes when dismissible, focus returns on close.
 * The modal code is loaded on first use so it stays out of the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly environment = inject(EnvironmentInjector);
  private modals: NzModalService | null = null;

  async open<TComponent, TData, TResult>(
    component: Type<TComponent>,
    data: TData,
    options: DialogOptions,
  ): Promise<NzModalRef<TComponent, TResult>> {
    const modals = await this.service();
    const dismissible = options.dismissible ?? true;
    const ref = modals.create<TComponent, TData, TResult>({
      nzTitle: options.title,
      nzContent: component,
      nzData: data,
      nzFooter: null,
      nzClosable: dismissible,
      nzMaskClosable: dismissible,
      nzKeyboard: dismissible,
      nzWidth: options.width ?? 440,
      nzCentered: true,
      nzAutofocus: null,
    });
    ref.afterOpen.subscribe(() => labelDialog(ref.getElement()));
    return ref;
  }

  closeAll(): void {
    this.modals?.closeAll();
  }

  private async service(): Promise<NzModalService> {
    if (!this.modals) {
      const { NzModalService } = await import('ng-zorro-antd/modal');
      this.modals = Injector.create({
        providers: [{ provide: NzModalService }],
        parent: this.environment,
      }).get(NzModalService);
    }
    return this.modals;
  }
}

let nextTitleId = 0;

/** NG-ZORRO leaves the dialog unnamed and not modal for assistive technology; name it by its title. */
function labelDialog(element: HTMLElement | undefined): void {
  const dialog = element?.closest('[role="dialog"]') ?? element?.querySelector('[role="dialog"]') ?? element;
  if (!dialog) {
    return;
  }
  dialog.setAttribute('aria-modal', 'true');
  const title = dialog.querySelector('.ant-modal-title');
  if (title) {
    title.id ||= `ib-dialog-title-${++nextTitleId}`;
    dialog.setAttribute('aria-labelledby', title.id);
  }
}
