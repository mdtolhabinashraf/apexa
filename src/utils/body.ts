import type { RequestBody } from "../types.js";
import { isPlainObject } from "./validation.js";

/** Serialize structured request bodies and infer their content type. */
export function prepareBody(
  body: RequestBody | undefined,
  headers: Headers,
): BodyInit | null | undefined {
  if (body === undefined || body === null) return body;
  if (isPlainObject(body) || Array.isArray(body)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return JSON.stringify(body);
  }
  return body as BodyInit;
}
