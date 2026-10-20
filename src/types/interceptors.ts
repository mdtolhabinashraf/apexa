import type { ApexaResponse } from "./response.js";
import type { InternalRequestConfig } from "./request.js";

export type RequestFulfilledInterceptor = (
  config: InternalRequestConfig,
) => InternalRequestConfig | Promise<InternalRequestConfig>;

export type RequestRejectedInterceptor = (error: unknown) => unknown;

export type ResponseFulfilledInterceptor = (
  response: ApexaResponse<unknown>,
) => ApexaResponse<unknown> | Promise<ApexaResponse<unknown>>;

export type ResponseRejectedInterceptor = (error: unknown) => unknown;

export type InterceptorId = number;
