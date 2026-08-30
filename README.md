# schema-infer

Infer a JSON Schema 2020-12 document from sample JSON or NDJSON — conservatively
enough that you can trust the result.

[![CI](https://github.com/hellpuffyt/schema-infer/actions/workflows/ci.yml/badge.svg)](https://github.com/hellpuffyt/schema-infer/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/schema-infer)](https://www.npmjs.com/package/schema-infer)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## What is it?

Point it at real data and it writes the schema you would have written by hand.

```console
$ cat orders.ndjson
{"id":"550e8400-...","email":"a@b.com","status":"paid","total":19.99,"tags":["x"]}
{"id":"650e8400-...","email":"c@d.com","status":"pending","total":5,"tags":[]}
{"id":"750e8400-...","email":"e@f.com","status":"paid","total":42.5,"note":"gift"}

$ schema-infer --enum 5 orders.ndjson
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "email":  { "type": "string", "format": "email" },
    "id":     { "type": "string", "format": "uuid" },
    "note":   { "type": "string" },
    "status": { "enum": ["paid", "pending"] },
    "tags":   { "type": "array", "items": { "type": "string" } },
    "total":  { "type": "number" }
  },
  "required": ["email", "id", "status", "tags"]
}
```

Note what it got right without being told: `note` is optional because one record
lacked it, `total` widened to `number` because `5` and `42.5` were both present,
`status` became an enum but `id` and `email` did not, and `tags` kept its item
type even though one sample was empty.

## Why does it exist?

Writing a JSON Schema for an API you did not design is tedious and error-prone.
Most generators make it worse by being credulous — they will happily tell you a
field is an enum of two values because your sample had two rows, or that a
string is `format: email` because the first one looked like an address.

A schema that is wrong in that direction is actively harmful: it rejects valid
production data. This tool is built around the opposite bias — **claim only what
the evidence supports**:

- A `format` survives only while **every** observed string matches it. One
  counter-example withdraws the claim.
- `required` means a key was present in **every** object seen at that position.
- An `enum` needs three or more samples, a repeated value, and no surviving
  string format — so identifiers and timestamps never become closed sets.
- `minimum`/`maxLength`/`minItems` are **off by default**, because observed
  bounds describe your sample, not your data model.

## Features

- **JSON and NDJSON**, auto-detected. Pretty-printed multi-line JSON is
  correctly *not* treated as NDJSON.
- **Type unions** in canonical order, so output is byte-stable regardless of
  input order.
- **`integer` vs `number`**, collapsing to `number` when both appear.
- **Nine string formats**: `date-time`, `date`, `time`, `uuid`, `email`,
  `ipv4`, `ipv6`, `uri`.
- **Optionality** derived from presence counts across all samples.
- **Recursive** through nested objects and arrays, merging element evidence
  across separate arrays.
- **Library and CLI**, fully typed, no runtime dependencies.

## Architecture

Inference runs in two stages, which is the design decision the rest follows
from:

```
samples ──▶ observe.ts ──▶ Observation tree ──▶ infer.ts ──▶ Schema
              (evidence)                          (judgement)
```

`observe.ts` folds every sample into a tree that records *what was seen*: type
counts, per-key presence counts, surviving format candidates, observed bounds.
`infer.ts` then converts that tree into a schema in one pass.

They are separate because optionality cannot be decided until all samples have
been read. A generator that builds the schema incrementally has to keep
rewriting `required` as it goes, and that is where such tools usually get it
wrong.

| Module | Responsibility |
| --- | --- |
| `observe.ts` | Accumulate evidence. No judgements. |
| `infer.ts` | Turn evidence into a schema. No I/O. |
| `formats.ts` | Format patterns and priority. Pure predicates. |
| `parse.ts` | Read JSON/NDJSON text into samples. |
| `cli.ts` | Argument parsing and wiring. |

## Installation

```bash
npm install schema-infer      # library
npm install -g schema-infer   # CLI
npx schema-infer data.json    # no install
```

Requires Node 18 or newer.

## Usage

### CLI

```bash
schema-infer data.json                     # a single document
schema-infer events.ndjson                 # one document per line
cat data.json | schema-infer               # stdin
schema-infer a.ndjson b.ndjson             # merge several files
schema-infer --enum 8 --closed data.json   # enums plus additionalProperties:false
schema-infer --bounds data.json            # include observed min/max
schema-infer --title User data.json        # add a title
```

| Option | Description |
| --- | --- |
| `-f`, `--format <json\|ndjson\|auto>` | How to read the input (default `auto`) |
| `-t`, `--title <text>` | Set the schema title |
| `-d`, `--description <text>` | Set the schema description |
| `--enum <n>` | Collapse to `enum` at ≤ n distinct values |
| `--bounds` | Emit `minimum`/`maximum`, `minLength`/`maxLength`, `minItems`/`maxItems` |
| `--closed` | Set `additionalProperties: false` |
| `--no-formats` | Disable string format detection |
| `--no-dialect` | Omit the `$schema` keyword |
| `--no-unwrap` | Treat a top-level array as one sample, not many |
| `-i`, `--indent <n>` | Output indent (default `2`) |

Exit codes: `0` success, `1` error, `2` usage error.

### Library

```ts
import { inferSchema } from 'schema-infer';

const schema = inferSchema([
  { id: 1, name: 'Ada' },
  { id: 2 },
]);
// → properties id and name; required: ['id']
```

```ts
import { inferSchema, parseSamples } from 'schema-infer';
import { readFileSync } from 'node:fs';

const samples = parseSamples(readFileSync('events.ndjson', 'utf8'));
const schema = inferSchema(samples, { enumThreshold: 8, closedObjects: true });
```

## API

### `inferSchema(samples: JsonValue[], options?: InferOptions): Schema`

Infers a schema from many samples. Each sample is treated as a separate document
**at the same position** — so passing an array of records infers the schema *of
a record*. To describe the array itself, use `inferSchemaFromValue`.

### `inferSchemaFromValue(sample: JsonValue, options?: InferOptions): Schema`

Infers a schema describing one value, arrays included.

### `InferOptions`

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `detectFormats` | `boolean` | `true` | Emit `format` when every sample agrees |
| `enumThreshold` | `number` | `0` | Collapse to `enum` at ≤ n distinct values; `0` disables |
| `inferBounds` | `boolean` | `false` | Emit observed numeric/length/item bounds |
| `closedObjects` | `boolean` | `false` | Set `additionalProperties: false` |
| `dialect` | `string \| null` | 2020-12 | `$schema` value; `null` omits it |

### `parseSamples(text, format?, unwrapArray?): JsonValue[]`

Parses JSON or NDJSON. Throws `ParseError`, which carries the offending `line`
for NDJSON input.

## Examples

**Optionality is evidence-based.** A key present in some records but not others
is inferred, but not required:

```ts
inferSchema([{ a: 1, b: 2 }, { a: 3 }], { dialect: null });
// { type: 'object', properties: { a: {...}, b: {...} }, required: ['a'] }
```

**Formats are withdrawn on contradiction:**

```ts
inferSchema(['a@b.com'], { dialect: null });               // format: 'email'
inferSchema(['a@b.com', 'nope'], { dialect: null });       // no format
```

**Enums need a closed set, not a small sample:**

```ts
inferSchema(['red', 'green'], { enumThreshold: 5 });               // no enum: only 2 samples
inferSchema(['a', 'b', 'c', 'd'], { enumThreshold: 9 });           // no enum: all distinct
inferSchema(['on', 'off', 'on', 'off'], { enumThreshold: 5 });     // enum: ['off', 'on']
```

## Configuration

There is no config file. Every knob is a flag or an option object, so a result
is always reproducible from the invocation alone.

## Testing

```bash
npm test          # 60 tests
npm run coverage
npm run lint
npm run typecheck
npm run build
```

CI runs the suite on Node 18, 20 and 22 across Linux, macOS and Windows, plus a
smoke job that executes the built CLI — because a build that type-checks but
cannot run is not a working release.

## Deployment

Publishing to npm:

```bash
npm run build
npm publish
```

`prepublishOnly` runs the build, and `files` limits the published tarball to
`dist`, the README, the licence and the changelog.

## Security

- **No runtime dependencies**, so the install surface is this package alone.
- **No network access and no `eval`.** Input is parsed with `JSON.parse`.
- Inference is **memory-bounded**: distinct-value tracking stops at 64 values
  per position, so a large or hostile file cannot make it retain everything.
- The tool reads data you point it at and writes a schema to stdout. It never
  writes to your input files.

## Roadmap

- `$defs` extraction for structures repeated across the tree.
- `oneOf` for tagged unions detected by a discriminator key.
- Merging into an existing schema rather than always generating fresh.

## License

MIT — see [LICENSE](LICENSE).
