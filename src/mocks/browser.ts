import { setupWorker } from 'msw/browser';
import { endSessions, handlers, setBusinessDay } from './handlers';
import { dropNextCreate, resetParties, setOverviewFailure } from './parties';

export const worker = setupWorker(...handlers);

// End-to-end tests drive session endings through this hook. Mocks only; never in a real API build.
(window as unknown as { __ibMock: unknown }).__ibMock = {
  endSessions,
  setBusinessDay,
  setOverviewFailure,
  dropNextCreate,
  resetParties,
};
