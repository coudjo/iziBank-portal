import { inject } from '@angular/core';
import { CanMatchFn, Router, Routes } from '@angular/router';
import { ApprovalsService } from './approvals.service';

/** /approvals goes to the first list the user may approve. */
const firstKind: CanMatchFn = () => {
  const kinds = inject(ApprovalsService).kinds();
  return inject(Router).createUrlTree(kinds.length > 0 ? ['/approvals', kinds[0]] : ['/not-allowed']);
};

const allowedKind: CanMatchFn = (_route, segments) =>
  (inject(ApprovalsService).kinds() as string[]).includes(segments[0]?.path ?? '')
    ? true
    : inject(Router).createUrlTree(['/not-allowed']);

/** Change requests are security approvals; ledger reviews need chart-of-accounts approval. */
const reviewable: CanMatchFn = (_route, segments) => {
  const kind = segments[1]?.path === 'ledger' ? 'ledger' : 'security';
  return inject(ApprovalsService).kinds().includes(kind)
    ? true
    : inject(Router).createUrlTree(['/not-allowed']);
};

/** Approvals (UX 4.2): inbox per type and the review page. */
export const APPROVAL_ROUTES: Routes = [
  { path: '', pathMatch: 'full', canMatch: [firstKind], children: [] },
  {
    path: 'review/:type/:id',
    title: 'Review',
    canMatch: [reviewable],
    loadComponent: () => import('./review.page').then((m) => m.ApprovalReviewPage),
  },
  {
    path: ':kind',
    title: 'Approvals',
    canMatch: [allowedKind],
    loadComponent: () => import('./approvals-inbox.page').then((m) => m.ApprovalsInboxPage),
  },
];
