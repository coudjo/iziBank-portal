import { messageFor } from './error-catalog';

describe('messageFor', () => {
  it('uses the portal wording, not the API title', () => {
    expect(messageFor({ type: 'auth.invalid-credentials', extensions: {} })).toBe(
      'Check your staff code and password.',
    );
  });

  it('rounds the lockout up to whole minutes', () => {
    expect(messageFor({ type: 'auth.locked', extensions: { retryAfterSeconds: 61 } })).toBe(
      'Too many attempts. Try again in 2 minutes.',
    );
  });

  it('falls back to a reference for unknown failures', () => {
    expect(messageFor({ type: 'something.new', extensions: {} }, 'abc123')).toBe(
      'Something went wrong. Reference: abc123',
    );
    expect(messageFor({ type: 'network', extensions: {} })).toContain('could not reach the server');
  });
});
