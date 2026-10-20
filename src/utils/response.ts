import type {
  ApexaResponse,
  InternalRequestConfig,
  ResponseInterpreter,
} from "../types.js";
import { ApexaError } from "./errors.js";

/** Wrap parsed data and the native response in the public response shape. */
export function toApexaResponse<T>(
  data: T,
  response: Response,
  rawResponse: Response,
  config: InternalRequestConfig,
): ApexaResponse<T> {
  return {
    data,
    raw: rawResponse,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
    body: rawResponse.body,
    redirected: response.redirected,
    type: response.type,
    bodyUsed: rawResponse.bodyUsed,
    url: response.url || config.url,
    config,
    text: () => rawResponse.clone().text(),
    json: <U = unknown>() => rawResponse.clone().json() as Promise<U>,
    blob: () => rawResponse.clone().blob(),
    arrayBuffer: () => rawResponse.clone().arrayBuffer(),
    formData: () => rawResponse.clone().formData(),
    clone: () => rawResponse.clone(),
  };
}

/** Parse JSON responses and return text for other response media types. */
export const defaultInterpreter: ResponseInterpreter = async (response) => {
  if ([204, 205, 304].includes(response.status)) return undefined;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const text = await response.text();
  if (text.length === 0) return undefined;

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch (cause) {
      throw new ApexaError("The server returned invalid JSON.", {
        code: "ERR_PARSE",
        cause,
      });
    }
  }
  return text;
};
