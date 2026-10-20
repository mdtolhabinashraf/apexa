import type { ApexaResponse } from "./response.js";
import type { RequestBody } from "./http.js";
import type { ApexaRequestOptions } from "./request.js";

export interface ApexaRequestMethods {
  get<T = unknown>(
    url: string,
    options?: Omit<ApexaRequestOptions, "method" | "body">,
  ): Promise<ApexaResponse<T>>;

  delete<T = unknown>(
    url: string,
    options?: Omit<ApexaRequestOptions, "method" | "body">,
  ): Promise<ApexaResponse<T>>;

  head(
    url: string,
    options?: Omit<ApexaRequestOptions, "method" | "body">,
  ): Promise<ApexaResponse<undefined>>;

  options<T = unknown>(
    url: string,
    options?: Omit<ApexaRequestOptions, "method" | "body">,
  ): Promise<ApexaResponse<T>>;

  post<T = unknown>(
    url: string,
    body?: RequestBody,
    options?: Omit<ApexaRequestOptions, "method" | "body">,
  ): Promise<ApexaResponse<T>>;

  put<T = unknown>(
    url: string,
    body?: RequestBody,
    options?: Omit<ApexaRequestOptions, "method" | "body">,
  ): Promise<ApexaResponse<T>>;

  patch<T = unknown>(
    url: string,
    body?: RequestBody,
    options?: Omit<ApexaRequestOptions, "method" | "body">,
  ): Promise<ApexaResponse<T>>;
}
