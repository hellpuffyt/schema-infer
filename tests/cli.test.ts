import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXIT_ERROR, EXIT_OK, EXIT_USAGE, VERSION, main } from '../src/cli.js';

let out: string[];
let err: string[];
let dir: string;

beforeEach(() => {
  out = [];
  err = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    err.push(String(chunk));
    return true;
  });
  dir = mkdtempSync(join(tmpdir(), 'schema-infer-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function sampleFile(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

const stdout = () => out.join('');
const stderr = () => err.join('');

describe('help and version', () => {
  it('prints usage for --help', () => {
    expect(main(['--help'])).toBe(EXIT_OK);
    expect(stdout()).toContain('schema-infer');
  });

  it('prints the version', () => {
    expect(main(['--version'])).toBe(EXIT_OK);
    expect(stdout().trim()).toBe(VERSION);
  });
});

describe('inference from files', () => {
  it('infers a schema and exits zero', () => {
    const file = sampleFile('a.json', '{"id":1,"name":"x"}');
    expect(main([file])).toBe(EXIT_OK);

    const schema = JSON.parse(stdout()) as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.$schema).toContain('2020-12');
  });

  it('reads NDJSON and merges every line', () => {
    const file = sampleFile('a.ndjson', '{"a":1}\n{"a":2,"b":3}\n');
    expect(main([file])).toBe(EXIT_OK);

    const schema = JSON.parse(stdout()) as { required: string[] };
    expect(schema.required).toEqual(['a']);
  });

  it('merges several files', () => {
    const one = sampleFile('one.ndjson', '{"a":1}');
    const two = sampleFile('two.ndjson', '{"a":2,"b":3}');
    expect(main([one, two])).toBe(EXIT_OK);

    const schema = JSON.parse(stdout()) as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(['a', 'b']);
  });

  it('applies title and description', () => {
    const file = sampleFile('a.json', '{"a":1}');
    expect(main([file, '--title', 'User', '--description', 'A user'])).toBe(EXIT_OK);

    const schema = JSON.parse(stdout()) as { title: string; description: string };
    expect(schema.title).toBe('User');
    expect(schema.description).toBe('A user');
  });

  it('honours --no-dialect, --closed and --enum', () => {
    // Enum inference needs three or more samples and a repeated value.
    const file = sampleFile(
      'a.ndjson',
      '{"s":"red"}\n{"s":"green"}\n{"s":"red"}\n{"s":"green"}',
    );
    expect(main([file, '--no-dialect', '--closed', '--enum', '5'])).toBe(EXIT_OK);

    const schema = JSON.parse(stdout()) as Record<string, unknown> & {
      properties: { s: { enum: string[] } };
    };
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.s.enum).toEqual(['green', 'red']);
  });

  it('respects --indent 0 for compact output', () => {
    const file = sampleFile('a.json', '{"a":1}');
    expect(main([file, '--indent', '0'])).toBe(EXIT_OK);
    expect(stdout()).not.toContain('\n  ');
  });
});

describe('failure handling', () => {
  it('reports malformed JSON as an error, not a crash', () => {
    const file = sampleFile('bad.json', '{oops}');
    expect(main([file])).toBe(EXIT_ERROR);
    expect(stderr()).not.toBe('');
  });

  it('reports a missing file', () => {
    expect(main([join(dir, 'nope.json')])).toBe(EXIT_ERROR);
  });

  it('rejects an unknown format', () => {
    const file = sampleFile('a.json', '{"a":1}');
    expect(main([file, '--format', 'yaml'])).toBe(EXIT_USAGE);
  });

  it('rejects an unknown option', () => {
    expect(main(['--nonsense'])).toBe(EXIT_USAGE);
  });

  it('rejects a negative enum threshold', () => {
    expect(main(['--enum', '-1'])).toBe(EXIT_USAGE);
  });

  it('rejects a non-numeric indent', () => {
    expect(main(['--indent', 'wide'])).toBe(EXIT_USAGE);
  });
});
