/**
 * String `format` detection.
 *
 * A format is only claimed when *every* observed sample of a field matches it,
 * so one stray value is enough to withdraw the claim. The patterns are
 * deliberately strict: a false `format` in a generated schema causes valid data
 * to be rejected later, which is a worse failure than emitting no format.
 */

import { isIPv6 } from 'node:net';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|([+-])(\d{2}):(\d{2}))$/;

/** A real calendar date: Date.parse rolls 2023-02-29 over to March, so check y/m/d explicitly. */
function isCalendarDate(v: string): boolean {
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= daysInMonth;
}

/**
 * RFC 3339 full-time: hours 00-23, minutes 00-59, seconds 00-60 (leap
 * second), and a *required* offset, which is what JSON Schema's `time`
 * means — validators reject `10:00:00` without one.
 */
function isRfc3339Time(v: string): boolean {
  const m = TIME_RE.exec(v);
  if (!m) return false;
  const [h, mi, se] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (h > 23 || mi > 59 || se > 60) return false;
  if (m[6] !== undefined && (Number(m[7]) > 23 || Number(m[8]) > 59)) return false;
  return true;
}

/** Formats this package can recognise, in priority order. */
export const FORMATS: readonly { name: string; test: (value: string) => boolean }[] = [
  {
    // RFC 3339 date-time, the format JSON Schema actually specifies.
    name: 'date-time',
    test: (v) => {
      const sep = v.search(/[Tt]/);
      return sep === 10 && isCalendarDate(v.slice(0, 10)) && isRfc3339Time(v.slice(11));
    },
  },
  {
    name: 'date',
    test: isCalendarDate,
  },
  {
    name: 'time',
    test: isRfc3339Time,
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
    // A real address parser instead of a character-class guess ("a:b:c" is
    // not an address). Zone ids (`%eth0`) are excluded: the JSON Schema
    // `ipv6` format does not allow them.
    test: (v) => !v.includes('%') && isIPv6(v),
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
