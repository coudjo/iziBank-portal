/**
 * Starts the mock API (development and e2e). Production builds replace this file with `start.prod.ts`
 * (angular.json fileReplacements), so the mock data and its sign-ins are never shipped.
 */
export async function startMocks(): Promise<void> {
  const { worker } = await import('./browser');
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}
