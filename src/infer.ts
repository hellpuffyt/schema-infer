/**
 * Turning accumulated evidence into a JSON Schema.
 */

import { preferredFormat } from './formats.js';
import { createObservation, observe, type Observation } from './observe.js';
import {
  resolveOptions,
  type InferOptions,
  type JsonType,
  type JsonValue,
  type ResolvedOptions,
  type Schema,
} from './types.js';

/**
 * Fewest observations that can justify an `enum`.
 *
 * Two rows are never enough: any two-row sample makes every field look like a
 * two-value category.
 */
const MIN_ENUM_SAMPLES = 3;

/** Canonical ordering, so output is stable regardless of input order. */
const TYPE_ORDER: JsonType[] = [
  'null',
  'boolean',
  'integer',
  'number',
  'string',
  'array',
  'object',
];

function orderTypes(types: Set<JsonType>): JsonType[] {
  const ordered = TYPE_ORDER.filter((type) => types.has(type));
  // `integer` is a subset of `number`; declaring both is redundant and some
  // validators treat the pair as suspicious.
  if (ordered.includes('number') && ordered.includes('integer')) {
    return ordered.filter((type) => type !== 'integer');
  }
  return ordered;
}

function sortValues(
  values: Set<string | number | boolean | null>,
): (string | number | boolean | null)[] {
  return [...values].sort((a, b) => {
    if (a === null) return b === null ? 0 : -1;
    if (b === null) return 1;
    if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0;
    return typeof a < typeof b ? -1 : 1;
  });
}

function toSchema(observation: Observation, options: ResolvedOptions): Schema {
  const schema: Schema = {};
  const types = orderTypes(observation.types);

  if (types.length === 1) schema.type = types[0];
  else if (types.length > 1) schema.type = types;

  // An enum is a claim that no other value is ever legal, so it needs evidence
  // of a genuinely closed set — not merely a small sample. Three guards:
  //
  //   * at least MIN_ENUM_SAMPLES observations, so two rows cannot decide it;
  //   * at least one repeated value, since all-distinct values are the
  //     signature of an identifier, not a category;
  //   * no surviving string format, because a field of UUIDs or timestamps is
  //     an identifier space even when the sample happens to repeat.
  //
  // Without these, `--enum` turns every id and email in a short sample into a
  // closed set, which is worse than emitting nothing.
  const distinct = observation.values.size;
  const hasRepetition = distinct < observation.count;
  const hasFormat =
    options.detectFormats && observation.formats !== undefined && observation.formats.size > 0;

  if (
    options.enumThreshold > 0 &&
    !observation.valuesOverflowed &&
    distinct > 0 &&
    distinct <= options.enumThreshold &&
    observation.count >= MIN_ENUM_SAMPLES &&
    hasRepetition &&
    !hasFormat &&
    !observation.types.has('object') &&
    !observation.types.has('array')
  ) {
    schema.enum = sortValues(observation.values);
    // `enum` already constrains the value space; `type` adds nothing.
    delete schema.type;
    return schema;
  }

  if (observation.types.has('object')) {
    const properties: Record<string, Schema> = {};
    const required: string[] = [];
    for (const key of [...observation.properties.keys()].sort()) {
      const child = observation.properties.get(key);
      /* c8 ignore next */
      if (!child) continue;
      properties[key] = toSchema(child, options);
      // Required means "present in every object seen at this position".
      if (observation.propertyCounts.get(key) === observation.objectCount) {
        required.push(key);
      }
    }
    if (Object.keys(properties).length > 0) schema.properties = properties;
    if (required.length > 0) schema.required = required;
    if (options.closedObjects) schema.additionalProperties = false;
  }

  if (observation.types.has('array')) {
    if (observation.items) schema.items = toSchema(observation.items, options);
    if (options.inferBounds) {
      if (observation.minItems !== undefined) schema.minItems = observation.minItems;
      if (observation.maxItems !== undefined) schema.maxItems = observation.maxItems;
    }
  }

  if (observation.types.has('string')) {
    if (options.detectFormats && observation.formats && observation.formats.size > 0) {
      const format = preferredFormat(observation.formats);
      if (format) schema.format = format;
    }
    if (options.inferBounds) {
      if (observation.minLength !== undefined) schema.minLength = observation.minLength;
      if (observation.maxLength !== undefined) schema.maxLength = observation.maxLength;
    }
  }

  if (
    options.inferBounds &&
    (observation.types.has('integer') || observation.types.has('number'))
  ) {
    if (observation.minimum !== undefined) schema.minimum = observation.minimum;
    if (observation.maximum !== undefined) schema.maximum = observation.maximum;
  }

  return schema;
}

/**
 * Infer a JSON Schema from one or more sample values.
 *
 * Every sample is treated as a separate document at the same position, so
 * passing an array of records infers the schema *of a record*, not of the
 * array. To describe the array itself, pass it as a single sample.
 */
export function inferSchema(
  samples: JsonValue[],
  options: InferOptions = {},
): Schema {
  const resolved = resolveOptions(options);
  const root = createObservation();
  for (const sample of samples) observe(root, sample);

  const schema = toSchema(root, resolved);
  if (resolved.dialect !== null) {
    // `$schema` belongs first in the emitted object.
    return { $schema: resolved.dialect, ...schema };
  }
  return schema;
}

/** Infer a schema from a single value. */
export function inferSchemaFromValue(
  sample: JsonValue,
  options: InferOptions = {},
): Schema {
  return inferSchema([sample], options);
}
