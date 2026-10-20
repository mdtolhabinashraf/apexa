import type { HttpAdapter } from "../types.js";
import { BODYLESS_METHODS } from "./constants.js";
import { ApexaError } from "./errors.js";
import { prepareBody } from "./body.js";

/** Execute a request with the platform Fetch API. */
export const fetchAdapter: HttpAdapter = async (config) => {
  if (config.method === "CONNECT" || config.method === "TRACE") {
    throw new ApexaError(
      `Fetch does not support the ${config.method} method.`,
      { code: "ERR_CONFIG", config },
    );
  }

  const headers = new Headers(config.headers);
  const body = prepareBody(config.body, headers);
  if (BODYLESS_METHODS.has(config.method) && body != null) {
    throw new ApexaError(
      `${config.method} requests cannot include a body.`,
      { code: "ERR_CONFIG", config },
    );
  }

  const init: RequestInit = {
    method: config.method,
    headers,
    signal: config.signal,
    credentials: config.credentials,
    ...(body !== undefined ? { body } : {}),
    ...(config.cache !== undefined ? { cache: config.cache } : {}),
    ...(config.redirect !== undefined ? { redirect: config.redirect } : {}),
    ...(config.referrer !== undefined ? { referrer: config.referrer } : {}),
    ...(config.referrerPolicy !== undefined
      ? { referrerPolicy: config.referrerPolicy }
      : {}),
    ...(config.integrity !== undefined ? { integrity: config.integrity } : {}),
    ...(config.keepalive !== undefined ? { keepalive: config.keepalive } : {}),
    ...(config.mode !== undefined ? { mode: config.mode } : {}),
  };
  return fetch(config.url, init);
};
