# Examples

See `examples/deno/api.ts` for an end-to-end step that uses cache + db + tempDir resource.

Try adding `idempotency` to the meta and inject an `idempotencyKey` in the base; the built-in macro will short-circuit if a previous value exists in KV.
