import { isOwnWork } from './four-eyes';
import { tabsFor } from './customer-tabs';

describe('four-eyes', () => {
  it('blocks the creator or last modifier, and nobody else', () => {
    expect(isOwnWork(3, 3, null)).toBe(true);
    expect(isOwnWork(3, 2, 3)).toBe(true);
    expect(isOwnWork(3, 2, null)).toBe(false);
    expect(isOwnWork(null, null)).toBe(false);
  });
});

describe('customer tabs', () => {
  it('show Activity only with audit permission, and type-specific tabs by type', () => {
    const none = tabsFor('INDIVIDUAL', () => false, false).map((tab) => tab.path);
    expect(none).toContain('documents');
    expect(none).not.toContain('activity');
    expect(none).not.toContain('accounts');
    expect(tabsFor('INDIVIDUAL', () => true, false).map((tab) => tab.path)).toContain('activity');
    expect(tabsFor('GROUP', () => false, false).map((tab) => tab.path)).not.toContain('documents');
  });
});
