# Concepts

- **Port**: a typed group of effectful functions (e.g., `HttpPort`, `KvPort`, `DbPort`).
- **Lease<T, Scope>**: a branded resource that cannot escape its scope.
- **Bracket**: a combinator that guarantees `acquire → use → release` even on errors.
- **Macro**: a small plugin that matches `meta`, resolves ports/leases, and can add hooks.
- **Weaver**: a transform that decorates ports and openers with policies (retry/timeout/log).
- **Host**: a set of functions (`makeHttp`, `makeKv`, etc.) bound at runtime for Deno/Node/CF.
