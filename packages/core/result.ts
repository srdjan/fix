export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (r.ok) return r.value;
  throw new Error(`Unwrap failed: ${String((r as Err<E>).error)}`);
};

export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T =>
  r.ok ? r.value : fallback;

export const unwrapOrElse = <T, E>(
  r: Result<T, E>,
  fn: (e: E) => T,
): T => (r.ok ? r.value : fn(r.error));

export const map = <T, E, U>(
  r: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> => (r.ok ? ok(fn(r.value)) : r);

export const mapErr = <T, E, F>(
  r: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> => (r.ok ? r : err(fn(r.error)));

export const flatMap = <T, E, U>(
  r: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => (r.ok ? fn(r.value) : r);

export const recover = <T, E>(
  r: Result<T, E>,
  fn: (error: E) => T,
): Ok<T> => (r.ok ? r : ok(fn(r.error)));

export const recoverWith = <T, E>(
  r: Result<T, E>,
  fn: (error: E) => Result<T, E>,
): Result<T, E> => (r.ok ? r : fn(r.error));

export const fromPromise = async <T, E = Error>(
  promise: Promise<T>,
  mapError?: (e: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    return ok(await promise);
  } catch (e) {
    return err(mapError ? mapError(e) : e as E);
  }
};

export const toPromise = <T, E>(r: Result<T, E>): Promise<T> =>
  r.ok ? Promise.resolve(r.value) : Promise.reject(r.error);

export const all = <T extends readonly Result<any, any>[]>(
  results: T,
): Result<
  { [K in keyof T]: T[K] extends Result<infer V, any> ? V : never },
  T[number] extends Result<any, infer E> ? E : never
> => {
  const values: any[] = [];
  for (const r of results) {
    if (!r.ok) return r as any;
    values.push(r.value);
  }
  return ok(values as any);
};

export const matchResult = <T, E, R>(
  result: Result<T, E>,
  onOk: (value: T) => R,
  onErr: (error: E) => R,
): R => (result.ok ? onOk(result.value) : onErr(result.error));

export const matchResultAsync = async <T, E, R>(
  result: Result<T, E>,
  onOk: (value: T) => Promise<R> | R,
  onErr: (error: E) => Promise<R> | R,
): Promise<
  R
> => (result.ok ? await onOk(result.value) : await onErr(result.error));

export const trySync = <T, E = Error>(
  fn: () => T,
  mapError?: (e: unknown) => E,
): Result<T, E> => {
  try {
    return ok(fn());
  } catch (e) {
    return err(mapError ? mapError(e) : e as E);
  }
};

export const tryAsync = async <T, E = Error>(
  fn: () => Promise<T>,
  mapError?: (e: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    return ok(await fn());
  } catch (e) {
    return err(mapError ? mapError(e) : e as E);
  }
};

export const sequence = <T, E>(
  results: readonly Result<T, E>[],
): Result<readonly T[], E> => {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
};

export const traverse = <T, U, E>(
  items: readonly T[],
  fn: (item: T) => Result<U, E>,
): Result<readonly U[], E> => sequence(items.map(fn));

export const traverseAsync = async <T, U, E>(
  items: readonly T[],
  fn: (item: T) => Promise<Result<U, E>>,
): Promise<Result<readonly U[], E>> =>
  sequence(await Promise.all(items.map(fn)));

export const partition = <T, E>(
  results: readonly Result<T, E>[],
): { oks: readonly T[]; errs: readonly E[] } => {
  const oks: T[] = [];
  const errs: E[] = [];
  for (const r of results) {
    if (r.ok) {
      oks.push(r.value);
    } else {
      errs.push(r.error);
    }
  }
  return { oks, errs };
};
