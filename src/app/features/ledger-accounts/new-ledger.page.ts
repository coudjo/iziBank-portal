import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { PageHeaderComponent, ToastService } from '../../shared/ui';
import { LedgerFormComponent, LedgerSaved } from './ledger-form.component';

/** New ledger account (UX 7.6). It is created in the working branch and awaits approval. */
@Component({
  selector: 'ib-new-ledger-page',
  imports: [PageHeaderComponent, LedgerFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
    }
  `,
  template: `
    <ib-page-header title="New ledger account" />
    <section aria-label="Ledger account">
      <ib-ledger-form (saved)="created($event)" />
    </section>
  `,
})
export class NewLedgerPage implements HasUnsavedChanges {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly form = viewChild.required(LedgerFormComponent);
  private leaving = false;

  hasUnsavedChanges(): boolean {
    return !this.leaving && this.form().hasUnsavedChanges();
  }

  protected created(saved: LedgerSaved): void {
    this.leaving = true;
    this.toast.success('Ledger account saved. It is awaiting approval by a supervisor.');
    void this.router.navigate(['/ledger-accounts', saved.ledgerAccountId]);
  }
}
