import type {
  ApexaResponse,
  ApexaErrorOptions,
  InternalRequestConfig,
} from "../types.js";

/** Error raised when a request cannot be completed successfully. */
export class ApexaError extends Error {
  public readonly code: string;
  public readonly priority: "high" | "medium" | "low";
  public readonly config?: InternalRequestConfig;
  public readonly response?: ApexaResponse<unknown>;

  public constructor(message: string, options: ApexaErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ApexaError";
    this.code = options.code;
    this.priority = options.priority ?? "medium";

    if (options.config !== undefined) this.config = options.config;
    if (options.response !== undefined) this.response = options.response;

    Object.setPrototypeOf(this, new.target.prototype);
  }

}

/** Determine whether a value is a non-null object with string-keyed fields. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Determine whether a value is a supported error priority. */
export function isErrorPriority(
  value: unknown,
): value is "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low";
}

/** Build standard error details from a server error payload. */
export function defaultErrorHandler(
  data: Record<string, unknown>,
  status: number,
): { message: string; code: string; priority: "high" | "medium" | "low" } {
  const error = isRecord(data.error) ? data.error : {};

  return {
    code: typeof error.code === "string" ? error.code : "ERR_HTTP",
    message:
      typeof error.message === "string"
        ? error.message
        : `Request failed with HTTP status ${status}.`,
    priority: isErrorPriority(error.priority) ? error.priority : "medium",
  };
}

export type ErrorDetails = ReturnType<typeof defaultErrorHandler>;

/** Normalize custom error-handler output into a safe, complete shape. */
export function normalizeErrorDetails(
  value: unknown,
  status: number,
): ErrorDetails {
  if (!isRecord(value)) return defaultErrorHandler({}, status);

  return {
    message:
      typeof value.message === "string" && value.message.trim()
        ? value.message
        : `Request failed with HTTP status ${status}.`,
    code:
      typeof value.code === "string" && value.code.trim()
        ? value.code
        : "ERR_HTTP",
    priority: isErrorPriority(value.priority) ? value.priority : "medium",
  };
}
