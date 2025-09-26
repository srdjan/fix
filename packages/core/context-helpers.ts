import type { EngineConfig, ExecutionCtx, Meta, Step } from "./types.ts";
import { execute } from "./executor.ts";

type SpanOptions = {
  attributes?: Record<string, string | number | boolean>;
};

export type ContextHelpers<M extends Meta, Base, Scope> = {
  span<R>(
    name: string,
    fn: (ctx: ExecutionCtx<M, Base, Scope>) => Promise<R> | R,
    opts?: SpanOptions,
  ): Promise<R>;
  child<CM extends Meta, Out>(
    additionalMeta: CM,
    step: Step<CM, Base, Out, Scope>,
  ): Promise<Out>;
  memo<R>(
    key: string,
    fn: () => Promise<R> | R,
  ): Promise<R>;
};

const MEMO_SYMBOL = Symbol.for("macrofx.memo");
const SPAN_SYMBOL = Symbol.for("macrofx.spans");

type MemoStore = Map<string, any>;
type SpanStore = Array<{ name: string; startTime: number; endTime?: number; error?: unknown }>;

const getMemoStore = (ctx: any): MemoStore => {
  if (!ctx[MEMO_SYMBOL]) {
    ctx[MEMO_SYMBOL] = new Map();
  }
  return ctx[MEMO_SYMBOL];
};

const getSpanStore = (ctx: any): SpanStore => {
  if (!ctx[SPAN_SYMBOL]) {
    ctx[SPAN_SYMBOL] = [];
  }
  return ctx[SPAN_SYMBOL];
};

export const createSpan = <M extends Meta, Base, Scope, R>(
  ctx: ExecutionCtx<M, Base, Scope>,
  name: string,
  fn: (ctx: ExecutionCtx<M, Base, Scope>) => Promise<R> | R,
  opts?: SpanOptions,
): Promise<R> => {
  const spans = getSpanStore(ctx);
  const span: {
    name: string;
    startTime: number;
    endTime?: number;
    error?: unknown;
    attributes?: Record<string, string | number | boolean>;
  } = {
    name,
    startTime: performance.now(),
    attributes: opts?.attributes,
  };

  spans.push(span);

  const log = (ctx as any).log;
  if (log?.debug) {
    log.debug("span.start", { name, attributes: opts?.attributes });
  }

  return Promise.resolve(fn(ctx))
    .then((result) => {
      span.endTime = performance.now();
      const duration = span.endTime - span.startTime;
      if (log?.debug) {
        log.debug("span.end", { name, durationMs: duration.toFixed(2) });
      }
      return result;
    })
    .catch((error) => {
      span.endTime = performance.now();
      const duration = span.endTime - span.startTime;
      (span as any).error = error;
      if (log?.error) {
        log.error("span.error", {
          name,
          durationMs: duration.toFixed(2),
          error: String(error),
        });
      }
      throw error;
    });
};

export const createChild = async <M extends Meta, CM extends Meta, Base, Scope, Out>(
  parentCtx: ExecutionCtx<M, Base, Scope>,
  additionalMeta: CM,
  step: Step<CM, Base, Out, Scope>,
): Promise<Out> => {
  const cfg: EngineConfig<Base, CM> = {
    base: parentCtx as unknown as Base,
    macros: (parentCtx as any).__macros ?? [],
    env: (parentCtx as any).__env,
  };

  const childStep: Step<CM, Base, Out, Scope> = {
    ...step,
    meta: { ...step.meta, ...additionalMeta } as CM,
  };

  return await execute(childStep as any, cfg);
};

export const memoize = async <R>(
  ctx: any,
  key: string,
  fn: () => Promise<R> | R,
): Promise<R> => {
  const store = getMemoStore(ctx);

  if (store.has(key)) {
    const log = ctx.log;
    if (log?.debug) {
      log.debug("memo.hit", { key });
    }
    return store.get(key);
  }

  const log = ctx.log;
  if (log?.debug) {
    log.debug("memo.miss", { key });
  }

  const result = await fn();
  store.set(key, result);
  return result;
};

export const attachContextHelpers = <M extends Meta, Base, Scope>(
  ctx: ExecutionCtx<M, Base, Scope>,
): ExecutionCtx<M, Base, Scope> & ContextHelpers<M, Base, Scope> => {
  const enhanced = ctx as ExecutionCtx<M, Base, Scope> &
    ContextHelpers<M, Base, Scope>;

  enhanced.span = (name, fn, opts) => createSpan(ctx, name, fn, opts);
  enhanced.child = (additionalMeta, step) =>
    createChild(ctx, additionalMeta, step);
  enhanced.memo = (key, fn) => memoize(ctx, key, fn);

  return enhanced;
};

export const getSpans = (ctx: any): ReadonlyArray<{
  name: string;
  startTime: number;
  endTime?: number;
  error?: unknown;
}> => {
  return getSpanStore(ctx);
};

export const clearMemo = (ctx: any, key?: string): void => {
  const store = getMemoStore(ctx);
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
};