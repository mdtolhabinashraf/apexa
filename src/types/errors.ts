import type { ApexaResponse } from "./response.js";
import type { InternalRequestConfig } from "./request.js";

export interface ApexaErrorOptions {
  code: string;
  priority?: "high" | "medium" | "low";
  config?: InternalRequestConfig;
  response?: ApexaResponse<unknown>;
  cause?: unknown;
}

/** Constructor used to create errors raised by the request pipeline. */
export type ErrorConstructor = new (
  message: string,
  options: ApexaErrorOptions,
) => Error;

export type ErrorHandler = (data: Record<string, unknown>) => {
  message: string;
  code: string;
  priority: "high" | "medium" | "low";
};

export interface ErrorPolicy {
  customError?: ErrorConstructor;
  handler?: ErrorHandler;
}
