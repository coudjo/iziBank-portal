import { ConfigService } from './config.service';

const good = {
  apiBaseUrl: '/api/v1',
  useMocks: false,
  idleWarningSeconds: 120,
  refreshWhenRemainingSeconds: 300,
  activeWindowSeconds: 60,
};

const respond = (body: unknown, status = 200) =>
  (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;

describe('ConfigService', () => {
  it('exposes a value read from the file', async () => {
    const service = new ConfigService();
    await service.load(respond(good));
    expect(service.config.apiBaseUrl).toBe('/api/v1');
  });

  it('refuses to start when a key is missing', async () => {
    const service = new ConfigService();
    const { apiBaseUrl, ...partial } = good;
    void apiBaseUrl;
    await expect(service.load(respond(partial))).rejects.toThrow('apiBaseUrl');
  });

  it('refuses to start when the file cannot be fetched', async () => {
    const service = new ConfigService();
    await expect(service.load(respond({}, 404))).rejects.toThrow('404');
  });

  it('throws if read before loading', () => {
    expect(() => new ConfigService().config).toThrow();
  });
});
