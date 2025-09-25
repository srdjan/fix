# Policies & Error Handling

Policies are declared on `meta` and woven automatically. They layer in a
deterministic order so you can reason about failures.

## Composition order

1. **circuit** – checks breaker state before invoking the underlying port/lease
   acquire.
2. **log** – captures success/error telemetry with latency metadata.
3. **retry** – replays transient failures with optional jitter.
4. **timeout** – bounds both effect calls (`ms`) and resource acquires
   (`acquireMs`).

The executor uses the same order for both ports and leases, ensuring consistent
semantics.

## Circuit breaker

```ts
meta: {
  circuit: { name: "user-http", halfOpenAfterMs: 5_000 }
}
```

- Trips immediately on an error and blocks subsequent calls until the cooldown
  elapses.
- Emits `log.warn` entries (`*.circuit-trip`, `*.circuit-open`) when a logger is
  present.
- Works for both ports and leases; you can protect `lease.lock` acquires from
  stampedes.

## Retry

```ts
meta: {
  retry: { times: 2, delayMs: 50, jitter: true }
}
```

- Applies to effect calls and lease acquires (after circuit/log).
- When combined with circuit, the first failure trips the breaker; retries will
  surface `circuit-open` until the cooldown passes.
- Use `jitter` to spread concurrent contention.

## Timeout

```ts
meta: {
  timeout: { ms: 750, acquireMs: 500 }
}
```

- `ms` caps runtime for each port call.
- `acquireMs` caps lease acquisition; combined with retry this prevents stuck
  resource grabs.

## Idempotency

```ts
meta: {
  idempotency: { key: "policy-demo", ttlMs: 600_000 }
}
```

- Runs during the `before` phase. If a cached result exists (`kv` required), the
  executor bypasses `run` entirely and returns the stored payload.
- On success, `after` persists the new value. Supply `ttlMs` to control cache
  freshness.
- Provide `ctx.idempotencyKey` in `base` when the key is dynamic; the macro
  falls back to `meta.idempotency.key` otherwise.

## Error handling patterns

- **Surface context-rich errors**: wrap failing calls in your step with
  `try/catch` to attach domain metadata before rethrowing – retries and circuit
  logic will honour the new error.
- **Fallbacks**: catch exceptions after policies run and fall back to cached
  data or alternate ports (`kv`, `queue`). Logs retain the underlying failure
  cause.
- **Resource hygiene**: place nested `lease.*` operations inside `bracket` even
  when also using timeouts to guarantee release.
- **Macro-driven recovery**: custom macros can populate
  `ctx.__macrofxSkip`/`ctx.__macrofxValue` to short-circuit on known failure
  scenarios (e.g. golden cache, feature flag).

Refer to
[`examples/advanced/policy-combo.ts`](./../examples/advanced/policy-combo.ts)
for a runnable demonstration of these ideas end-to-end.
