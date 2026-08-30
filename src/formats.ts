/**
 * String `format` detection.
 *
 * A format is only claimed when *every* observed sample of a field matches it,
 * so one stray value is enough to withdraw the claim. The patterns are
 * deliberately strict: a false `format` in a generated schema causes valid data
 * to be rejected later, which is a worse failure than emitting no format.
 */

/** Formats this package can recognise, in priority order. */
export const FORMATS: readonly { name: string; test: (value: string) => boolean }[] = [
  {
    // RFC 3339 date-time, the format JSON Schema actually specifies.
    name: 'date-time',
    test: (v) =>
      /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.test(v) &&
      !Number.isNaN(Date.parse(v)),
  },
  {
    name: 'date',
    test: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
  },
  {
    name: 'time',
    test: (v) => /^\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?$/.test(v),
  },
  {
    name: 'uuid',
    test: (v) =>
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v),
  },
  {
    // Intentionally not RFC 5322. That grammar accepts addresses no real
    // system wants, and rejecting valid mail is the expensive mistake here.
    name: 'email',
    test: (v) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v),
  },
  {
    name: 'ipv4',
    test: (v) =>
      /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(v) &&
      v.split('.').every((part) => Number(part) <= 255 && String(Number(part)) === part),
  },
  {
    name: 'ipv6',
    test: (v) => /^[0-9a-fA-F:]+$/.test(v) && v.includes('::') === (v.match(/::/g)?.length === 1) && /:/.test(v) && v.split(':').length >= 3,
  },
  {
    name: 'uri',
    test: (v) => {
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) return false;
      try {
        new URL(v);
        return true;
      } catch {
        return false;
      }
    },
  },
];

/**
 * Return every format that matches a single string.
 *
 * More than one can match — a URI is not a date, but `2024-01-01` is both a
 * `date` and nothing else, while some strings match both `uri` and `ipv6`.
 * Callers intersect these sets across samples and take the first survivor in
 * declaration order.
 */
export function matchingFormats(value: string): Set<string> {
  const matches = new Set<string>();
  for (const format of FORMATS) {
    if (format.test(value)) matches.add(format.name);
  }
  return matches;
}

/** Pick the highest-priority format from a candidate set. */
export function preferredFormat(candidates: Set<string>): string | undefined {
  for (const format of FORMATS) {
    if (candidates.has(format.name)) return format.name;
  }
  return undefined;
}
