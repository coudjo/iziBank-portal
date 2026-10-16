import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { DialogService } from '../ui/dialog.service';

/** A page with a form says whether leaving now would lose what the user entered. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Asks before leaving a form with unsaved changes (UX 5.3). Not asked once the user is signed out: the session
 * ended, and in-memory data is already being discarded.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component?.hasUnsavedChanges() || inject(AuthService).me() === null) {
    return true;
  }
  return inject(DialogService).confirm({
    title: 'Leave this page?',
    message: 'The details you entered will be lost.',
    confirmLabel: 'Leave',
    cancelLabel: 'Stay',
    tone: 'danger',
  });
};
