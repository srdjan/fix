# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-09-26

### Fixed

- **Critical**: Fixed infinite recursion in `weave.ts:273` causing stack
  overflow crashes in examples
- Resolved 84% of linting errors (70 → 11), including require-await, ban-types,
  no-unused-vars, and prefer-const violations
- Fixed formatting inconsistencies across 4 files using `deno fmt`
- Enhanced type safety by making `Macro` type generic with optional `Env`
  parameter
- Fixed KV port implementation to match async interface expectations

### Added

- Comprehensive unit tests for core functionality (34 tests total):
  - `packages/core/result.test.ts` - Result type utilities testing
  - `packages/core/meta-builder.test.ts` - Meta builder functionality testing
- Updated API documentation to reflect new generic `Macro<M, Caps, Env>` type
  signature

### Changed

- Improved macro system type safety by replacing `any` types with proper
  `StdEnv` typing
- Enhanced error handling in standard environment implementations

## [0.1.0] - 2025-09-26

### Added

- Engine abstraction with `createEngine` and `createStdEngine` for reusable step
  execution.
- Lease-aware policy weaving with jittered retries, structured logging, and
  timeout-safe cleanup.
- Fluent meta builder that exposes helper methods directly on the meta object
  while keeping `.build()` optional.
- Standard engine helper exports and a default in-memory env in `@fix/std`.
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
- Node-specific `@fix/host-node` adapter (superseded by the std env).
