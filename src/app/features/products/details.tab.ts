import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import type { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { ToastService } from '../../shared/ui';
import { ProductFormComponent, ProductSaved } from './product-form.component';
import { ProductRecordStore } from './product-record.store';

/** Details tab: the product form for this product. */
@Component({
  selector: 'ib-product-details-tab',
  imports: [ProductFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-4);
    }
  `,
  template: `
    @if (store.product(); as product) {
      <section aria-label="Product details">
        <ib-product-form [product]="product" (saved)="saved($event)" />
      </section>
    }
  `,
})
export class ProductDetailsTab implements HasUnsavedChanges {
  protected readonly store = inject(ProductRecordStore);
  private readonly toast = inject(ToastService);
  private readonly form = viewChild(ProductFormComponent);

  hasUnsavedChanges(): boolean {
    return this.form()?.hasUnsavedChanges() ?? false;
  }

  protected saved(result: ProductSaved): void {
    const pending = this.store.product()?.supervisionState === 'PENDING';
    this.toast.success(
      result.waitsForApproval && !pending
        ? 'Change saved. It waits for a supervisor to approve it.'
        : 'Product saved.',
    );
    void this.store.reload();
  }
}
