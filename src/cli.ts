/**
 * Command-line entry point.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { inferSchema } from './infer.js';
import { ParseError, parseSamples, type InputFormat } from './parse.js';
import type { InferOptions } from './types.js';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

const USAGE = `schema-infer — infer a JSON Schema 2020-12 document from sample data

Usage:
  schema-infer [options] [file...]
  cat samples.ndjson | schema-infer

Options:
  -f, --format <json|ndjson|auto>  how to read the input (default: auto)
  -t, --title <text>               set the schema title
  -d, --description <text>         set the schema description
      --enum <n>                   collapse to enum at <= n distinct values
      --bounds                     emit min/max and minLength/maxLength
      --closed                     set additionalProperties: false
      --no-formats                 do not detect string formats
      --no-dialect                 omit the $schema keyword
      --no-unwrap                  treat a top-level array as one sample
  -i, --indent <n>                 output indent (default: 2)
  -h, --help                       show this help
  -v, --version                    show the version

Exit codes: 0 success, 1 error, 2 usage error.`;

/** Read every input file, or stdin when no file is given. */
function readInput(files: string[]): string {
  if (files.length > 0) {
    return files.map((file) => readFileSync(file, 'utf8')).join('\n');
  }
  return readFileSync(0, 'utf8');
}

export function main(argv: string[] = process.argv.slice(2)): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: 'string', short: 'f', default: 'auto' },
        title: { type: 'string', short: 't' },
        description: { type: 'string', short: 'd' },
        enum: { type: 'string' },
        bounds: { type: 'boolean', default: false },
        closed: { type: 'boolean', default: false },
        // node:util parseArgs has no automatic `--no-x` negation, so each
        // negated switch is declared in its own right.
        'no-formats': { type: 'boolean', default: false },
        'no-dialect': { type: 'boolean', default: false },
        'no-unwrap': { type: 'boolean', default: false },
        indent: { type: 'string', short: 'i', default: '2' },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT_OK;
  }
  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return EXIT_OK;
  }

  if (!['json', 'ndjson', 'auto'].includes(values.format)) {
    process.stderr.write(`unknown format: ${values.format}\n`);
    return EXIT_USAGE;
  }

  const enumThreshold = values.enum === undefined ? 0 : Number(values.enum);
  if (!Number.isFinite(enumThreshold) || enumThreshold < 0) {
    process.stderr.write(`--enum needs a non-negative number\n`);
    return EXIT_USAGE;
  }

  const indent = Number(values.indent);
  if (!Number.isInteger(indent) || indent < 0) {
    process.stderr.write(`--indent needs a non-negative integer\n`);
    return EXIT_USAGE;
  }

  let text: string;
  try {
    text = readInput(positionals);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return EXIT_ERROR;
  }

  const options: InferOptions = {
    detectFormats: !(values['no-formats']),
    enumThreshold,
    inferBounds: values.bounds,
    closedObjects: values.closed,
    dialect: values['no-dialect'] ? null : undefined,
  };

  try {
    const samples = parseSamples(
      text,
      values.format as InputFormat,
      !(values['no-unwrap']),
    );
    const schema = inferSchema(samples, options);
    if (values.title) schema.title = values.title;
    if (values.description) schema.description = values.description;
    process.stdout.write(`${JSON.stringify(schema, null, indent)}\n`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof ParseError) {
      process.stderr.write(`${error.message}\n`);
      return EXIT_ERROR;
    }
    throw error;
  }
}

/** Kept in step with package.json by a test. */
export const VERSION = '0.1.0';
