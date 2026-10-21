import {
  ChangeDetectionStrategy,
  Component,
  Type,
  computed,
  effect,
  inject,
  isDevMode,
  untracked,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AuthService } from '../core/auth/auth.service';
import { BranchContext } from '../core/branch/branch-context';
import { WorkingDateService } from '../core/branch/working-date.service';
import { ViewportService } from '../core/layout/viewport.service';
import { PermissionService } from '../core/permissions/permission.service';
import { SessionMonitor } from '../core/session/session-monitor';
import { BannerComponent, DialogService, StatusChipComponent, ToastService } from '../shared/ui';
import { SwitchBranchDialogComponent } from './switch-branch.dialog';
import { NAV_ITEMS, NavItem } from './navigation';
import { ApprovalsService } from '../features/approvals';

/** App shell (UX 4.1): top bar, sidebar on desktop and tablet, bottom bar on phones. */
@Component({
  selector: 'ib-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NzIconModule,
    NzDropdownModule,
    NzTooltipModule,
    BannerComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'shortcut($event)' },
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService);
  protected readonly branch = inject(BranchContext);
  protected readonly workingDate = inject(WorkingDateService);
  protected readonly maxSessionNotice = inject(SessionMonitor).maxSessionNotice;
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly me = this.auth.me;
  protected readonly approvals = inject(ApprovalsService);
  protected readonly approvalCount = this.approvals.count;
  protected readonly canApprove = computed(() => {
    this.me();
    return this.approvals.kinds().length > 0;
  });
  protected readonly canSearch = computed(() => {
    this.me();
    return this.permissions.can({ module: 'PTY', subModule: 'PARTY', action: 'view' });
  });
  private overlayOpen = false;

  constructor() {
    // Approvals badge (F3-05): load for approvers once signed in, again after a branch switch (new permissions).
    effect(() => {
      if (this.canApprove()) {
        untracked(() => this.approvals.start());
      }
    });
  }
  protected readonly firstName = computed(() => this.me()?.fullName.split(' ')[0] ?? '');

  protected readonly visible = computed(() => {
    this.me();
    return NAV_ITEMS.filter(
      (item) =>
        (!item.placeholder || isDevMode()) &&
        (!item.permission || this.permissions.can(item.permission)) &&
        (!item.anyOf || this.permissions.canAny(item.anyOf)) &&
        (!item.approvals || this.approvals.kinds().length > 0),
    );
  });

  protected readonly mainItems = computed(() => this.visible().filter((item) => item.section === 'main'));
  protected readonly adminItems = computed(() => this.visible().filter((item) => item.section === 'admin'));
  protected readonly bottomItems = computed(() => this.visible().filter((item) => item.bottomBar));
  protected readonly moreItems = computed(() => this.visible().filter((item) => !item.bottomBar));

  protected trackPath(_: number, item: NavItem): string {
    return item.path;
  }

  /** UX 5.9: `/` or Ctrl+K opens search, `?` lists the shortcuts. Ignored while typing in a field. */
  protected shortcut(event: KeyboardEvent): void {
    if (this.overlayOpen || event.defaultPrevented) {
      return;
    }
    const typing = isTyping(event.target);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openSearch();
    } else if (!typing && event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.openSearch();
    } else if (!typing && event.key === '?') {
      event.preventDefault();
      void this.overlay(
        import('./shortcuts.dialog').then((m) => m.ShortcutsDialogComponent),
        'Keyboard shortcuts',
      );
    }
  }

  protected openSearch(): void {
    if (this.canSearch() && !this.overlayOpen) {
      void this.overlay(
        import('./search.dialog').then((m) => m.SearchDialogComponent),
        'Search',
        600,
      );
    }
  }

  private async overlay(component: Promise<Type<unknown>>, title: string, width?: number): Promise<void> {
    this.overlayOpen = true;
    try {
      const ref = await this.dialogs.open(await component, null, { title, width });
      ref.afterClose.subscribe(() => (this.overlayOpen = false));
    } catch {
      this.overlayOpen = false;
    }
  }

  protected switchBranch(): void {
    void this.dialogs
      .open<SwitchBranchDialogComponent, null, string>(SwitchBranchDialogComponent, null, {
        title: 'Switch branch',
      })
      .then((ref) =>
        ref.afterClose.subscribe((branchName) => {
          if (branchName) {
            this.toast.success(`You are now working in ${branchName}.`);
            void this.router.navigateByUrl('/dashboard');
          }
        }),
      );
  }

  protected async signOut(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
