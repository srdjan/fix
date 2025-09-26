# Concepts

- **Meta**: declarative needs for a step. Drives both compile-time capabilities
  (`CapsOf<M, Scope>`) and runtime macro selection.
- **Port**: a typed group of effectful functions (e.g. `HttpPort`, `KvPort`,
  `DbPort`). Ports are always plain objects of functions.
- **Lease<T, Scope>**: a branded resource handle that cannot escape its scope;
  acquire via `lease.*` helpers and manage with `bracket`.
- **Bracket**: a combinator that guarantees `acquire → use → release` even when
  `use` throws, plus an optional finaliser hook.
- **Macro**: a small plugin that matches `meta`, resolves ports/leases, and can
  run `before/after/onError` hooks. Built-ins live in `@macrofx/std`.
- **Weaver**: a transform that decorates ports and lease acquires with declared
  policies (circuit → log → retry → timeout) so behaviour is consistent.
- **Policies**: reusable behaviours (`retry`, `timeout`, `circuit`,
  `idempotency`, `log`) you compose in `meta` without touching business code.
- **Host**: a set of factories (`makeHttp`, `makeKv`, `fs`, `makeLock`, …)
  supplied at runtime; swap hosts to change environment without rewriting steps.
- **Execution Context**: `Base & CapsOf<M, Scope> & { meta: M }` – the value
  your step receives in `run`. Reads are type-safe, writes are discouraged
  except for macro communication via helpers like `setMacroResult`.
