# Examples

All examples are TypeScript modules that can be executed with Deno 2+
(`deno run -A …`). They adhere to the light functional style: no decorators, no
classes – just data and functions. Each step is declared via
`defineStep<Base>()` so `meta` literals stay inferred without manual type
plumbing.

## Quick Start

- `examples/deno/api.ts` – end-to-end pipeline showing DB + KV + tempDir with
  retry/timeout/log. Run `deno run -A examples/deno/api.ts`.

## Scenario Guides

### Core Examples

- `examples/advanced/multi-resource.ts` – nested brackets that coordinate
  `lease.lock`, `lease.db`, and `lease.tempDir` simultaneously, showcasing
  resource composition and manual finalisers. Run
  `deno run -A examples/advanced/multi-resource.ts`.
- `examples/advanced/policy-combo.ts` – demonstrates retry + timeout + circuit
  breaker + idempotency working together, including explicit error-handling
  branches and macro short-circuiting. Run
  `deno run -A examples/advanced/policy-combo.ts`.
- `examples/testing/with-fakes.test.ts` – Deno test using `@macrofx/testing`
  fakes to assert logs without touching real hosts. Run
  `deno test -A examples/testing/with-fakes.test.ts`.

### Composition Examples (New)

- `examples/composition/pipeline.ts` – Sequential pipeline using `pipe()` to
  chain `fetchUser → enrichProfile → cacheResult`. Run
  `deno run -A examples/composition/pipeline.ts`.
- `examples/composition/parallel.ts` – Parallel execution with `allSteps()` to
  fetch user data, orders, and recommendations concurrently. Run
  `deno run -A examples/composition/parallel.ts`.
- `examples/composition/branching.ts` – Pattern-matched branching with
  `branch()` and ts-pattern to handle free/pro/enterprise tiers. Run
  `deno run -A examples/composition/branching.ts`.

### Result-Based Error Handling (New)

- `examples/result-based/error-handling.ts` – Using `withResult()` to wrap
  steps and handle errors with `matchResult()`. Run
  `deno run -A examples/result-based/error-handling.ts`.
- `examples/result-based/chaining.ts` – Result combinators (`map`, `flatMap`,
  `sequence`, `traverse`) for functional error handling. Run
  `deno run -A examples/result-based/chaining.ts`.

### Meta Builder Examples (New)

- `examples/builder/fluent-meta.ts` – Fluent meta builder API showing old vs
  new style and complex compositions. Run
  `deno run -A examples/builder/fluent-meta.ts`.
- `examples/builder/meta-composition.ts` – Composing meta objects with
  `mergeMeta()` and `extendMeta()` for reusable patterns. Run
  `deno run -A examples/builder/meta-composition.ts`.

Each example prints explanatory output to the console and is self-contained; no
external services are required. Inspect the source for inline comments that
highlight policy composition and recommended patterns.

For deeper background on policy composition and testing helpers, read
[`docs/policies.md`](./policies.md) and [`docs/testing.md`](./testing.md). For
the new ergonomic features, see
[`docs/ergonomic-enhancements.md`](./ergonomic-enhancements.md).
