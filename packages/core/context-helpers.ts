import type { ExecutionCtx, Meta, Step } from "./types.ts";
import type { Engine, EngineRunOptions } from "./executor.ts";

type SpanOptions = {
  attributes?: Record<string, string | number | boolean>;
};

export type ChildRunOptions<Base> = {
  base?: Base;
  run?: EngineRunOptions;
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
    options?: ChildRunOptions<Base>,
  ): Promise<Out>;
  memo<R>(
    key: string,
    fn: () => Promise<R> | R,
  ): Promise<R>;
};

const MEMO_SYMBOL = Symbol.for("macrofx.memo");
const SPAN_SYMBOL = Symbol.for("macrofx.spans");

type MemoStore = Map<string, any>;
type SpanStore = Array<
  { name: string; startTime: number; endTime?: number; error?: unknown }
>;

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

export const createChild = async <
  M extends Meta,
  CM extends Meta,
  Base,
  Scope,
  Out,
  EM extends Meta,
>(
  engine: Engine<Base, EM>,
  parentCtx: ExecutionCtx<M, Base, Scope>,
  additionalMeta: CM,
  step: Step<CM, Base, Out, Scope>,
  options?: ChildRunOptions<Base>,
): Promise<Out> => {
  const childStep: Step<CM, Base, Out, Scope> = {
    ...step,
    meta: { ...step.meta, ...additionalMeta } as CM,
  };

  const base = options?.base ?? parentCtx as unknown as Base;
  return await engine.run(childStep as any, base, options?.run);
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

const ENGINE_SYMBOL = Symbol.for("macrofx.engine");

export const attachContextHelpers = <
  M extends Meta,
  Base,
  Scope,
  EM extends Meta,
>(
  ctx: ExecutionCtx<M, Base, Scope>,
  engine: Engine<Base, EM>,
): ExecutionCtx<M, Base, Scope> & ContextHelpers<M, Base, Scope> => {
  const enhanced = ctx as
    & ExecutionCtx<M, Base, Scope>
    & ContextHelpers<M, Base, Scope>
    & { [ENGINE_SYMBOL]: Engine<Base, EM> };

  Object.defineProperty(enhanced, ENGINE_SYMBOL, {
    value: engine,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  enhanced.span = (name, fn, opts) => createSpan(ctx, name, fn, opts);
  enhanced.child = (additionalMeta, step, opts) =>
    createChild(engine, ctx, additionalMeta, step, opts);
  enhanced.memo = (key, fn) => memoize(ctx, key, fn);

  return enhanced;
};

export const getEngineFromContext = <Base, EM extends Meta = Meta>(
  ctx: any,
): Engine<Base, EM> | undefined => ctx?.[ENGINE_SYMBOL];

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
