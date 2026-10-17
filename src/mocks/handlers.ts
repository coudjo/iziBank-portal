import { http, HttpResponse } from 'msw';
import type { TokenResponse } from '../app/core/api/api-types';
import { BRANCHES, HOME_BRANCH, MOCK_USERS, MockUser, groupsIn, profileOf } from './data';
import { partyHandlers } from './parties';

/**
 * Mock API for development and end-to-end tests, following api/openapi.json and api/problem-types.md.
 * Mock state (never real data) is kept in this tab's sessionStorage so a page reload behaves like the real API.
 */
const STATE_KEY = 'ib-mock-state';

interface MockState {
  sessions: Record<string, number>;
  /** Problem type returned for every session after a test ends them (window.__ibMock.endSessions). */
  endedReason?: string;
  users: Record<number, { secret: string; mustChange: boolean }>;
  nextSession: number;
  /** Latest business day per branch id; a missing branch has never opened a day. */
  businessDays?: Record<number, { workingDate: string; status: string }>;
}

/** Head office has an open day; Kumasi has none, so the "Business day not open" chip can be seen. */
const DEFAULT_BUSINESS_DAYS: Record<number, { workingDate: string; status: string }> = {
  [HOME_BRANCH.branchId]: { workingDate: '2026-10-14', status: 'OPEN' },
};

function load(): MockState {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (raw) {
      return JSON.parse(raw) as MockState;
    }
  } catch {
    // Fall through to a fresh state.
  }
  return { sessions: {}, users: {}, nextSession: 100 };
}

function save(state: MockState): void {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Mock state is best effort.
  }
}

const state = load();
for (const user of MOCK_USERS) {
  const saved = state.users[user.staffUserId];
  if (saved) {
    user.secret = saved.secret;
    user.mustChange = saved.mustChange;
  }
}

const sessions = {
  get: (token: string) => MOCK_USERS.find((user) => user.staffUserId === state.sessions[token]),
  set: (token: string, user: MockUser) => {
    state.sessions[token] = user.staffUserId;
    save(state);
  },
  delete: (token: string) => {
    delete state.sessions[token];
    save(state);
  },
  entries: () => Object.entries(state.sessions),
};

/** Test hook: set the latest business day of a branch (null: none). */
export function setBusinessDay(branchId: number, workingDate: string | null, status = 'OPEN'): void {
  const days = { ...(state.businessDays ?? DEFAULT_BUSINESS_DAYS) };
  if (workingDate === null) {
    delete days[branchId];
  } else {
    days[branchId] = { workingDate, status };
  }
  state.businessDays = days;
  save(state);
}

/** Test hook: end every session with a reason, as the API would after a forced logout or idle sweep. */
export function endSessions(reason: string): void {
  state.sessions = {};
  state.endedReason = reason;
  save(state);
}

function ended() {
  return problem(401, state.endedReason ?? 'auth.session-ended');
}

function remember(user: MockUser): void {
  state.users[user.staffUserId] = { secret: user.secret, mustChange: user.mustChange };
  save(state);
}

const problem = (status: number, type: string, extra: Record<string, unknown> = {}) =>
  HttpResponse.json(
    { type, title: type, status, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

function issue(user: MockUser): TokenResponse {
  const sessionId = ++state.nextSession;
  const accessToken = `mock.${user.staffCode}.${sessionId}`;
  for (const [token, ownerId] of sessions.entries()) {
    if (ownerId === user.staffUserId) {
      sessions.delete(token);
    }
  }
  sessions.set(accessToken, user);
  const now = Date.now();
  return {
    accessToken,
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
    sessionMaxExpiresAt: new Date(now + 12 * 3_600_000).toISOString(),
    sessionId,
    branchId: HOME_BRANCH.branchId,
    mustChangeSecretKey: user.mustChange,
  };
}

function caller(request: Request): MockUser | null {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  return sessions.get(token) ?? null;
}

const base = '/api/v1';

export const handlers = [
  http.post(`${base}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { staffCode?: string; secretKey?: string };
    const user = MOCK_USERS.find((candidate) => candidate.staffCode === body.staffCode?.trim().toUpperCase());
    if (user?.locked) {
      return problem(401, 'auth.locked', { retryAfterSeconds: 720 });
    }
    if (!user || user.secret !== body.secretKey) {
      return problem(401, 'auth.invalid-credentials');
    }
    state.endedReason = undefined;
    save(state);
    return HttpResponse.json(issue(user));
  }),

  http.post(`${base}/auth/refresh`, ({ request }) => {
    const user = caller(request);
    return user ? HttpResponse.json(issue(user)) : ended();
  }),

  http.post(`${base}/auth/logout`, ({ request }) => {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    sessions.delete(token);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${base}/auth/change-secret-key`, async ({ request }) => {
    const user = caller(request);
    if (!user) {
      return ended();
    }
    const body = (await request.json()) as { currentSecretKey?: string; newSecretKey?: string };
    if (body.currentSecretKey !== user.secret) {
      return problem(400, 'auth.current-secret-key-wrong');
    }
    user.secret = body.newSecretKey ?? user.secret;
    user.mustChange = false;
    remember(user);
    return HttpResponse.json(issue(user));
  }),

  http.get(`${base}/auth/me`, ({ request }) => {
    const user = caller(request);
    if (!user) {
      return ended();
    }
    const branchId = Number(request.headers.get('X-Branch-Id') ?? HOME_BRANCH.branchId);
    if (groupsIn(user, branchId) === null) {
      return problem(403, 'auth.branch-not-allowed');
    }
    return HttpResponse.json(profileOf(user, branchId));
  }),

  http.get(`${base}/business-day/current`, ({ request }) => {
    const user = caller(request);
    if (!user) {
      return ended();
    }
    const branchId = Number(request.headers.get('X-Branch-Id') ?? HOME_BRANCH.branchId);
    const branch = BRANCHES.find((row) => row.branchId === branchId);
    if (!branch || groupsIn(user, branchId) === null) {
      return problem(403, 'auth.branch-not-allowed');
    }
    const day = (state.businessDays ?? DEFAULT_BUSINESS_DAYS)[branchId];
    return HttpResponse.json({
      branchId,
      branchCode: branch.branchCode,
      workingDate: day?.workingDate ?? null,
      status: day?.status ?? null,
      isOpen: day?.status === 'OPEN',
    });
  }),

  ...partyHandlers(
    base,
    (request) => (caller(request) ? null : ended()),
    (request) => caller(request)?.staffUserId ?? null,
  ),

  http.get(`${base}/health`, () => HttpResponse.json({ status: 'ok' })),
];
