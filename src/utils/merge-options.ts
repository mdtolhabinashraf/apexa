import type { ApexaOptions, RetryOptions } from "../types.js";
import { DEFAULT_CSRF, DEFAULT_RETRY } from "./constants.js";

/** Merge header sources from left to right, with later values taking precedence. */
export function mergeHeaders(
  ...sources: Array<HeadersInit | undefined>
): Headers {
  const result = new Headers();
  for (const source of sources) {
    if (source === undefined) continue;
    new Headers(source).forEach((value, key) => result.set(key, value));
  }
  return result;
}

/** Merge retry defaults and request overrides. */
export function mergeRetry(
  defaults?: RetryOptions,
  override?: RetryOptions,
): RetryOptions {
  return {
    ...DEFAULT_RETRY,
    ...defaults,
    ...override,
    statusCodes:
      override?.statusCodes ?? defaults?.statusCodes ?? DEFAULT_RETRY.statusCodes,
  };
}

/** Merge CSRF defaults and request overrides. */
export function mergeCsrf(
  defaults?: ApexaOptions["csrf"],
  override?: ApexaOptions["csrf"],
): NonNullable<ApexaOptions["csrf"]> {
  return {
    ...DEFAULT_CSRF,
    ...defaults,
    ...override,
    methods: override?.methods ?? defaults?.methods ?? DEFAULT_CSRF.methods,
  };
}
