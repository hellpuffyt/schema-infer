/**
 * The subset of JSON Schema 2020-12 this package emits.
 *
 * Deliberately narrow: inference can only ever justify the keywords it has
 * evidence for, so there is no point modelling the whole specification.
 */

/** The seven JSON Schema primitive type names. */
export type JsonType =
  | 'null'
  | 'boolean'
  | 'integer'
  | 'number'
  | 'string'
  | 'array'
  | 'object';

/** Any value that can appear in a JSON document. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** An inferred schema node. */
export interface Schema {
  type?: JsonType | JsonType[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: (string | number | boolean | null)[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  $schema?: string;
  title?: string;
  description?: string;
  examples?: JsonValue[];
}

/** Options controlling how aggressively the inferrer generalises. */
export interface InferOptions {
  /**
   * Emit `format` for strings whose every observed sample matches one
   * recognised format. Default `true`.
   */
  detectFormats?: boolean;
  /**
   * Collapse a string or number field into an `enum` when it has at most this
   * many distinct values across all samples. `0` disables enum inference.
   * Default `0` — enums are a strong claim and are opt-in.
   */
  enumThreshold?: number;
  /**
   * Emit `minimum`/`maximum` for numbers and `minLength`/`maxLength` for
   * strings, from observed bounds. Default `false`; observed bounds are a
   * property of the sample, not of the data model.
   */
  inferBounds?: boolean;
  /**
   * Set `additionalProperties: false` on inferred objects. Default `false`.
   */
  closedObjects?: boolean;
  /** Value of the emitted `$schema` keyword. Set `null` to omit it. */
  dialect?: string | null;
}

/** Options with every default resolved. */
export type ResolvedOptions = Required<Omit<InferOptions, 'dialect'>> & {
  dialect: string | null;
};

export const DEFAULT_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

export function resolveOptions(options: InferOptions = {}): ResolvedOptions {
  return {
    detectFormats: options.detectFormats ?? true,
    enumThreshold: options.enumThreshold ?? 0,
    inferBounds: options.inferBounds ?? false,
    closedObjects: options.closedObjects ?? false,
    dialect: options.dialect === undefined ? DEFAULT_DIALECT : options.dialect,
  };
}
