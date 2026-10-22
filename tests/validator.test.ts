/**
 * Soundness against a real JSON Schema 2020-12 validator (ajv + ajv-formats):
 * every inferred schema must compile under the 2020-12 meta-schema in strict
 * mode, and every sample it was inferred from must validate against it.
 */
import Ajv2020Import from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { inferSchema } from '../src/infer.js';
import type { InferOptions, JsonValue } from '../src/types.js';

// CommonJS default exports under NodeNext.
const Ajv2020 = Ajv2020Import as unknown as typeof Ajv2020Import.default;
const addFormats = addFormatsImport as unknown as typeof addFormatsImport.default;

function validator() {
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  return ajv;
}

const ALL_ON: InferOptions = { enumThreshold: 10, inferBounds: true, closedObjects: true };

function expectSound(samples: JsonValue[], options: InferOptions = ALL_ON): void {
  const schema = inferSchema(samples, options);
  const validate = validator().compile(schema);
  for (const sample of samples) {
    const ok = validate(sample);
    expect(ok, `${JSON.stringify(sample)} vs ${JSON.stringify(schema)}: ${JSON.stringify(validate.errors)}`).toBe(true);
  }
}

describe('inferred schemas are valid 2020-12 and accept their own samples', () => {
  const cases: [string, JsonValue[]][] = [
    ['records', [{ id: 1, name: 'a', tags: ['x'] }, { id: 2, name: 'b', tags: [] }, { id: 3, name: 'c' }]],
    ['mixed types', [1, 'a', null, true, 1.5, [1], { a: 1 }]],
    ['formats', [
      { at: '2024-01-01T10:00:00Z', d: '2024-02-29', u: '123e4567-e89b-12d3-a456-426614174000', e: 'a@b.co', ip: '10.0.0.1', web: 'https://example.com/x?y=1' },
      { at: '2024-06-30T23:59:59.5+05:45', d: '2023-12-31', u: '00000000-0000-0000-0000-000000000000', e: 'x.y@z.example', ip: '255.255.255.255', web: 'mailto:a@b.co' },
    ]],
    ['enums', [{ s: 'open' }, { s: 'closed' }, { s: 'open' }, { s: 'open' }]],
    ['astral strings (code points vs UTF-16)', [{ s: '😀' }, { s: 'ab' }, { s: '😀😀😀' }]],
    ['impossible calendar dates are not claimed as date/date-time', [{ d: '2023-02-29', t: '2024-02-30T00:00:00Z' }, { d: '2024-04-31', t: '2024-13-01T00:00:00Z' }]],
    ['out-of-range times are not claimed as time', [{ t: '25:61:61' }, { t: '24:00:00' }]],
    ['times without offset', [{ t: '10:00:00' }, { t: '23:59:59' }]],
    ['ipv6-looking non-addresses', [{ ip: 'a:b:c' }, { ip: 'dead:beef:cafe' }, { ip: '1:2:3:4:5:6:7:8:9' }]],
    ['real ipv6', [{ ip: '::1' }, { ip: '2001:db8::8a2e:370:7334' }, { ip: 'fe80::1' }]],
    ['uri-ish strings', [{ u: 'a:b' }, { u: 'http://exa mple.com' }, { u: 'urn:isbn:0451450523' }]],
    ['__proto__ key', [JSON.parse('{"__proto__": 1, "a": 2}') as JsonValue, JSON.parse('{"__proto__": 3, "a": 4}') as JsonValue]],
    ['nested arrays of objects', [[{ a: [{ b: 1 }] }, { a: [] }], [{ a: [{ b: 2, c: 'x' }] }]]],
  ];

  for (const [name, samples] of cases) {
    // ajv itself rejects an own "__proto__" property under
    // additionalProperties:false even when it is listed in properties (an ajv
    // limitation, reproducible with a hand-written schema), so that one case
    // is checked with open objects.
    const allOptions = name === '__proto__ key' ? { ...ALL_ON, closedObjects: false } : ALL_ON;
    it(`${name} (all options)`, () => expectSound(samples, allOptions));
    it(`${name} (defaults)`, () => expectSound(samples, {}));
  }

  it('keeps a __proto__ property in the emitted schema', () => {
    const schema = inferSchema([JSON.parse('{"__proto__": 1}') as JsonValue]);
    expect(Object.prototype.hasOwnProperty.call(schema.properties, '__proto__')).toBe(true);
    expect(JSON.stringify(schema)).toContain('"__proto__"');
  });

  it('a randomised corpus is always sound', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pool: JsonValue[] = ['2024-01-01', '10:00:00Z', 'x', '😀', 'a@b.co', '::1', '1.2.3.4', 'https://e.x', 0, -1, 2.5, true, null, 'urn:x:y'];
    const gen = (depth: number): JsonValue => {
      const r = rand();
      if (depth > 3 || r < 0.5) return pool[Math.floor(rand() * pool.length)] ?? null;
      if (r < 0.75) return Array.from({ length: Math.floor(rand() * 4) }, () => gen(depth + 1));
      const obj: Record<string, JsonValue> = {};
      for (const k of ['a', 'b', 'c']) if (rand() < 0.6) obj[k] = gen(depth + 1);
      return obj;
    };
    for (let round = 0; round < 200; round++) {
      expectSound(Array.from({ length: 1 + Math.floor(rand() * 6) }, () => gen(0)));
    }
  });
});
