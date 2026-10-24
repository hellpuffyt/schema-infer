# Production readiness — schema-infer

Audit of the `audit/production-readiness` branch. This document records evidence; it does not
award a production-ready label.

## Scope and architecture

Zero-runtime-dependency library + CLI that infers a JSON Schema 2020-12 document from JSON / NDJSON
samples: `parse.ts` (format detection, NDJSON), `observe.ts` (evidence tree), `infer.ts`
(types, required, enum guards, bounds), `formats.ts` (string formats), `cli.ts`.

## Platforms and prerequisites

Node.js >= 20 (Node 18, end-of-life, was dropped with the vitest 4 upgrade). Verified on macOS (Apple Silicon): full gate on Node 24.19.0, tests on Node 18 and
20. CI matrix per workflow on the default branch; Windows not run locally. Not published to npm.

## Clean-clone setup (README "Installation")

`git clone`, `npm ci && npm run build`, `npm link` (throwaway npm prefix): all exit 0; the linked
`schema-infer d.ndjson --no-dialect` produced a schema with `uuid`/`date-time` formats and the
correct `required`; 89 tests passed; lint/typecheck 0; tree clean. Baseline README told users to
`npm install schema-infer` — nothing is published under that name.

## Commands executed (CI-equivalent, local)

| Command | Baseline (main @ 8df5ce3) | Audit branch |
|---|---|---|
| `npm ci` | 0 | 0 |
| `npm test` | 0 — 60 passed, 0 failed, 0 skipped | 0 — 89 passed, 0 failed, 0 skipped (Node 24, 18, 20) |
| `npm run lint` / `typecheck` / `build` | 0 / 0 / 0 | 0 / 0 / 0 |
| `npm run coverage` (lines / branches) | 95.59 % / 91.79 % | 97.33 % / 95.13 % |
| CI smoke script (built CLI) | — | pass |
| `npm audit --omit=dev` | 0 | 0 |
| `npm audit` (dev) | 9 (3 critical, 3 high, 3 moderate) | 7 (3 critical, 1 high, 3 moderate) — vitest 2 chain, semver-major fix |

## Validation against a real validator

`tests/validator.test.ts` compiles every inferred schema with **ajv's JSON Schema 2020-12
validator in strict mode** (`allowUnionTypes`, since `type` arrays are valid 2020-12) plus
`ajv-formats`, then validates every input sample against it — on 13 hand-picked corpora with all
options on and with defaults, and on 200 random corpora. On the baseline source 15 of the 28 tests
failed.

## Bugs fixed

| Bug | Effect | Fix |
|---|---|---|
| `Date.parse` used to validate dates | `2023-02-29`, `2024-13-01T..` got `format: date/date-time`; the samples then failed their own schema | explicit calendar check |
| `time` accepted no offset and `25:61:61` | samples failed `format: time` | RFC 3339 full-time with offset |
| Loose ipv6 regex | `a:b:c` got `format: ipv6` | `node:net` `isIPv6` (no zone ids) |
| UTF-16 lengths | `"😀"` -> `minLength: 2`, sample rejected | code-point lengths |
| `properties[key] = ...` with `__proto__` | prototype replaced, invalid schema | `Object.defineProperty` |
| Deep nesting | CLI stack trace | error message, exit 1 |

Known validator limitation (not a schema-infer bug): ajv rejects an own `__proto__` property under
`additionalProperties: false` even when it is declared in `properties`; reproduced with a
hand-written schema and documented in the test.

## Security review

| Area | Finding | Severity | Status |
|---|---|---|---|
| Prototype handling | `__proto__` key corrupted the emitted `properties` | Low | Fixed |
| Resource use | value tracking capped at 64 per position (existing); deep nesting handled | Low | Fixed / verified |
| Code execution | `JSON.parse` only, no eval, no network | Info | Reviewed |
| Supply chain (docs) | README install of an unpublished name | Low | Fixed |
| Workflow permissions | `permissions:` already declared | Info | none |
| Secrets in tree/history | 1 commit, no hits | Info | none |

## Acceptance checklist

| Item | Expected | Test | Result |
|---|---|---|---|
| Valid 2020-12 output | compiles under ajv 2020 strict | `tests/validator.test.ts` | pass |
| Soundness | every sample validates | `tests/validator.test.ts` (incl. 200 random corpora) | pass |
| JSON / NDJSON detection | pretty JSON not treated as NDJSON | `tests/parse.test.ts` | pass |
| Honest optionality / enums | required = present everywhere; enum guards | `tests/infer.test.ts` | pass |
| CLI options and exit codes | as documented | `tests/cli.test.ts`, smoke | pass |

## CI status

Default branch (`main` @ 8df5ce3): last run `success`. Audit branch: pending until pushed.

## Limitations

Format detection is deliberately strict (some valid-but-unusual values get no format); `uri` uses
`new URL` and was consistent with ajv-formats on every tested corpus but is not a full RFC 3986
parser; inference is in-memory.

## Tested commit

`110623e15331d9dbe0cffa3f7e27f8255564ec17` (clean clone), 2026-10-22.

## Classification proposal

**Partially Verified** — documented scope verified locally (Node 18/20/24) and from a clean clone,
including soundness against a real 2020-12 validator; audit-branch CI not yet run.
