import { Injectable } from '@angular/core';

/** Wall clock in milliseconds. Replaced in tests. */
@Injectable({ providedIn: 'root' })
export class Clock {
  now(): number {
    return Date.now();
  }
}
