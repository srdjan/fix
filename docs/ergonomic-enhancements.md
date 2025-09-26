# Ergonomic Enhancements

This document outlines the ergonomic improvements added to macrofx-unified.

## Summary of Improvements

### 1. Engine Abstraction (`packages/core/executor.ts`)

- **Reusable engines** via `createEngine` and `createStdEngine`
- **Single configuration point** for macros/env, reused across requests
- **Opt-in validation** flag per engine/run for lighter hot paths
- **Context helpers** transparently capture the engine so `ctx.child()` and
  composition utilities reuse the same runtime

### 2. Result Type & Error Handling (`packages/core/result.ts`)

- **Type-safe error handling** without exceptions
- **Combinators**: `ok`, `err`, `map`, `flatMap`, `mapErr`, `recover`,
  `matchResult`
- **Collection operations**: `all`, `sequence`, `traverse`, `partition`
- **Promise integration**: `fromPromise`, `toPromise`, `tryAsync`
- **Zero dependencies**: `matchResult` now uses simple predicate
  branching—`ts-pattern` is no longer required

### 3. Meta Builder (`packages/core/meta-builder.ts`)

- **Fluent API** for building meta objects
- **Type-safe chaining** that progressively builds capabilities
- **Composition utilities**: `mergeMeta`, `extendMeta`
- **Example**:
  ```typescript
  const meta = meta()
    .withDb("ro")
    .withKv("users")
    .withRetry(3, 100)
    .withLog("debug");
  // Call .build() if you need a plain object (e.g. serialisation)
  ```

### 4. Step Composition (`packages/core/compose.ts`)

- **`pipe()`** - Sequential pipeline execution
- **`allSteps()`** - Parallel execution (replaces conflicting `all` from
  result.ts)
- **`race()`** - First-to-complete wins
- **`branch()`** - Pattern-matched branching with ts-pattern
- **`conditional()`** - If/else step selection
- **`withResult()`** - Wrap steps to return Result instead of throwing
- **Engine-aware** – composition helpers rely on the engine stored in context;
  run composed steps via `createEngine().run(...)` or a standard engine helper

### 5. Context Helpers (`packages/core/context-helpers.ts`)

- **`ctx.span(name, fn)`** - Automatic telemetry spans with timing
- **`ctx.child(meta, step)`** - Spawn child steps with inherited capabilities
- **`ctx.memo(key, fn)`** - Request-scoped memoization
- All helpers integrated into ExecutionCtx automatically

### 6. Enhanced Validation (`packages/core/validation.ts`)

- **Detailed error messages** with suggestions
- **Levenshtein distance** for capability typo detection
- **`validateStep()`** and `validateMeta()`** with structured errors
- **`assertValidStep()`** throws with formatted errors
- Example output:
  ```
  [UNKNOWN_CAPABILITY] Step declares capability 'redis' but no matching macro is registered
  💡 Did you mean 'kv'? Add the corresponding macro to your macros array
  ```

### 7. Testing Enhancements (`packages/testing/mod.ts`)

- **`createPolicyTracker()`** - Track and assert on policy execution
  - `expectRetried(n)`
  - `expectCircuitOpen(name)`
  - `expectCircuitClosed(name)`
  - `expectTimedOut()`
  - `expectIdempotencyHit(key)`
- **`snapshotPort()`** - Record all port interactions for testing

## Examples

### Composition Examples

- `examples/composition/pipeline.ts` - Sequential pipeline
- `examples/composition/parallel.ts` - Parallel execution
- `examples/composition/branching.ts` - Pattern-matched branching with
  ts-pattern

### Result-Based Examples

- `examples/result-based/error-handling.ts` - Using Result with steps
- `examples/result-based/chaining.ts` - Result combinators

### Builder Examples

- `examples/builder/fluent-meta.ts` - Meta builder usage
- `examples/builder/meta-composition.ts` - Composing meta objects

## Breaking Changes

Engine helpers and meta builder tweaks are additive. Existing
`execute(step,
config)` remains as a thin convenience wrapper for scripts, but
new code should prefer `createEngine()`.

## Export Naming

To avoid conflicts:

- `all` from `result.ts` - keeps original name (for Result arrays)
- `all` from `compose.ts` - exported as `allSteps` (for step composition)

## Integration with ts-pattern

All branching and pattern matching uses `ts-pattern` for:

- Type-safe exhaustive matching
- Better error messages
- Cleaner syntax than if/switch

## Performance Considerations

- Context helpers use symbols to avoid property collisions
- Memoization is request-scoped (cleared after execution)
- Spans track timing with minimal overhead
- Validation is optional (can be skipped in production)

## Future Enhancements

Potential additions based on these foundations:

- Saga pattern for compensating transactions
- State machine DSL using ts-pattern
- Auto-batching for KV/DB operations
- Dataloader-style request deduplication
- Effect-TS bridge for interop
