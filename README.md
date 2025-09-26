# macrofx-unified

**A unified, type-safe, metadata-driven pipeline for capabilities (effects)
_and_ resources (leases) in modern TypeScript.**\
No classes, no decorators — just functions, types, and a tiny executor with six
phases:

```
validate → resolve → before → run → onError → after
```

This monorepo combines three ideas under one engine:

- **macrofx (capability injection):** declare what you need in `meta`; get typed
  ports in `ctx`.
- **effectfx (side-effects):** HTTP, KV, DB, Queue, Time, Crypto, Log as
  **Ports**, host-agnostic.
- **resourcefx (lifetimes):** **bracket** + **Lease<T, Scope>** to guarantee
  allocation/release without leaks.

> You only see the capabilities you declare in `meta`. The compiler enforces
> this at call sites.

---

## Quick start (Deno)

Requirements: Deno 2+

```bash
deno task demo
```

You should see:

```
GET /users/123 → { id: "123", name: "Ada" }
```

## Monorepo layout

```
macrofx-unified/
  packages/
    core/           # executor, types, policy weaver
    ports/          # type-only port surfaces
    std/            # built-in macros & policies (http/kv/db + retry/timeout/log/idempotency)
    resources/      # bracket + Lease<T,Scope> + temp dir + simple pool
    host-node/      # Node-compatible host bindings (fetch, crypto, fs, in-memory kv/db)
    testing/        # fakes, chaos, leak detection helpers
  examples/
    deno/           # Deno.serve demo endpoint
  docs/             # comprehensive documentation
  deno.json         # tasks
```

## Why unify?

- **One `meta`, one `CapsOf<M>`** for both effects and resources.
- **One policy weaver** applies `retry/timeout/idempotency/log` uniformly across
  all ports/openers.
- **Host-agnostic**: swap `host-node` (Node), `host-deno` (Deno, not required
  for the demo), or write your own.
- **Testable**: pass `@macrofx/testing` fakes into the executor; everything is
  functions.

## Examples

- `examples/deno/api.ts` — an HTTP-like example (without needing real DB/Redis);
  shows cache + db + retry + timeout + bracket temp dir.
- `examples/advanced/multi-resource.ts` — nested leases (lock + db + tempDir)
  with manual finalisers.
- `examples/advanced/policy-combo.ts` — retry + timeout + circuit breaker +
  idempotency with explicit error handling.
- `examples/testing/with-fakes.test.ts` — demonstrates using `@macrofx/testing`
  fakes inside Deno tests.

## Testing helpers

- `fakeLogger()` captures structured logs for assertions.
- `fakeKv()` / `fakeHttp()` / `fakeTime()` provide deterministic, stateful
  ports.
- `withChaos()` wraps any port with configurable failure or latency injection
  for resilience testing.

## Publishing strategy

- Keep code here as a mono-source of truth.
- Publish packages as: `@macrofx/core`, `@macrofx/std`, `@macrofx/ports`,
  `@macrofx/resources`, `@macrofx/host-node`, `@macrofx/testing`.

## License

MIT — see [LICENSE](./LICENSE).
