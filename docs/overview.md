# Overview

`macrofx-unified` is a unified pipeline for **capability injection (effects)** and **resource lifecycles (leases)** driven by **metadata and macros** with end-to-end type safety.

- Declare needs in `meta` (e.g., `http`, `kv`, `db`, `fs.tempDir`, `retry`, `timeout`, `log`).
- The engine runs `validate → resolve → before → run → onError → after`.
- Matching macros resolve **Ports** and **Lease openers** into the execution context.
- A **weaver** applies policies like `retry`/`timeout`/`log` to both effects and resources uniformly.
- Your `run(ctx)` stays pure and only sees what it asked for — enforced by the compiler.
