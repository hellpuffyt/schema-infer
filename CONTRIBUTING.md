# Contributing

## Getting set up

```bash
git clone https://github.com/hellpuffyt/schema-infer
cd schema-infer
npm install
npm test
```

## Before opening a pull request

CI runs exactly these:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run coverage
```

## The design rule

**Claim only what the evidence supports.** A schema that is too loose costs a
reviewer a minute; a schema that is too tight rejects valid production data at
three in the morning. Every inference rule here is biased accordingly.

Concretely, when adding or changing a rule:

1. It goes in `infer.ts` if it is a judgement, or `observe.ts` if it is
   evidence gathering. Do not mix the two — optionality can only be decided
   after every sample has been read, and that separation is what keeps it
   correct.
2. Any new claim needs a **withdrawal test**: a case proving the rule backs off
   when the evidence contradicts it. The `format` and `enum` rules each have
   several, and they are the most valuable tests in the suite.
3. Anything that could produce a false positive on real data should be opt-in,
   like `enumThreshold` and `inferBounds`.

## Adding a format

Add it to `FORMATS` in `formats.ts`, in priority order — earlier entries win
when several match. Prefer a strict pattern: a false `format` causes valid data
to be rejected later, which is worse than emitting no format at all.

Add tests for a matching value, a near-miss that must not match, and a mixed
sample that must withdraw the claim.

## Reporting a bug

Include the sample input and the schema you expected. A failing input is worth
more than a description — most bugs here are edge cases in real-world data.
