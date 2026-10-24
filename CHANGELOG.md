# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Node.js 20 or newer is now required** (`engines.node` is `>=20`). Node 18
  reached end-of-life on 2025-04-30 and has been dropped from the CI matrix.
- Dev tooling: `vitest` and `@vitest/coverage-v8` 4.1, which clears the
  dev-only critical/high advisories in the vitest 1/2 chain (`tinypool`,
  `@vitest/mocker`, `vite-node`, ...). `npm audit` now reports 0 vulnerabilities.
  No runtime dependency or published behaviour changed.

### Fixed

Every inferred schema is now checked against ajv's JSON Schema 2020-12
validator (strict mode) with its own samples (`tests/validator.test.ts`).
That found samples rejected by the schemas inferred from them:

- `date`/`date-time` were claimed for impossible dates (`2023-02-29`,
  `2024-13-01T...`) because `Date.parse` rolls them over.
- `time` was claimed for values without an offset and with out-of-range fields;
  JSON Schema `time` requires the RFC 3339 offset.
- `ipv6` was claimed for strings like `a:b:c`; a real parser is now used.
- `minLength`/`maxLength` counted UTF-16 units; JSON Schema counts code points,
  so `"😀"` produced `minLength: 2` and failed validation.
- A `__proto__` key replaced the prototype of `properties` instead of becoming a
  property, which produced an invalid schema.
- Deeply nested input crashed the CLI with a stack trace; it is now an error
  message (exit 1).

### Documentation

- README: not on npm (install from a clone); format list said "nine" for eight.

## [0.1.0] - 2026-08-30

First release.

### Added

- `inferSchema` and `inferSchemaFromValue`, producing JSON Schema 2020-12.
- Two-stage inference: evidence accumulation (`observe.ts`) separated from
  schema construction (`infer.ts`), so optionality is decided once every sample
  has been read rather than rewritten incrementally.
- Type unions in canonical order, with `integer` collapsed into `number` when
  both are observed.
- String format detection for `date-time`, `date`, `time`, `uuid`, `email`,
  `ipv4`, `ipv6` and `uri`. A format is claimed only while every observed
  sample matches it.
- `required` derived from per-key presence counts across all samples.
- Opt-in `enum` inference, guarded by three conditions — at least three
  samples, at least one repeated value, and no surviving string format — so
  identifiers and timestamps are never collapsed into closed sets.
- Opt-in bounds (`minimum`, `maximum`, `minLength`, `maxLength`, `minItems`,
  `maxItems`), off by default because observed bounds describe the sample
  rather than the data model.
- `parseSamples` reading JSON and NDJSON with auto-detection that correctly
  distinguishes pretty-printed JSON from newline-delimited JSON.
- `ParseError` carrying the offending line number for NDJSON input.
- CLI over stdin or any number of files, with `--enum`, `--bounds`, `--closed`,
  `--no-formats`, `--no-dialect`, `--no-unwrap`, `--title`, `--description`,
  `--indent`, and exit codes suitable for scripting.

[0.1.0]: https://github.com/hellpuffyt/schema-infer/releases/tag/v0.1.0
