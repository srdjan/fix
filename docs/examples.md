# Examples

All examples are TypeScript modules that can be executed with Deno 2+
(`deno run -A …`). They adhere to the light functional style: no decorators, no
classes – just data and functions.

## Quick Start

- `examples/deno/api.ts` – end-to-end pipeline showing DB + KV + tempDir with
  retry/timeout/log. Run `deno run -A examples/deno/api.ts`.

## Scenario Guides

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

Each example prints explanatory output to the console and is self-contained; no
external services are required. Inspect the source for inline comments that
highlight policy composition and recommended patterns.

For deeper background on policy composition and testing helpers, read
[`docs/policies.md`](./policies.md) and [`docs/testing.md`](./testing.md).
