import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';
import { changePasswordGuard, guestGuard, requirePermission, signedInGuard } from './core/auth/auth.guards';
import { NAV_ITEMS } from './layout/navigation';

const placeholders: Routes = isDevMode()
  ? NAV_ITEMS.filter((item) => item.placeholder).map((item) => ({
      path: item.path.slice(1),
      title: item.label,
      data: { title: item.label },
      canMatch: item.permission ? [requirePermission(item.permission)] : [],
      loadComponent: () => import('./features/system/system.pages').then((m) => m.ComingSoonPage),
    }))
  : [];

const devOnly: Routes = isDevMode()
  ? [
      {
        path: 'dev/components',
        title: 'Component gallery',
        loadComponent: () => import('./dev/component-gallery.page').then((m) => m.ComponentGalleryPage),
      },
    ]
  : [];

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    canMatch: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'change-password',
    title: 'Change password',
    canMatch: [changePasswordGuard],
    loadComponent: () => import('./features/auth/change-password.page').then((m) => m.ChangePasswordPage),
  },
  { path: 'change-password', redirectTo: 'login' },
  {
    path: '',
    canMatch: [signedInGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      ...placeholders,
      ...devOnly,
      {
        path: 'not-allowed',
        title: 'Not allowed',
        loadComponent: () => import('./features/system/system.pages').then((m) => m.NotAllowedPage),
      },
      {
        path: '**',
        title: 'Page not found',
        loadComponent: () => import('./features/system/system.pages').then((m) => m.NotFoundPage),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
