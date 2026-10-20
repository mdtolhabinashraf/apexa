import { ApexaError } from "./errors.js";

/** Validate a finite, non-negative numeric option. */
export function validateNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ApexaError(`"${name}" must be a finite, non-negative number.`, {
      code: "ERR_CONFIG",
    });
  }
}

/** Determine whether a value is a plain object suitable for JSON serialization. */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
