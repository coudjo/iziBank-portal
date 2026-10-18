import { Routes } from '@angular/router';
import { requirePermission } from '../../core/auth/auth.guards';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

const view = requirePermission({ module: 'ACC', subModule: 'PRODUCT', action: 'view' });

/** Products (UX 4.2, 6.9, 7.6). */
export const PRODUCT_ROUTES: Routes = [
  {
    path: '',
    title: 'Products',
    canMatch: [view],
    loadComponent: () => import('./products-list.page').then((m) => m.ProductsListPage),
  },
  {
    path: 'new',
    title: 'New product',
    canMatch: [requirePermission({ module: 'ACC', subModule: 'PRODUCT', action: 'add' })],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./new-product.page').then((m) => m.NewProductPage),
  },
  {
    path: ':id',
    title: 'Product',
    canMatch: [view],
    loadComponent: () => import('./product-record.page').then((m) => m.ProductRecordPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'details' },
      {
        path: 'details',
        title: 'Product',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./details.tab').then((m) => m.ProductDetailsTab),
      },
      {
        path: 'rates',
        title: 'Product',
        loadComponent: () => import('./rates.tab').then((m) => m.ProductRatesTab),
      },
    ],
  },
];
