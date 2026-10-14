import { TokenStorage } from './token-storage';

describe('TokenStorage', () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('keeps only the token, its expiry and the session id, in sessionStorage only', () => {
    const storage = new TokenStorage();
    storage.write({
      accessToken: 'abc',
      expiresAt: '2026-10-14T12:00:00Z',
      sessionId: 7,
      fullName: 'Ama Mensah',
    } as never);

    const raw = sessionStorage.getItem('ib.session') ?? '';
    expect(JSON.parse(raw)).toEqual({ accessToken: 'abc', expiresAt: '2026-10-14T12:00:00Z', sessionId: 7 });
    expect(raw).not.toContain('Ama');
    expect(localStorage.length).toBe(0);
    expect(storage.read()?.sessionId).toBe(7);

    storage.clear();
    expect(storage.read()).toBeNull();
  });

  it('ignores a damaged entry', () => {
    sessionStorage.setItem('ib.session', '{not json');
    expect(new TokenStorage().read()).toBeNull();
  });
});
