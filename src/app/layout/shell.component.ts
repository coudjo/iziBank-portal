import { ChangeDetectionStrategy, Component, computed, inject, isDevMode } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AuthService } from '../core/auth/auth.service';
import { BranchContext } from '../core/branch/branch-context';
import { ViewportService } from '../core/layout/viewport.service';
import { PermissionService } from '../core/permissions/permission.service';
import { SessionMonitor } from '../core/session/session-monitor';
import { BannerComponent, DialogService, ToastService } from '../shared/ui';
import { SwitchBranchDialogComponent } from './switch-branch.dialog';
import { NAV_ITEMS, NavItem } from './navigation';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService);
  protected readonly branch = inject(BranchContext);
  protected readonly maxSessionNotice = inject(SessionMonitor).maxSessionNotice;
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly me = this.auth.me;
  protected readonly firstName = computed(() => this.me()?.fullName.split(' ')[0] ?? '');

  protected readonly visible = computed(() => {
    this.me();
    return NAV_ITEMS.filter(
      (item) =>
        (!item.placeholder || isDevMode()) && (!item.permission || this.permissions.can(item.permission)),
    );
  });

  protected readonly mainItems = computed(() => this.visible().filter((item) => item.section === 'main'));
  protected readonly adminItems = computed(() => this.visible().filter((item) => item.section === 'admin'));
  protected readonly bottomItems = computed(() => this.visible().filter((item) => item.bottomBar));
  protected readonly moreItems = computed(() => this.visible().filter((item) => !item.bottomBar));

  protected trackPath(_: number, item: NavItem): string {
    return item.path;
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
