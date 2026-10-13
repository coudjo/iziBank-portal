import { Injectable } from '@angular/core';

export interface AppConfig {
  apiBaseUrl: string;
  useMocks: boolean;
  idleWarningSeconds: number;
  refreshWhenRemainingSeconds: number;
  activeWindowSeconds: number;
}

const REQUIRED: (keyof AppConfig)[] = [
  'apiBaseUrl',
  'useMocks',
  'idleWarningSeconds',
  'refreshWhenRemainingSeconds',
  'activeWindowSeconds',
];

/** Loads /config.json before bootstrap so one build deploys anywhere (T10). */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private value: AppConfig | null = null;

  get config(): AppConfig {
    if (!this.value) {
      throw new Error('Config accessed before it was loaded.');
    }
    return this.value;
  }

  async load(fetcher: typeof fetch = fetch): Promise<AppConfig> {
    const response = await fetcher('/config.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Could not load config.json (${response.status}).`);
    }
    const raw = (await response.json()) as Partial<AppConfig>;
    const missing = REQUIRED.filter((key) => raw[key] === undefined);
    if (missing.length > 0) {
      throw new Error(`config.json is missing: ${missing.join(', ')}`);
    }
    this.value = raw as AppConfig;
    return this.value;
  }
}
