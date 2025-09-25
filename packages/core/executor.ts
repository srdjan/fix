import { weave } from "./weave.ts";
import { bracket } from "./bracket.ts";
import type { EngineConfig, Meta, Step } from "./types.ts";

export async function execute<M extends Meta, Base, Out, Scope>(
  step: Step<M, Base, Out, Scope>,
  cfg: EngineConfig<Base, M>,
): Promise<Out> {
  const { base, macros, env } = cfg;
  // 1) validate (lightweight here)
  if (!step || typeof step.run !== "function") throw new Error("invalid step");

  // 2) resolve all macros
  let caps: any = { bracket };
  for (const m of macros) {
    if (!m.match(step.meta as any)) continue;
    const partial = await m.resolve(step.meta as any, env);
    if (!partial) continue;
    const { lease: leasePartial, ...rest } = partial as any;
    if (rest && Object.keys(rest).length) Object.assign(caps, rest);
    if (leasePartial) {
      caps.lease = { ...(caps.lease ?? {}), ...leasePartial };
    }
  }

  // 3) weave policies (retry/timeout/log etc)
  const ctx: any = { ...base, ...weave(step.meta as any, caps) };
  ctx.meta = step.meta;

  // 4) before guards
  for (const m of macros) {
    if (m.match(step.meta as any) && m.before) {
      await m.before(ctx);
    }
  }

  if ((ctx as any).__macrofxSkip) {
    return (ctx as any).__macrofxValue as Out;
  }

  // 5) run
  try {
    const out = await step.run(ctx);
    // 6) after hooks
    let result = out;
    for (const m of macros) {
      if (m.match(step.meta as any) && m.after) {
        result = await m.after(result, ctx);
      }
    }
    return result;
  } catch (e) {
    // onError hooks (first one that throws wins)
    for (const m of macros) {
      if (m.match(step.meta as any) && m.onError) {
        const maybe = await m.onError(e, ctx);
        if (maybe !== undefined) return maybe as Out;
      }
    }
    throw e;
  }
}
