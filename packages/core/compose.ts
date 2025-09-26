import type { ExecutionCtx, Meta, Step } from "./types.ts";
import { mergeMeta } from "./meta-builder.ts";
import type { Result } from "./result.ts";
import { err, ok } from "./result.ts";
import { getEngineFromContext } from "./context-helpers.ts";
import { match } from "ts-pattern";

type MergeMeta<M1 extends Meta, M2 extends Meta> = M1 & M2;

export const pipe = <Base, Scope = symbol>() => {
  return <Steps extends readonly Step<any, Base, any, Scope>[]>(
    ...steps: Steps
  ) => {
    type Output = Steps extends
      readonly [...any, Step<any, Base, infer Out, Scope>] ? Out
      : never;
    type MergedMeta = Steps extends readonly Step<infer M, Base, any, Scope>[]
      ? M
      : never;

    return {
      name: `pipe(${steps.map((s) => s.name).join(" → ")})`,
      meta: steps.reduce(
        (acc, s) => mergeMeta(acc as any, s.meta),
        {} as Meta,
      ) as MergedMeta,
      run: async (
        ctx: ExecutionCtx<MergedMeta, Base, Scope>,
      ): Promise<Output> => {
        const engine = getEngineFromContext<Base>(ctx);
        if (!engine) {
          throw new Error(
            "pipe() requires execution through createEngine().run()",
          );
        }

        let result: any = ctx;
        for (const step of steps) {
          const baseForStep = (
              result && typeof result === "object"
            )
            ? {
              ...(result as Record<string, unknown>),
              ...ctx,
            } as Base
            : ctx as unknown as Base;
          result = await engine.run(step as any, baseForStep);
        }
        return result as Output;
      },
    } as Step<MergedMeta, Base, Output, Scope>;
  };
};

export const all = <Base, Scope = symbol>() => {
  return <Steps extends readonly Step<any, Base, any, Scope>[]>(
    ...steps: Steps
  ) => {
    type Outputs = {
      [K in keyof Steps]: Steps[K] extends Step<any, Base, infer Out, Scope>
        ? Out
        : never;
    };
    type MergedMeta = Steps extends readonly Step<infer M, Base, any, Scope>[]
      ? M
      : never;

    return {
      name: `all(${steps.map((s) => s.name).join(", ")})`,
      meta: steps.reduce(
        (acc, s) => mergeMeta(acc as any, s.meta),
        {} as Meta,
      ) as MergedMeta,
      run: async (
        ctx: ExecutionCtx<MergedMeta, Base, Scope>,
      ): Promise<Outputs> => {
        const engine = getEngineFromContext<Base>(ctx);
        if (!engine) {
          throw new Error(
            "all() requires execution through createEngine().run()",
          );
        }

        const baseForStep = ctx as unknown as Base;
        const results = await Promise.all(
          steps.map((step) => engine.run(step as any, baseForStep)),
        );
        return results as Outputs;
      },
    } as Step<MergedMeta, Base, Outputs, Scope>;
  };
};

export const race = <Base, Scope = symbol>() => {
  return <Steps extends readonly Step<any, Base, any, Scope>[]>(
    ...steps: Steps
  ) => {
    type Output = Steps[number] extends Step<any, Base, infer Out, Scope> ? Out
      : never;
    type MergedMeta = Steps extends readonly Step<infer M, Base, any, Scope>[]
      ? M
      : never;

    return {
      name: `race(${steps.map((s) => s.name).join(", ")})`,
      meta: steps.reduce(
        (acc, s) => mergeMeta(acc as any, s.meta),
        {} as Meta,
      ) as MergedMeta,
      run: async (
        ctx: ExecutionCtx<MergedMeta, Base, Scope>,
      ): Promise<Output> => {
        const engine = getEngineFromContext<Base>(ctx);
        if (!engine) {
          throw new Error(
            "race() requires execution through createEngine().run()",
          );
        }

        const baseForStep = ctx as unknown as Base;
        const result = await Promise.race(
          steps.map((step) => engine.run(step as any, baseForStep)),
        );
        return result as Output;
      },
    } as Step<MergedMeta, Base, Output, Scope>;
  };
};

type BranchCase<V, M extends Meta, Base, Out, Scope> = {
  pattern: any;
  step: Step<M, Base, Out, Scope>;
};

export class Branch<V, Base, Scope = symbol> {
  private cases: BranchCase<V, any, Base, any, Scope>[] = [];
  private defaultStep?: Step<any, Base, any, Scope>;

  constructor(private readonly value: V) {}

  with<M extends Meta, Out, P>(
    pattern: P,
    step: Step<M, Base, Out, Scope>,
  ): Branch<V, Base, Scope> {
    this.cases.push({ pattern, step });
    return this;
  }

  otherwise<M extends Meta, Out>(
    step: Step<M, Base, Out, Scope>,
  ): Step<any, Base, Out, Scope> {
    this.defaultStep = step;
    return this.toStep();
  }

  private toStep(): Step<any, Base, any, Scope> {
    const allSteps = [
      ...this.cases.map((c) => c.step),
      ...(this.defaultStep ? [this.defaultStep] : []),
    ];

    const mergedMeta = allSteps.reduce(
      (acc, s) => mergeMeta(acc as any, s.meta),
      {} as Meta,
    );

    return {
      name: `branch(${allSteps.map((s) => s.name).join(" | ")})`,
      meta: mergedMeta,
      run: async (ctx: any): Promise<any> => {
        const engine = getEngineFromContext<Base>(ctx);
        if (!engine) {
          throw new Error(
            "branch() requires execution through createEngine().run()",
          );
        }

        let matchedStep: Step<any, Base, any, Scope> | undefined;

        for (const { pattern, step } of this.cases) {
          const matched = match(this.value)
            .with(pattern, () => true)
            .otherwise(() => false);

          if (matched) {
            matchedStep = step;
            break;
          }
        }

        if (!matchedStep) {
          if (this.defaultStep) {
            matchedStep = this.defaultStep;
          } else {
            throw new Error(
              `No matching branch for value: ${JSON.stringify(this.value)}`,
            );
          }
        }

        return await engine.run(matchedStep as any, ctx as unknown as Base);
      },
    };
  }

  exhaustive(): Step<any, Base, any, Scope> {
    return this.toStep();
  }
}

export const branch = <V, Base, Scope = symbol>(
  value: V,
): Branch<V, Base, Scope> => new Branch(value);

export const conditional = <Base, Scope = symbol>() => {
  return <
    M1 extends Meta,
    M2 extends Meta,
    Out1,
    Out2,
  >(
    predicate: (ctx: Base) => boolean | Promise<boolean>,
    ifTrue: Step<M1, Base, Out1, Scope>,
    ifFalse: Step<M2, Base, Out2, Scope>,
  ): Step<M1 & M2, Base, Out1 | Out2, Scope> => {
    const mergedMeta = mergeMeta(ifTrue.meta as any, ifFalse.meta as any);
    return {
      name: `if(${ifTrue.name}, ${ifFalse.name})`,
      meta: mergedMeta,
      run: async (
        ctx: ExecutionCtx<M1 & M2, Base, Scope>,
      ): Promise<Out1 | Out2> => {
        const engine = getEngineFromContext<Base>(ctx);
        if (!engine) {
          throw new Error(
            "conditional() requires execution through createEngine().run()",
          );
        }

        const condition = await predicate(ctx as unknown as Base);
        const step = condition ? ifTrue : ifFalse;
        return await engine.run(step as any, ctx as unknown as Base);
      },
    };
  };
};

export const retry = <Base, Scope = symbol>() => {
  return <M extends Meta, Out>(
    step: Step<M, Base, Out, Scope>,
    times: number,
    delayMs: number,
  ): Step<M, Base, Out, Scope> => {
    return {
      name: `retry(${step.name}, ${times})`,
      meta: step.meta,
      run: async (ctx: ExecutionCtx<M, Base, Scope>): Promise<Out> => {
        const engine = getEngineFromContext<Base>(ctx);
        if (!engine) {
          throw new Error(
            "retry() requires execution through createEngine().run()",
          );
        }

        const base = ctx as unknown as Base;

        let lastError: unknown;
        for (let i = 0; i <= times; i++) {
          try {
            return await engine.run(step as any, base);
          } catch (e) {
            lastError = e;
            if (i < times) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          }
        }
        throw lastError;
      },
    };
  };
};

export const timeout = <Base, Scope = symbol>() => {
  return <M extends Meta, Out>(
    step: Step<M, Base, Out, Scope>,
    ms: number,
  ): Step<M, Base, Out, Scope> => {
    return {
      name: `timeout(${step.name}, ${ms}ms)`,
      meta: step.meta,
      run: async (ctx: ExecutionCtx<M, Base, Scope>): Promise<Out> => {
        const engine = getEngineFromContext<Base>(ctx);
        if (!engine) {
          throw new Error(
            "timeout() requires execution through createEngine().run()",
          );
        }

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Step timeout")), ms)
        );

        return await Promise.race([
          engine.run(step as any, ctx as unknown as Base),
          timeoutPromise,
        ]) as Out;
      },
    };
  };
};

export const withResult = <Base, Scope = symbol>() => {
  return <M extends Meta, Out>(
    step: Step<M, Base, Out, Scope>,
  ): Step<M, Base, Result<Out, Error>, Scope> => {
    return {
      name: `withResult(${step.name})`,
      meta: step.meta,
      run: async (
        ctx: ExecutionCtx<M, Base, Scope>,
      ): Promise<Result<Out, Error>> => {
        const engine = getEngineFromContext<Base>(ctx);
        if (!engine) {
          throw new Error(
            "withResult() requires execution through createEngine().run()",
          );
        }

        try {
          const result = await engine.run(step as any, ctx as unknown as Base);
          return ok(result) as Result<Out, Error>;
        } catch (e) {
          return err(e instanceof Error ? e : new Error(String(e)));
        }
      },
    };
  };
};
