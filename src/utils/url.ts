import type { ApexaRequestOptions, HttpMethod } from "../types.js";
import { SUPPORTED_METHODS } from "./constants.js";
import { ApexaError } from "./errors.js";

/** Normalize an optional base path to a slash-prefixed path. */
export function normalizeBasePath(value?: string): string {
  if (!value?.trim()) return "";
  const path = value.trim().replace(/^\/+|\/+$/g, "");
  return path ? `/${path}` : "";
}

/** Determine whether a string contains an absolute URL scheme. */
export function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

/** Determine whether a value is a supported HTTP method. */
export function isHttpMethod(value: unknown): value is HttpMethod {
  return (
    typeof value === "string" && SUPPORTED_METHODS.has(value as HttpMethod)
  );
}

/** Resolve an endpoint against an optional base URL and base path. */
export function resolveUrl(
  path: string,
  baseUrl?: string,
  basePath = "",
): string {
  if (isAbsoluteUrl(path)) return path;

  const cleanPath = path.trim().replace(/^\/+/, "");
  const normalizedBasePath = normalizeBasePath(basePath).replace(/^\/+/, "");
  const relativePath = [normalizedBasePath, cleanPath].filter(Boolean).join("/");

  if (baseUrl === undefined || baseUrl.trim() === "") {
    return `/${relativePath}`;
  }

  try {
    const base = new URL(baseUrl);
    const baseUrlPath = base.pathname.replace(/\/+$/, "").replace(/^\/+/, "");
    const fullPath = [baseUrlPath, relativePath].filter(Boolean).join("/");
    return new URL(`/${fullPath}`, base.origin).toString();
  } catch (cause) {
    throw new ApexaError("Invalid base URL.", { code: "ERR_CONFIG", cause });
  }
}

/** Append encoded query parameters while preserving fragments. */
export function appendQuery(
  url: string,
  query?: ApexaRequestOptions["query"],
): string {
  if (!query) return url;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Date) {
      params.append(key, value.toISOString());
    } else if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item instanceof Date ? item.toISOString() : String(item));
      }
    } else {
      params.append(key, String(value));
    }
  }

  const serialized = params.toString();
  if (!serialized) return url;
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  return `${withoutHash}${withoutHash.includes("?") ? "&" : "?"}${serialized}${hash}`;
}
