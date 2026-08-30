import { describe, expect, it } from 'vitest';

import { ParseError, looksLikeNdjson, parseSamples } from '../src/parse.js';

describe('looksLikeNdjson', () => {
  it('recognises multiple complete documents', () => {
    expect(looksLikeNdjson('{"a":1}\n{"a":2}')).toBe(true);
  });

  it('rejects a single document spanning several lines', () => {
    // The trap: pretty-printed JSON has newlines but is not NDJSON.
    expect(looksLikeNdjson('{\n  "a": 1\n}')).toBe(false);
  });

  it('rejects a single line', () => {
    expect(looksLikeNdjson('{"a":1}')).toBe(false);
  });
});

describe('parseSamples', () => {
  it('unwraps a top-level array into samples', () => {
    expect(parseSamples('[{"a":1},{"a":2}]')).toHaveLength(2);
  });

  it('keeps a top-level array whole when asked', () => {
    const samples = parseSamples('[{"a":1},{"a":2}]', 'json', false);
    expect(samples).toHaveLength(1);
    expect(Array.isArray(samples[0])).toBe(true);
  });

  it('reads NDJSON, skipping blank lines', () => {
    expect(parseSamples('{"a":1}\n\n{"a":2}\n')).toHaveLength(2);
  });

  it('parses pretty-printed JSON as one sample', () => {
    expect(parseSamples('{\n  "a": 1\n}')).toHaveLength(1);
  });

  it('honours an explicit format', () => {
    expect(parseSamples('{"a":1}', 'ndjson')).toHaveLength(1);
  });

  it('names the failing line in NDJSON', () => {
    try {
      parseSamples('{"a":1}\nnot json\n{"a":2}', 'ndjson');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).line).toBe(2);
      expect((error as Error).message).toContain('line 2');
    }
  });

  it('rejects empty input', () => {
    expect(() => parseSamples('   ')).toThrow(ParseError);
  });

  it('rejects an empty top-level array', () => {
    expect(() => parseSamples('[]')).toThrow(/nothing to infer/);
  });

  it('reports malformed JSON', () => {
    expect(() => parseSamples('{oops}')).toThrow(ParseError);
  });
});
