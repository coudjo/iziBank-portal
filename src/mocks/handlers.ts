import { http, HttpResponse } from 'msw';

/** Handlers are added per feature from the OpenAPI examples (T17). */
export const handlers = [http.get('/api/v1/health', () => HttpResponse.json({ status: 'ok' }))];
