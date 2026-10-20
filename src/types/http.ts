/** HTTP and transport primitives used throughout Apexa. */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "CONNECT"
  | "TRACE";

export type QueryScalar = string | number | boolean | bigint | Date;

export type QueryValue =
  | QueryScalar
  | readonly QueryScalar[]
  | null
  | undefined;

export type QueryParams = Readonly<Record<string, QueryValue>>;

export type RequestBody =
  | BodyInit
  | Readonly<Record<string, unknown>>
  | readonly unknown[]
  | null;

export type RequestMetadata = Readonly<Record<string, unknown>>;

export type CredentialsMode = RequestCredentials;

export interface FetchOptions {
  cache?: RequestCache;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  integrity?: string;
  keepalive?: boolean;
  mode?: RequestMode;
}
