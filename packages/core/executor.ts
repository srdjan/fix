import { weave } from "./weave.ts";
import { bracket } from "./bracket.ts";
import {
  type CircuitProvider,
  type EngineConfig,
  getMacroResult,
  hasMacroResult,
  type Macro,
  type Meta,
  type Step,
} from "./types.ts";
import { attachContextHelpers } from "./context-helpers.ts";
import { assertValidStep } from "./validation.ts";

export type EngineRunOptions = {
  validate?: boolean;
};

export type EngineOptions<Base, M extends Meta> = {
  macros: Macro<M, object>[];
  env?: unknown;
  validate?: boolean;
};

export type Engine<Base, M extends Meta = Meta> = {
  run: <SM extends M, Out, Scope>(
    step: Step<SM, Base, Out, Scope>,
    base: Base,
    options?: EngineRunOptions,
  ) => Promise<Out>;
  config: { macros: Macro<M, object>[]; env?: unknown };
};

export function createEngine<Base, M extends Meta = Meta>(
  options: EngineOptions<Base, M>,
): Engine<Base, M> {
  const { macros, env, validate: defaultValidate = true } = options;

  const engine: Engine<Base, M> = {
    config: { macros, env },
    run: async <SM extends M, Out, Scope>(
      step: Step<SM, Base, Out, Scope>,
      base: Base,
      runOptions?: EngineRunOptions,
    ): Promise<Out> => {
      const validate = runOptions?.validate ?? defaultValidate;
      return await runStep(step, { base, macros, env, validate }, engine);
    },
  };

  return engine;
}

export async function execute<M extends Meta, Base, Out, Scope>(
  step: Step<M, Base, Out, Scope>,
  cfg: EngineConfig<Base, M>,
): Promise<Out> {
  const engine = createEngine<Base, M>({
    macros: cfg.macros,
    env: cfg.env,
    validate: cfg.validate,
  });
  return await engine.run(step, cfg.base, { validate: cfg.validate });
}

type RunConfig<Base, M extends Meta> = {
  base: Base;
  macros: Macro<M, object>[];
  env?: unknown;
  validate: boolean;
};

async function runStep<M extends Meta, Base, Out, Scope>(
  step: Step<M, Base, Out, Scope>,
  cfg: RunConfig<Base, M>,
  engine: Engine<Base, M>,
): Promise<Out> {
  const { base, macros, env, validate } = cfg;

  if (!step || typeof step.run !== "function") throw new Error("invalid step");

  if (validate) {
    assertValidStep(step, macros);
  }

  const matched = macros.filter((macro) => macro.match(step.meta as any));

  const caps: any = { bracket };
  const resolved = await Promise.all(
    matched.map(async (macro) => await macro.resolve(step.meta as any, env)),
  );

  for (const partial of resolved) {
    if (!partial) continue;
    const { lease: leasePartial, ...rest } = partial as any;
    if (rest && Object.keys(rest).length) Object.assign(caps, rest);
    if (leasePartial) {
      caps.lease = { ...(caps.lease ?? {}), ...leasePartial };
    }
  }

  const makeCircuit = typeof (env as any)?.makeCircuit === "function"
    ? (env as any).makeCircuit as CircuitProvider
    : undefined;

  const ctx: any = {
    ...base,
    ...weave(step.meta as any, caps, {
      getCircuit: makeCircuit
        ? (name, policy) => makeCircuit(name, policy)
        : undefined,
    }),
  };
  ctx.meta = step.meta;

  attachContextHelpers(ctx, engine);

  for (const macro of matched) {
    if (macro.before) {
      await macro.before(ctx);
    }
  }

  if (hasMacroResult(ctx)) {
    return getMacroResult<Out>(ctx)!;
  }

  try {
    const out = await step.run(ctx);
    let result = out;
    for (const macro of matched) {
      if (macro.after) {
        result = await macro.after(result, ctx);
      }
    }
    if (hasMacroResult(ctx)) {
      return getMacroResult<Out>(ctx)!;
    }
    return result;
  } catch (error) {
    for (const macro of matched) {
      if (macro.onError) {
        const maybe = await macro.onError(error, ctx);
        if (maybe !== undefined) return maybe as Out;
      }
    }
    if (hasMacroResult(ctx)) {
      return getMacroResult<Out>(ctx)!;
    }
    throw error;
  }
}
