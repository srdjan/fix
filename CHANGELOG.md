# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-09-26

### Added

- Engine abstraction with `createEngine` and `createStdEngine` for reusable step
  execution.
- Lease-aware policy weaving with jittered retries, structured logging, and
  timeout-safe cleanup.
- Fluent meta builder that exposes helper methods directly on the meta object
  while keeping `.build()` optional.
- Standard engine helper exports and a default in-memory env in `@macrofx/std`.
- Comprehensive examples demonstrating pipelines, branching, result-based error
  handling, and meta composition using the new engine flow.
- Dedicated regression tests covering lease timeout cleanup, logging, and jitter
  handling.

### Changed

- Composition helpers, context helpers, and docs now rely on the shared engine
  API instead of ad-hoc `execute` calls.
- Result utilities no longer depend on `ts-pattern`; `matchResult` uses
  lightweight branching by default.
- Documentation refresh for engine usage, policy behaviour, testing strategy,
  and ergonomic features.

### Removed

- Implicit reliance on `ctx.__macros` / `ctx.__env`; helpers now operate through
  the attached engine instance.
- Node-specific `@macrofx/host-node` adapter (superseded by the std env).
