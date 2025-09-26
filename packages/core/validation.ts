import type { Macro, Meta, Step } from "./types.ts";

export type ValidationError = {
  code: string;
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: readonly ValidationError[] };

export const validateStep = <M extends Meta, Base, Out, Scope>(
  step: Step<M, Base, Out, Scope>,
  macros: readonly Macro<any, any>[],
): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!step || typeof step !== "object") {
    errors.push({
      code: "INVALID_STEP",
      message: "Step must be a valid object",
      suggestion: "Use defineStep() to create type-safe steps",
    });
    return { valid: false, errors };
  }

  if (!step.name || typeof step.name !== "string") {
    errors.push({
      code: "MISSING_NAME",
      message: "Step must have a name property",
      suggestion: "Add a descriptive name to help with debugging and tracing",
    });
  }

  if (!step.meta || typeof step.meta !== "object") {
    errors.push({
      code: "MISSING_META",
      message: "Step must have a meta property",
      suggestion: "Use the meta builder: meta().withDb('ro').withKv('ns').build()",
    });
    return { valid: false, errors };
  }

  if (typeof step.run !== "function") {
    errors.push({
      code: "MISSING_RUN",
      message: "Step must have a run function",
      suggestion: "Add a run function that accepts an ExecutionCtx",
    });
  }

  const declaredCapabilities = Object.keys(step.meta);
  const availableMacroKeys = new Set(macros.map((m) => m.key));

  for (const cap of declaredCapabilities) {
    if (cap === "retry" || cap === "timeout" || cap === "circuit" || cap === "idempotency") {
      continue;
    }

    if (!availableMacroKeys.has(cap)) {
      const similar = findSimilar(cap, Array.from(availableMacroKeys));
      errors.push({
        code: "UNKNOWN_CAPABILITY",
        message: `Step declares capability '${cap}' but no matching macro is registered`,
        suggestion: similar
          ? `Did you mean '${similar}'? Add the corresponding macro to your macros array`
          : `Register a macro with key '${cap}' or remove it from meta`,
        details: { capability: cap, availableMacros: Array.from(availableMacroKeys) },
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
};

export const validateMeta = (
  meta: Meta,
  macros: readonly Macro<any, any>[],
): ValidationResult => {
  const errors: ValidationError[] = [];
  const declaredCapabilities = Object.keys(meta);
  const availableMacroKeys = new Set(macros.map((m) => m.key));

  for (const cap of declaredCapabilities) {
    if (cap === "retry" || cap === "timeout" || cap === "circuit" || cap === "idempotency") {
      continue;
    }

    if (!availableMacroKeys.has(cap)) {
      const similar = findSimilar(cap, Array.from(availableMacroKeys));
      errors.push({
        code: "UNKNOWN_CAPABILITY",
        message: `Meta declares capability '${cap}' but no matching macro is registered`,
        suggestion: similar
          ? `Did you mean '${similar}'?`
          : `Register a macro with key '${cap}'`,
        details: { capability: cap },
      });
    }
  }

  if (meta.db && meta.db.role !== "ro" && meta.db.role !== "rw") {
    errors.push({
      code: "INVALID_DB_ROLE",
      message: `Invalid db role: '${meta.db.role}'. Must be 'ro' or 'rw'`,
      suggestion: "Use 'ro' for read-only or 'rw' for read-write access",
    });
  }

  if (meta.retry && (meta.retry.times < 0 || meta.retry.delayMs < 0)) {
    errors.push({
      code: "INVALID_RETRY_CONFIG",
      message: "Retry configuration must have non-negative times and delayMs",
      suggestion: "Use positive numbers for retry times and delayMs",
      details: { retry: meta.retry },
    });
  }

  if (meta.timeout && (meta.timeout.ms && meta.timeout.ms < 0)) {
    errors.push({
      code: "INVALID_TIMEOUT_CONFIG",
      message: "Timeout must be a positive number",
      suggestion: "Use positive milliseconds for timeout",
      details: { timeout: meta.timeout },
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
};

export const formatValidationErrors = (errors: readonly ValidationError[]): string => {
  return errors
    .map((e, i) => {
      let msg = `${i + 1}. [${e.code}] ${e.message}`;
      if (e.suggestion) {
        msg += `\n   💡 ${e.suggestion}`;
      }
      if (e.details) {
        msg += `\n   Details: ${JSON.stringify(e.details, null, 2)}`;
      }
      return msg;
    })
    .join("\n\n");
};

export const assertValidStep = <M extends Meta, Base, Out, Scope>(
  step: Step<M, Base, Out, Scope>,
  macros: readonly Macro<any, any>[],
): void => {
  const result = validateStep(step, macros);
  if (!result.valid) {
    const errorMsg = formatValidationErrors(result.errors);
    throw new Error(`Step validation failed:\n\n${errorMsg}`);
  }
};

export const assertValidMeta = (
  meta: Meta,
  macros: readonly Macro<any, any>[],
): void => {
  const result = validateMeta(meta, macros);
  if (!result.valid) {
    const errorMsg = formatValidationErrors(result.errors);
    throw new Error(`Meta validation failed:\n\n${errorMsg}`);
  }
};

const findSimilar = (input: string, candidates: string[]): string | undefined => {
  const threshold = 3;
  let bestMatch: string | undefined;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance && distance <= threshold) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestMatch;
};

const levenshtein = (a: string, b: string): number => {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1,
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
};