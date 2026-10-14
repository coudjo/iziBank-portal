import { HttpErrorResponse } from '@angular/common/http';

/** Problem details from the API (RFC 7807). `type` is a stable code listed in api/problem-types.md. */
export interface ApiProblem {
  status: number;
  type: string;
  title?: string;
  errors?: Record<string, string[]>;
  extensions: Record<string, unknown>;
}

const NETWORK = 'network';

export function toApiProblem(error: unknown): ApiProblem {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, type: 'unexpected', extensions: {} };
  }

  if (error.status === 0) {
    return { status: 0, type: NETWORK, extensions: {} };
  }

  const body = (error.error ?? {}) as Record<string, unknown>;
  const { type, title, errors, status, ...extensions } = body;
  void status;
  return {
    status: error.status,
    type: typeof type === 'string' && type.length > 0 ? type : fallbackType(error.status),
    title: typeof title === 'string' ? title : undefined,
    errors: isErrorMap(errors) ? errors : undefined,
    extensions,
  };
}

export function isNetworkProblem(problem: ApiProblem): boolean {
  return problem.type === NETWORK;
}

function fallbackType(status: number): string {
  if (status === 404) {
    return 'not-found';
  }
  if (status === 401) {
    return 'auth.unauthenticated';
  }
  if (status === 403) {
    return 'auth.permission-denied';
  }
  return 'unexpected';
}

function isErrorMap(value: unknown): value is Record<string, string[]> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every(
      (item) => Array.isArray(item) && item.every((text) => typeof text === 'string'),
    )
  );
}
