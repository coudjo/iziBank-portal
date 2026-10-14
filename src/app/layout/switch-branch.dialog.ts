import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzModalRef } from 'ng-zorro-antd/modal';
import { AuthService } from '../core/auth/auth.service';
import { BranchContext } from '../core/branch/branch-context';
import { toApiProblem } from '../core/errors/api-problem';
import { messageFor } from '../core/errors/error-catalog';
import { BannerComponent, ButtonComponent } from '../shared/ui';

/** Switch the working branch (UX 4.1 user menu). Only branches where the user holds a role group are listed. */
@Component({
  selector: 'ib-switch-branch-dialog',
  imports: [FormsModule, BannerComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    fieldset {
      border: 0;
      margin: 0 0 var(--ib-space-4);
      padding: 0;
    }
    label {
      display: flex;
      align-items: center;
      gap: var(--ib-space-3);
      min-height: var(--ib-touch-target);
      padding: 0 var(--ib-space-3);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-sm);
      margin-bottom: var(--ib-space-2);
      cursor: pointer;
    }
    input {
      width: 18px;
      height: 18px;
      accent-color: var(--ib-primary);
    }
    .code {
      color: var(--ib-ink-muted);
      margin-left: auto;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--ib-space-2);
    }
  `,
  template: `
    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
    }
    <fieldset>
      <legend class="ib-visually-hidden">Branch</legend>
      @for (branch of branches; track branch.branchId) {
        <label>
          <input type="radio" name="branch" [value]="branch.branchId" [(ngModel)]="selected" />
          <span>{{ branch.branchName }}</span>
          <span class="code">{{ branch.branchCode }}</span>
        </label>
      }
    </fieldset>
    <div class="actions">
      <ib-button (click)="ref.close()">Cancel</ib-button>
      <ib-button variant="primary" [loading]="busy()" (click)="confirm()">Switch</ib-button>
    </div>
  `,
})
export class SwitchBranchDialogComponent {
  protected readonly ref = inject<NzModalRef<SwitchBranchDialogComponent, string>>(NzModalRef);
  private readonly branch = inject(BranchContext);
  private readonly me = inject(AuthService).me();

  protected readonly branches = this.me?.branches ?? [];
  protected selected = this.me?.branchId ?? null;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async confirm(): Promise<void> {
    if (this.selected === null || this.selected === this.me?.branchId) {
      this.ref.close();
      return;
    }
    this.busy.set(true);
    try {
      await this.branch.switchTo(this.selected);
      this.ref.close(this.branches.find((item) => item.branchId === this.selected)?.branchName);
    } catch (failure) {
      this.error.set(messageFor(toApiProblem(failure)));
    } finally {
      this.busy.set(false);
    }
  }
}
