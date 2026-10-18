import { Injectable, inject, signal } from '@angular/core';
import type { ProductView } from '../../core/api/api-types';
import { ApiProblem, toApiProblem } from '../../core/errors/api-problem';
import { ProductsClient } from './products.client';

/** The open product, shared by the record page and its tabs. Provided by the record page. */
@Injectable()
export class ProductRecordStore {
  private readonly client = inject(ProductsClient);

  readonly product = signal<ProductView | null>(null);
  readonly problem = signal<ApiProblem | null>(null);
  private productId: number | null = null;
  private request = 0;

  get id(): number | null {
    return this.productId;
  }

  async load(productId: number): Promise<void> {
    if (this.productId !== productId) {
      this.product.set(null);
    }
    this.productId = productId;
    const id = ++this.request;
    this.problem.set(null);
    try {
      const product = await this.client.product(productId);
      if (id === this.request) {
        this.product.set(product);
      }
    } catch (failure) {
      if (id === this.request) {
        this.product.set(null);
        this.problem.set(toApiProblem(failure));
      }
    }
  }

  reload(): Promise<void> {
    return this.productId === null ? Promise.resolve() : this.load(this.productId);
  }
}
