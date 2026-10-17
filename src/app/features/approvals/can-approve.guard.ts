import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { PermissionService } from '../../core/permissions/permission.service';

/** The approvals area needs approve rights on customers, the chart of accounts or security (UX 4.1). */
export const canApprove: CanMatchFn = () => {
  const permissions = inject(PermissionService);
  const allowed =
    permissions.can({ module: 'PTY', subModule: 'KYC', action: 'supervise' }) ||
    permissions.can({ module: 'LED', subModule: 'CHART', action: 'supervise' }) ||
    permissions.can({ module: 'SEC', subModule: 'PERMISSIONS', action: 'supervise' });
  return allowed ? true : inject(Router).createUrlTree(['/not-allowed']);
};
