/**
 * Reading sample data.
 *
 * Two shapes are supported because they are the two shapes sample data
 * actually arrives in: a single JSON document, and newline-delimited JSON
 * (one document per line), which is what every log pipeline and database
 * export produces.
 */

import type { JsonValue } from './types.js';

/** A parse failure that names the offending line. */
export class ParseError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line === undefined ? message : `line ${line}: ${message}`);
    this.name = 'ParseError';
  }
}

/** How the input should be interpreted. */
export type InputFormat = 'json' | 'ndjson' | 'auto';

/**
 * Detect whether text is NDJSON.
 *
 * A single JSON document may span many lines, so the test is not "has
 * newlines". It is: after trimming, are there at least two non-empty lines,
 * and does the first one parse as a complete JSON value on its own?
 */
export function looksLikeNdjson(text: string): boolean {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) return false;
  try {
    JSON.parse(lines[0] as string);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse sample text into a list of values.
 *
 * A top-level JSON array is unwrapped into its elements, because a file
 * containing `[{...}, {...}]` is nearly always a collection of samples rather
 * than a single sample that happens to be an array. Pass `unwrapArray: false`
 * to describe the array itself.
 */
export function parseSamples(
  text: string,
  format: InputFormat = 'auto',
  unwrapArray = true,
): JsonValue[] {
  const trimmed = text.trim();
  if (trimmed === '') throw new ParseError('input is empty');

  const resolved: Exclude<InputFormat, 'auto'> =
    format === 'auto' ? (looksLikeNdjson(trimmed) ? 'ndjson' : 'json') : format;

  if (resolved === 'ndjson') {
    const samples: JsonValue[] = [];
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = (lines[index] as string).trim();
      if (line === '') continue;
      try {
        samples.push(JSON.parse(line) as JsonValue);
      } catch (error) {
        throw new ParseError((error as Error).message, index + 1);
      }
    }
    if (samples.length === 0) throw new ParseError('no JSON documents found');
    return samples;
  }

  let parsed: JsonValue;
  try {
    parsed = JSON.parse(trimmed) as JsonValue;
  } catch (error) {
    throw new ParseError((error as Error).message);
  }

  if (unwrapArray && Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new ParseError('top-level array is empty; nothing to infer from');
    }
    return parsed;
  }
  return [parsed];
}
