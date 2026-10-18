import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { PageHeaderComponent, ToastService } from '../../shared/ui';
import { ProductFormComponent, ProductSaved } from './product-form.component';

/** Define a product (UX 6.9). A new product awaits approval like any other record. */
@Component({
  selector: 'ib-new-product-page',
  imports: [PageHeaderComponent, ProductFormComponent],
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
    <ib-page-header title="New product" />
    <section aria-label="Product">
      <ib-product-form (saved)="created($event)" />
    </section>
  `,
})
export class NewProductPage implements HasUnsavedChanges {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly form = viewChild.required(ProductFormComponent);
  private leaving = false;

  hasUnsavedChanges(): boolean {
    return !this.leaving && this.form().hasUnsavedChanges();
  }

  protected created(saved: ProductSaved): void {
    this.leaving = true;
    this.toast.success('Product saved. It is awaiting approval by a supervisor.');
    void this.router.navigate(['/products', saved.productId]);
  }
}
