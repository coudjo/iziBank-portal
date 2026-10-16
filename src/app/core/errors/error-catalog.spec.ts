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

describe('messageFor placeholders', () => {
  it('names the existing customer when the screen knows the name', () => {
    const problem = {
      type: 'party.duplicate-identification',
      extensions: { existingPartyNumber: '0000000042' },
    };
    expect(messageFor(problem, undefined, { name: 'Ama Mensah' })).toBe(
      'A customer with this ID already exists: Ama Mensah (0000000042).',
    );
    expect(messageFor(problem)).toBe('A customer with this ID already exists (0000000042).');
  });

  it('states upload limits in readable units', () => {
    expect(messageFor({ type: 'upload.too-large', extensions: { maxBytes: 2 * 1024 * 1024 } })).toBe(
      'The file is too large. The limit is 2 MB.',
    );
    expect(messageFor({ type: 'upload.dimensions', extensions: { maxWidth: 2000, maxHeight: 1000 } })).toBe(
      'The signature image is too large. It can be at most 2000 by 1000 pixels.',
    );
  });
});
