import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  CurrencyView,
  ProductPage,
  ProductRateAdded,
  ProductRateRequest,
  ProductRateView,
  ProductRequest,
  ProductView,
} from '../../core/api/api-types';
import { ConfigService } from '../../core/config/config.service';
import { EditOutcome, ListParams, query } from '../../shared/data/list-params';

/** Product calls (API A5-01, A5-02). Codes and names here are not personal data. */
@Injectable({ providedIn: 'root' })
export class ProductsClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  products(params: ListParams): Promise<ProductPage> {
    return firstValueFrom(
      this.http.get<ProductPage>(`${this.base}/products`, {
        params: query({ ...params, productTypeId: params.typeId }),
      }),
    );
  }

  product(productId: number): Promise<ProductView> {
    return firstValueFrom(this.http.get<ProductView>(`${this.base}/products/${productId}`));
  }

  createProduct(request: ProductRequest): Promise<{ id: number }> {
    return firstValueFrom(this.http.post<{ id: number }>(`${this.base}/products`, request));
  }

  async updateProduct(productId: number, request: ProductRequest): Promise<EditOutcome> {
    const body = await firstValueFrom(
      this.http.put<{ changeRequestId?: number } | null>(`${this.base}/products/${productId}`, request),
    );
    return { changeRequestId: body?.changeRequestId ?? null };
  }

  approveProduct(productId: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/products/${productId}/supervise`, null));
  }

  rejectProduct(productId: number, reason: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/products/${productId}/reject`, { reason }));
  }

  rates(productId: number): Promise<ProductRateView[]> {
    return firstValueFrom(
      this.http.get<ProductRateView[]>(`${this.base}/products/${productId}/interest-rates`),
    );
  }

  addRate(productId: number, request: ProductRateRequest): Promise<ProductRateAdded> {
    return firstValueFrom(
      this.http.post<ProductRateAdded>(`${this.base}/products/${productId}/interest-rates`, request),
    );
  }

  closeRate(productId: number, rateId: number, effectiveTo: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/products/${productId}/interest-rates/${rateId}/close`, {
        effectiveTo,
      }),
    );
  }

  removeRate(productId: number, rateId: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/products/${productId}/interest-rates/${rateId}`),
    );
  }

  currencies(): Promise<CurrencyView[]> {
    return firstValueFrom(this.http.get<CurrencyView[]>(`${this.base}/currencies`));
  }
}
