/**
 * schema-infer — infer a JSON Schema 2020-12 document from sample data.
 *
 * @packageDocumentation
 */

export { inferSchema, inferSchemaFromValue } from './infer.js';
export { matchingFormats, preferredFormat, FORMATS } from './formats.js';
export { parseSamples, ParseError } from './parse.js';
export { DEFAULT_DIALECT, resolveOptions } from './types.js';
export type {
  InferOptions,
  JsonType,
  JsonValue,
  ResolvedOptions,
  Schema,
} from './types.js';
