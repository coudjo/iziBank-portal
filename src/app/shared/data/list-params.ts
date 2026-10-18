/** List filters shared by the reference screens (products, chart of accounts). */
export interface ListParams {
  search?: string | null;
  supervisionState?: string | null;
  typeId?: number | null;
  page?: number;
  pageSize?: number;
}

/** What an edit did: applied at once, or waiting for approval as a change request (HTTP 202). */
export interface EditOutcome {
  changeRequestId: number | null;
}

/** Query parameters without the empty ones. */
export function query(
  params: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '' && key !== 'typeId') {
      result[key] = value;
    }
  }
  return result;
}
