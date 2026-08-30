/**
 * Evidence accumulation.
 *
 * Inference happens in two stages. First every sample is folded into an
 * `Observation` tree that records what was actually seen; then the tree is
 * converted into a schema. Keeping them apart matters because a field's
 * optionality can only be decided once *all* samples have been read — a schema
 * built incrementally would have to be repeatedly rewritten.
 */

import { matchingFormats } from './formats.js';
import type { JsonType, JsonValue } from './types.js';

/** How many distinct primitive values to retain before giving up on enums. */
const MAX_TRACKED_VALUES = 64;

/** Accumulated evidence about one position in the document tree. */
export interface Observation {
  /** Every JSON type seen at this position. */
  types: Set<JsonType>;
  /** How many values were folded in here. */
  count: number;

  /** Per-key observations, for values seen as objects. */
  properties: Map<string, Observation>;
  /** How many objects contained each key — drives `required`. */
  propertyCounts: Map<string, number>;
  /** How many values at this position were objects. */
  objectCount: number;

  /** Merged observation of every array element seen here. */
  items?: Observation;
  minItems?: number;
  maxItems?: number;

  /**
   * Formats still consistent with every string seen. `undefined` until the
   * first string arrives; an empty set means no format survived.
   */
  formats?: Set<string>;
  minLength?: number;
  maxLength?: number;

  minimum?: number;
  maximum?: number;

  /** Distinct primitive values, abandoned past `MAX_TRACKED_VALUES`. */
  values: Set<string | number | boolean | null>;
  valuesOverflowed: boolean;
}

export function createObservation(): Observation {
  return {
    types: new Set(),
    count: 0,
    properties: new Map(),
    propertyCounts: new Map(),
    objectCount: 0,
    values: new Set(),
    valuesOverflowed: false,
  };
}

/** The JSON Schema type name for a runtime value. */
export function typeOf(value: JsonValue): JsonType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'boolean':
      return 'boolean';
    case 'string':
      return 'string';
    case 'number':
      // JSON has one number type; JSON Schema distinguishes integers, and the
      // distinction is worth keeping because it is often the useful constraint.
      return Number.isInteger(value) ? 'integer' : 'number';
    default:
      return 'object';
  }
}

function trackValue(
  observation: Observation,
  value: string | number | boolean | null,
): void {
  if (observation.valuesOverflowed) return;
  observation.values.add(value);
  if (observation.values.size > MAX_TRACKED_VALUES) {
    observation.valuesOverflowed = true;
    observation.values.clear();
  }
}

/** Fold one value into an observation. */
export function observe(observation: Observation, value: JsonValue): void {
  const type = typeOf(value);
  observation.types.add(type);
  observation.count += 1;

  switch (type) {
    case 'object': {
      const record = value as Record<string, JsonValue>;
      observation.objectCount += 1;
      for (const [key, child] of Object.entries(record)) {
        let childObservation = observation.properties.get(key);
        if (!childObservation) {
          childObservation = createObservation();
          observation.properties.set(key, childObservation);
        }
        observe(childObservation, child);
        observation.propertyCounts.set(
          key,
          (observation.propertyCounts.get(key) ?? 0) + 1,
        );
      }
      break;
    }

    case 'array': {
      const list = value as JsonValue[];
      observation.minItems =
        observation.minItems === undefined
          ? list.length
          : Math.min(observation.minItems, list.length);
      observation.maxItems =
        observation.maxItems === undefined
          ? list.length
          : Math.max(observation.maxItems, list.length);
      if (list.length > 0) {
        observation.items ??= createObservation();
        for (const element of list) observe(observation.items, element);
      }
      break;
    }

    case 'string': {
      const text = value as string;
      const matched = matchingFormats(text);
      // Intersect: a format survives only while every sample matches it.
      if (observation.formats === undefined) {
        observation.formats = matched;
      } else {
        for (const existing of observation.formats) {
          if (!matched.has(existing)) observation.formats.delete(existing);
        }
      }
      observation.minLength =
        observation.minLength === undefined
          ? text.length
          : Math.min(observation.minLength, text.length);
      observation.maxLength =
        observation.maxLength === undefined
          ? text.length
          : Math.max(observation.maxLength, text.length);
      trackValue(observation, text);
      break;
    }

    case 'integer':
    case 'number': {
      const num = value as number;
      observation.minimum =
        observation.minimum === undefined
          ? num
          : Math.min(observation.minimum, num);
      observation.maximum =
        observation.maximum === undefined
          ? num
          : Math.max(observation.maximum, num);
      trackValue(observation, num);
      break;
    }

    case 'boolean':
      trackValue(observation, value as boolean);
      break;

    case 'null':
      trackValue(observation, null);
      break;
  }
}
