import {
  createEngine,
  type Engine,
  type EngineRunOptions,
} from "../core/mod.ts";
import type { Meta, Step } from "../core/types.ts";
import { stdMacros } from "./macros.ts";
import { type StdEnv, stdEnv } from "./env.ts";

export type StdEngineOptions<Base> = {
  env?: StdEnv | Record<string, unknown>;
  validate?: boolean;
};

export const createStdEngine = <Base>(
  options: StdEngineOptions<Base> = {},
): Engine<Base, Meta> => {
  const { env = stdEnv, validate } = options;
  return createEngine<Base>({
    macros: [...stdMacros] as any,
    env,
    validate,
  });
};

export const runWithStdEngine = async <Base, M extends Meta, Out, Scope>(
  options: {
    step: Step<M, Base, Out, Scope>;
    base: Base;
    env?: StdEnv | Record<string, unknown>;
    validate?: boolean;
    runOptions?: EngineRunOptions;
  },
): Promise<Out> => {
  const engine = createStdEngine<Base>({
    env: options.env,
    validate: options.validate,
  });
  return await engine.run(options.step, options.base, options.runOptions);
};
