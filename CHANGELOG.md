# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
