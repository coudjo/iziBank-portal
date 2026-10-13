import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { ConfigService } from './app/core/config/config.service';

async function start(): Promise<void> {
  const configService = new ConfigService();
  const config = await configService.load();
  if (config.useMocks) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
  }
  await bootstrapApplication(App, {
    providers: [...appConfig.providers, { provide: ConfigService, useValue: configService }],
  });
}

start().catch((err) => {
  console.error(err);
  document.body.textContent = 'iziBank could not start. Contact your administrator.';
});
