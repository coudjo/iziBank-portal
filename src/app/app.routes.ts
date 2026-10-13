import { Routes } from '@angular/router';
import { Component } from '@angular/core';

@Component({
  selector: 'app-placeholder',
  template: `<h1 class="wordmark">iziBank</h1>`,
  styles: `
    .wordmark {
      color: var(--ib-primary);
      font-weight: 700;
      margin: 24px;
    }
  `,
})
class Placeholder {}

// Replaced by the real shell and lazy feature routes in F2.
export const routes: Routes = [{ path: '', component: Placeholder, title: 'iziBank' }];
