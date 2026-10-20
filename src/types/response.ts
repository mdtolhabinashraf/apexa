import type { InternalRequestConfig } from "./request.js";

export interface ApexaResponse<T = unknown> {
  data: T;
  raw: Response;
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
  redirected: boolean;
  type: ResponseType;
  bodyUsed: boolean;
  url: string;
  config: InternalRequestConfig;
  text(): Promise<string>;
  json<U = unknown>(): Promise<U>;
  blob(): Promise<Blob>;
  arrayBuffer(): Promise<ArrayBuffer>;
  formData(): Promise<FormData>;
  clone(): Response;
}
