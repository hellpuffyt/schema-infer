import { describe, expect, it } from 'vitest';

import { inferSchema, inferSchemaFromValue } from '../src/infer.js';
import { DEFAULT_DIALECT } from '../src/types.js';

/** Infer without the `$schema` key, which would otherwise noise up every assertion. */
const infer = (samples: unknown[], options = {}) =>
  inferSchema(samples as never, { dialect: null, ...options });

describe('primitives', () => {
  it('infers each scalar type', () => {
    expect(infer(['x'])).toEqual({ type: 'string' });
    expect(infer([true])).toEqual({ type: 'boolean' });
    expect(infer([null])).toEqual({ type: 'null' });
  });

  it('distinguishes integer from number', () => {
    expect(infer([1])).toEqual({ type: 'integer' });
    expect(infer([1.5])).toEqual({ type: 'number' });
  });

  it('collapses integer into number when both appear', () => {
    // `integer` is a subset of `number`; declaring both is redundant.
    expect(infer([1, 2.5])).toEqual({ type: 'number' });
  });

  it('emits a type union in canonical order regardless of input order', () => {
    expect(infer(['a', null])).toEqual({ type: ['null', 'string'] });
    expect(infer([null, 'a'])).toEqual({ type: ['null', 'string'] });
  });
});

describe('objects', () => {
  it('infers properties', () => {
    expect(infer([{ id: 1, name: 'a' }])).toEqual({
      type: 'object',
      properties: { id: { type: 'integer' }, name: { type: 'string' } },
      required: ['id', 'name'],
    });
  });

  it('marks a key absent from some samples as optional', () => {
    const schema = infer([{ id: 1, nickname: 'x' }, { id: 2 }]);
    expect(schema.required).toEqual(['id']);
    expect(schema.properties?.nickname).toEqual({ type: 'string' });
  });

  it('sorts properties and required for stable output', () => {
    const schema = infer([{ zebra: 1, apple: 2, mango: 3 }]);
    expect(Object.keys(schema.properties ?? {})).toEqual(['apple', 'mango', 'zebra']);
    expect(schema.required).toEqual(['apple', 'mango', 'zebra']);
  });

  it('recurses into nested objects', () => {
    const schema = infer([{ user: { id: 1 } }]);
    expect(schema.properties?.user).toEqual({
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
    });
  });

  it('omits required entirely when no key is universal', () => {
    const schema = infer([{ a: 1 }, { b: 2 }]);
    expect(schema.required).toBeUndefined();
  });

  it('adds additionalProperties only when asked', () => {
    expect(infer([{ a: 1 }]).additionalProperties).toBeUndefined();
    expect(infer([{ a: 1 }], { closedObjects: true }).additionalProperties).toBe(false);
  });
});

describe('arrays', () => {
  it('infers a homogeneous item schema', () => {
    expect(infer([[1, 2, 3]], { })).toEqual({
      type: 'array',
      items: { type: 'integer' },
    });
  });

  it('unions heterogeneous item types', () => {
    expect(infer([[1, 'a']])).toEqual({
      type: 'array',
      items: { type: ['integer', 'string'] },
    });
  });

  it('omits items for an always-empty array', () => {
    expect(infer([[]])).toEqual({ type: 'array' });
  });

  it('merges item evidence across separate arrays', () => {
    const schema = infer([[{ a: 1 }], [{ a: 2, b: 3 }]]);
    expect(schema.items?.required).toEqual(['a']);
    expect(Object.keys(schema.items?.properties ?? {})).toEqual(['a', 'b']);
  });
});

describe('formats', () => {
  it('detects a format when every sample matches', () => {
    expect(infer(['2024-01-01T00:00:00Z']).format).toBe('date-time');
    expect(infer(['a@b.com']).format).toBe('email');
    expect(infer(['550e8400-e29b-41d4-a716-446655440000']).format).toBe('uuid');
  });

  it('withdraws the format when one sample disagrees', () => {
    // This is the property that makes format detection safe to trust.
    expect(infer(['a@b.com', 'not-an-email']).format).toBeUndefined();
  });

  it('can be disabled', () => {
    expect(infer(['a@b.com'], { detectFormats: false }).format).toBeUndefined();
  });

  it('prefers the more specific format when several match', () => {
    expect(infer(['2024-01-01']).format).toBe('date');
  });
});

describe('enums', () => {
  it('is off by default', () => {
    expect(infer(['a', 'b']).enum).toBeUndefined();
  });

  it('collapses to an enum under the threshold', () => {
    const schema = infer(['red', 'green', 'red'], { enumThreshold: 5 });
    expect(schema.enum).toEqual(['green', 'red']);
    // `enum` fully constrains the value space, so `type` would be redundant.
    expect(schema.type).toBeUndefined();
  });

  it('does not collapse above the threshold', () => {
    expect(infer(['a', 'b', 'c'], { enumThreshold: 2 }).enum).toBeUndefined();
  });

  it('needs more than two samples', () => {
    // Any two-row sample makes every field look like a two-value category.
    expect(infer(['red', 'green'], { enumThreshold: 5 }).enum).toBeUndefined();
  });

  it('needs a repeated value, so identifiers are not enums', () => {
    // All-distinct values are the signature of an id, not a category.
    expect(infer(['a', 'b', 'c', 'd'], { enumThreshold: 10 }).enum).toBeUndefined();
  });

  it('never turns a formatted field into an enum', () => {
    const emails = ['a@b.com', 'c@d.com', 'a@b.com', 'a@b.com'];
    const schema = infer(emails, { enumThreshold: 10 });
    expect(schema.enum).toBeUndefined();
    expect(schema.format).toBe('email');
  });

  it('still collapses a real category with repetition', () => {
    const roles = ['admin', 'user', 'user', 'admin', 'user'];
    expect(infer(roles, { enumThreshold: 5 }).enum).toEqual(['admin', 'user']);
  });

  it('never collapses objects or arrays', () => {
    expect(infer([{ a: 1 }], { enumThreshold: 10 }).enum).toBeUndefined();
    expect(infer([[1]], { enumThreshold: 10 }).enum).toBeUndefined();
  });

  it('gives up past the tracking ceiling', () => {
    const many = Array.from({ length: 200 }, (_, index) => `value-${index}`);
    expect(infer(many, { enumThreshold: 500 }).enum).toBeUndefined();
  });
});

describe('bounds', () => {
  it('are omitted by default', () => {
    const schema = infer([1, 10]);
    expect(schema.minimum).toBeUndefined();
    expect(schema.maximum).toBeUndefined();
  });

  it('are emitted on request', () => {
    expect(infer([1, 10], { inferBounds: true })).toMatchObject({
      minimum: 1,
      maximum: 10,
    });
  });

  it('cover string length and array length', () => {
    expect(infer(['a', 'abc'], { inferBounds: true })).toMatchObject({
      minLength: 1,
      maxLength: 3,
    });
    expect(infer([[1], [1, 2]], { inferBounds: true })).toMatchObject({
      minItems: 1,
      maxItems: 2,
    });
  });
});

describe('dialect', () => {
  it('emits $schema first by default', () => {
    const schema = inferSchema(['x']);
    expect(Object.keys(schema)[0]).toBe('$schema');
    expect(schema.$schema).toBe(DEFAULT_DIALECT);
  });

  it('can be omitted', () => {
    expect(inferSchema(['x'], { dialect: null }).$schema).toBeUndefined();
  });
});

describe('inferSchemaFromValue', () => {
  it('describes the array itself rather than its elements', () => {
    expect(inferSchemaFromValue([1, 2], { dialect: null })).toEqual({
      type: 'array',
      items: { type: 'integer' },
    });
  });
});

describe('a realistic mixed sample', () => {
  it('produces the schema a reviewer would write by hand', () => {
    const schema = infer([
      { id: '550e8400-e29b-41d4-a716-446655440000', email: 'a@b.com', age: 30, tags: ['x'] },
      { id: '650e8400-e29b-41d4-a716-446655440000', email: 'c@d.com', tags: [] },
    ]);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        age: { type: 'integer' },
        email: { type: 'string', format: 'email' },
        id: { type: 'string', format: 'uuid' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['email', 'id', 'tags'],
    });
  });
});
