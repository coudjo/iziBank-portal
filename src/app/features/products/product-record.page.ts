import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  StatusChipComponent,
  TabsComponent,
  ToastService,
} from '../../shared/ui';
import { ApprovalBarComponent, ApprovalsService, ChangesPanelComponent, diffJson } from '../approvals';
import { PRODUCT_TYPE_LABELS, approvalChip, labelOf } from './product-labels';
import { ProductRecordStore } from './product-record.store';
import { ProductsClient } from './products.client';

/**
 * Product record (UX 6.9, 7.6; F10): header, a pending change with its before and after, the approval bar for
 * supervisors, and the Details and Rates tabs.
 */
@Component({
  selector: 'ib-product-record-page',
  imports: [
    RouterOutlet,
    ApprovalBarComponent,
    BannerComponent,
    ButtonComponent,
    ChangesPanelComponent,
    StatusChipComponent,
    TabsComponent,
  ],
  providers: [ProductRecordStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--ib-space-2) var(--ib-space-3);
    }
    h1:focus {
      outline: none;
    }
    h1:focus-visible {
      outline: 2px solid var(--ib-focus);
      outline-offset: 2px;
    }
    .code {
      color: var(--ib-ink-muted);
      font-size: 15px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      margin: var(--ib-space-2) 0 var(--ib-space-4);
      align-items: center;
    }
    .meta {
      color: var(--ib-ink-muted);
    }
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-4);
    }
    h2 {
      margin-bottom: var(--ib-space-3);
    }
  `,
  template: `
    <div class="title-row">
      <h1 tabindex="-1" data-page-title>{{ store.product()?.productName ?? 'Product' }}</h1>
      @if (store.product(); as product) {
        <span class="code ib-num">{{ product.productCode }}</span>
      }
    </div>
    @if (store.product(); as product) {
      <div class="chips">
        <ib-status-chip domain="approval" [code]="approval(product.supervisionState)" [explain]="true" />
        <span class="meta"
          >{{ type(product.productTypeCode) }} · {{ product.currencyCode }} ·
          {{ product.isActive ? 'Active' : 'Inactive' }}{{ product.isFreezed ? ' · Frozen' : '' }}</span
        >
      </div>
      @if (product.pendingChange) {
        <section aria-labelledby="pending-title">
          <h2 id="pending-title">Change awaiting approval</h2>
          <ib-changes-panel [changes]="pendingChanges()" caption="Changes waiting for approval" />
        </section>
      }
      <ib-tabs label="Product record" [tabs]="tabs" />
      <router-outlet />
      @if (canApprove()) {
        <ib-approval-bar
          [own]="own()"
          [canReject]="true"
          [busy]="guard.busy()"
          [note]="
            product.pendingChange
              ? 'Approving applies the change.'
              : 'Approving lets accounts be opened on this product.'
          "
          (approved)="decide(true)"
          (rejected)="decide(false)"
        />
      }
    } @else if (store.problem(); as problem) {
      <ib-banner tone="danger" [message]="message(problem)" />
      @if (problem.type !== 'not-found') {
        <ib-button (click)="store.reload()">Try again</ib-button>
      }
    } @else {
      <p aria-live="polite">Loading the product…</p>
    }
  `,
})
export class ProductRecordPage {
  /** Route parameter `:id`. */
  readonly id = input.required<string>();

  protected readonly store = inject(ProductRecordStore);
  protected readonly guard = new SubmitGuard();
  protected readonly tabs = [
    { label: 'Details', path: 'details' },
    { label: 'Rates', path: 'rates' },
  ];

  private readonly client = inject(ProductsClient);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly approvals = inject(ApprovalsService);
  private readonly me = inject(AuthService).me;

  protected readonly canApprove = computed(() => {
    const product = this.store.product();
    return (
      !!product &&
      (product.supervisionState === 'PENDING' || !!product.pendingChange) &&
      this.permissions.can({ module: 'ACC', subModule: 'PRODUCT', action: 'supervise' })
    );
  });
  protected readonly own = computed(() => {
    const product = this.store.product();
    const me = this.me()?.staffUserId;
    if (!product || me === undefined) {
      return false;
    }
    return product.pendingChange
      ? product.pendingChange.requestedByUserId === me
      : product.createdByUserId === me || product.modifiedByUserId === me;
  });
  protected readonly pendingChanges = computed(() => {
    const product = this.store.product();
    if (!product?.pendingChange) {
      return [];
    }
    const current = {
      productName: product.productName,
      ledgerControlAccountId: product.ledgerControlAccountId,
      creditInterestRate: product.creditInterestRate,
      debitInterestRate: product.debitInterestRate,
      minimumBalance: product.minimumBalance,
      accountsPerCustomer: product.accountsPerCustomer,
      isChequeBookAllowed: product.isChequeBookAllowed,
      isFreezed: product.isFreezed,
      isActive: product.isActive,
    };
    return diffJson(current, product.pendingChange.proposed);
  });

  constructor() {
    effect(() => {
      const productId = Number(this.id());
      untracked(() => void this.store.load(productId));
    });
  }

  protected async decide(approve: boolean): Promise<void> {
    const product = this.store.product();
    if (!product) {
      return;
    }
    let reason: string | null = null;
    if (!approve) {
      reason = await this.dialogs.reason({
        title: product.pendingChange ? 'Reject the change?' : 'Reject product?',
        message: product.pendingChange
          ? 'The product stays as it is.'
          : 'The product is removed with its rates.',
        label: 'Reason',
        confirmLabel: 'Reject',
      });
      if (reason === null) {
        return;
      }
    }
    await this.guard.run(async () => {
      try {
        if (approve) {
          await this.client.approveProduct(product.productId);
          this.toast.success(product.pendingChange ? 'Change approved.' : 'Product approved.');
        } else {
          await this.client.rejectProduct(product.productId, reason!);
          this.toast.success(product.pendingChange ? 'Change rejected.' : 'Product rejected.');
        }
        void this.approvals.refresh();
        if (!approve && !product.pendingChange) {
          await this.router.navigate(['/products']);
          return;
        }
        await this.store.reload();
      } catch (failure) {
        this.toast.error(messageFor(toApiProblem(failure)));
      }
    });
  }

  protected message(problem: Parameters<typeof messageFor>[0]): string {
    return messageFor(problem);
  }

  protected readonly approval = approvalChip;
  protected type(code: string): string {
    return labelOf(PRODUCT_TYPE_LABELS, code);
  }
}
