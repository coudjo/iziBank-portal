import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { ConfigService } from './core/config/config.service';

describe('App', () => {
  it('renders a skip link to the main content', async () => {
    const config = new ConfigService();
    await config.load((() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            apiBaseUrl: '/api/v1',
            useMocks: false,
            idleWarningSeconds: 120,
            refreshWhenRemainingSeconds: 300,
            activeWindowSeconds: 60,
          }),
        ),
      )) as typeof fetch);

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: config },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a.skip-link');
    expect(link?.textContent).toContain('Skip to content');
    expect(link?.getAttribute('href')).toBe('#main');
  });
});
