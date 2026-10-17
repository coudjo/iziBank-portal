/**
 * "Changes since last approval" (UX 6.6 step 3): a field-by-field comparison of a change request's `before` and
 * `proposed` values. Nested objects become dotted fields; lists show what was added and removed.
 */
export interface FieldChange {
  field: string;
  before: string;
  after: string;
  /** For lists: the items only in `before` / only in `after`. */
  removed?: string[];
  added?: string[];
}

type Json = null | boolean | number | string | Json[] | JsonObject;
interface JsonObject {
  [key: string]: Json;
}

export function diffJson(before: unknown, after: unknown): FieldChange[] {
  const changes: FieldChange[] = [];
  walk('', (before ?? null) as Json, (after ?? null) as Json, changes);
  return changes;
}

function walk(path: string, before: Json, after: Json, out: FieldChange[]): void {
  if (isObject(before) || isObject(after)) {
    const left = isObject(before) ? before : {};
    const right = isObject(after) ? after : {};
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
    for (const key of keys) {
      walk(path ? `${path}.${key}` : key, left[key] ?? null, right[key] ?? null, out);
    }
    return;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    const left = (Array.isArray(before) ? before : []).map(describe);
    const right = (Array.isArray(after) ? after : []).map(describe);
    const removed = left.filter((item) => !right.includes(item));
    const added = right.filter((item) => !left.includes(item));
    if (removed.length > 0 || added.length > 0) {
      out.push({
        field: label(path),
        before: left.join('; ') || '—',
        after: right.join('; ') || '—',
        removed,
        added,
      });
    }
    return;
  }
  if (describe(before) !== describe(after)) {
    out.push({ field: label(path), before: describe(before), after: describe(after) });
  }
}

/** One value as text. A permission grant reads "PTY / PARTY: view, add". */
export function describe(value: Json): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (Array.isArray(value)) {
    return value.map(describe).join('; ');
  }
  if (isObject(value)) {
    if (typeof value['moduleCode'] === 'string') {
      const actions = ['View', 'Add', 'Edit', 'Delete', 'Supervise']
        .filter((action) => value[`allow${action}`] === true)
        .map((action) => (action === 'Supervise' ? 'approve' : action.toLowerCase()));
      const scope = value['subModuleCode']
        ? `${value['moduleCode']} / ${value['subModuleCode']}`
        : value['moduleCode'];
      return `${scope}: ${actions.join(', ') || 'no access'}`;
    }
    return Object.entries(value)
      .map(([key, item]) => `${label(key)}: ${describe(item)}`)
      .join(', ');
  }
  return String(value);
}

/** `roleGroupCodes` → "Role group codes"; dotted paths keep their parts. */
export function label(path: string): string {
  return path
    .split('.')
    .map((part) => {
      const words = part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
      return words.charAt(0).toUpperCase() + words.slice(1);
    })
    .join(' › ');
}

function isObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
