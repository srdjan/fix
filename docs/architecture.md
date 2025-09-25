# Architecture

```
          +-------------------+
meta ---> |  Macro Registry   | --resolve--> capabilities (ports/openers)
          +-------------------+
                   |
                   v
             +-----------+
             |  Weaver   |  (retry/timeout/log ... applied uniformly)
             +-----------+
                   |
                   v
           +-----------------+
           |  step.run(ctx)  |  (pure, typed, minimal)
           +-----------------+
```

- `packages/core` hosts the executor, types, bracket, and weaver.
- `packages/std` provides built-in macros for common ports and resources.
- `packages/host-node` supplies Node-compatible host bindings used by std macros.
- `packages/resources` contains pooling and fs tempDir resource implementations.
