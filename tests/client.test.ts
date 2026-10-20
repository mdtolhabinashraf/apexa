import { describe, expect, it, vi } from "vitest";
import type { InternalRequestConfig, RequestBody } from "../src/types.js";
import {
  Apexa,
  ApexaError,
  InterceptorRegistry,
  defaultInterpreter,
  fetchAdapter,
} from "../src/index.js";
import {
  defaultErrorHandler,
  isErrorPriority,
  isRecord,
  normalizeErrorDetails,
} from "../src/utils/errors.js";
import { mergeCsrf, mergeHeaders, mergeRetry } from "../src/utils/merge-options.js";
import { prepareBody } from "../src/utils/body.js";
import { isAbortError, sleep } from "../src/utils/timing.js";
import { isPlainObject, validateNonNegative } from "../src/utils/validation.js";
import {
  appendQuery,
  isAbsoluteUrl,
  isHttpMethod,
  normalizeBasePath,
  resolveUrl,
} from "../src/utils/url.js";

function makeResponse(
  body: BodyInit | null,
  init: ResponseInit = {},
): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function makeConfig(body?: RequestBody): InternalRequestConfig {
  return {
    url: "https://api.example.test/resource",
    method: "POST" as const,
    headers: new Headers(),
    signal: new AbortController().signal,
    ...(body === undefined ? {} : { body }),
    basePath: "",
    credentials: "same-origin" as const,
    timeout: 0,
    minimumTime: 0,
    metadata: {},
    retry: {},
    csrf: {},
    customError: ApexaError,
  };
}

describe("utility exports", () => {
  it("validates values and identifies records, priorities, and abort errors", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isErrorPriority("high")).toBe(true);
    expect(isErrorPriority("urgent")).toBe(false);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new Error("no"))).toBe(false);
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(() => validateNonNegative("timeout", 0)).not.toThrow();
    expect(() => validateNonNegative("timeout", -1)).toThrow(ApexaError);
  });

  it("normalizes URLs and serializes query values", () => {
    expect(normalizeBasePath(" /api/v1/ ")).toBe("/api/v1");
    expect(normalizeBasePath(" / ")).toBe("");
    expect(isAbsoluteUrl("https://example.test")).toBe(true);
    expect(isAbsoluteUrl("/users")).toBe(false);
    expect(isHttpMethod("GET")).toBe(true);
    expect(isHttpMethod("get")).toBe(false);
    expect(resolveUrl("/users", "https://example.test/root/", "/v1/"))
      .toBe("https://example.test/root/v1/users");
    expect(resolveUrl("/users")).toBe("/users");
    expect(() => resolveUrl("/users", "not a URL")).toThrow(ApexaError);

    const query = appendQuery(
      "https://example.test/users?existing=1#section",
      {
        text: "hello world",
        flag: true,
        ids: [1, 2],
        date: new Date("2024-01-02T03:04:05.000Z"),
        empty: null,
      },
    );
    expect(query).toContain("existing=1");
    expect(query).toContain("text=hello+world");
    expect(query).toContain("ids=1&ids=2");
    expect(query).toContain("date=2024-01-02T03%3A04%3A05.000Z");
    expect(query.endsWith("#section")).toBe(true);
  });

  it("merges headers, retry settings, and CSRF settings predictably", () => {
    const headers = mergeHeaders(
      { "X-Trace": "one", "X-Shared": "first" },
      { "x-shared": "second" },
    );
    expect(headers.get("x-trace")).toBe("one");
    expect(headers.get("x-shared")).toBe("second");

    expect(mergeRetry({ retries: 1 }, { delay: 0 })).toMatchObject({
      enabled: false,
      retries: 1,
      delay: 0,
      backoff: 2,
    });
    expect(mergeCsrf({ enabled: true }, { headerName: "X-Test-CSRF" }))
      .toMatchObject({ enabled: true, headerName: "X-Test-CSRF" });
  });

  it("prepares JSON and native request bodies", () => {
    const headers = new Headers();
    expect(prepareBody({ ok: true }, headers)).toBe('{"ok":true}');
    expect(headers.get("content-type")).toBe("application/json");
    expect(prepareBody("text", headers)).toBe("text");
    expect(prepareBody(null, headers)).toBeNull();
    expect(prepareBody(undefined, headers)).toBeUndefined();
  });

  it("supports abortable delays", async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
    const controller = new AbortController();
    const pending = sleep(100, controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
  });

  it("normalizes server error details", () => {
    expect(defaultErrorHandler({
      error: { code: "ERR_TEST", message: "Failed", priority: "high" },
    }, 500)).toEqual({
      code: "ERR_TEST",
      message: "Failed",
      priority: "high",
    });
    expect(normalizeErrorDetails({}, 404)).toEqual({
      code: "ERR_HTTP",
      message: "Request failed with HTTP status 404.",
      priority: "medium",
    });
  });
});

describe("InterceptorRegistry", () => {
  it("allocates IDs and supports eject and clear", () => {
    const registry = new InterceptorRegistry();
    const first = registry.request.use((config) => config);
    const second = registry.request.use((config) => config);
    expect(first).toBe(0);
    expect(second).toBe(1);
    registry.request.eject(first);
    registry.request.clear();
    expect(registry.request).toBeDefined();
  });
});

describe("fetchAdapter and defaultInterpreter", () => {
  it("uses Fetch and serializes structured bodies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) => new Response(init?.body, { status: 200 }),
    );
    const result = await fetchAdapter(makeConfig({ value: 1 }));
    fetchMock.mockRestore();
    expect(result).toBeInstanceOf(Response);
    expect(result.headers.get("content-type")).toBe("text/plain;charset=UTF-8");
    expect(await result.text()).toBe('{"value":1}');
  });

  it("rejects bodies for bodyless methods and unsupported Fetch methods", async () => {
    await expect(fetchAdapter({
      ...makeConfig({ value: 1 }),
      method: "GET",
    })).rejects.toMatchObject({ code: "ERR_CONFIG" });
    await expect(fetchAdapter({
      ...makeConfig(),
      method: "CONNECT",
    })).rejects.toMatchObject({ code: "ERR_CONFIG" });
  });

  it("parses JSON, text, and empty responses", async () => {
    expect(await defaultInterpreter(makeResponse('{"ok":true}'), makeConfig()))
      .toEqual({ ok: true });
    expect(await defaultInterpreter(new Response("hello", {
      headers: { "content-type": "text/plain" },
    }), makeConfig())).toBe("hello");
    expect(await defaultInterpreter(new Response(null, { status: 204 }), makeConfig()))
      .toBeUndefined();
    await expect(defaultInterpreter(makeResponse("{bad"), makeConfig()))
      .rejects.toMatchObject({ code: "ERR_PARSE" });
  });
});

describe("Apexa request pipeline", () => {
  it("supports every convenience method and request metadata", async () => {
    const adapter = vi.fn(async (_config: InternalRequestConfig) =>
      makeResponse(null, { status: 204 }),
    );
    const client = new Apexa({
      baseUrl: "https://api.example.test",
      basePath: "/v1",
      headers: { "X-Client": "apexa" },
      metadata: { trace: "one" },
      adapter,
    });

    await client.get("/resource");
    await client.delete("/resource");
    await client.head("/resource");
    await client.options("/resource");
    await client.post("/resource", { value: 1 });
    await client.put("/resource", { value: 1 });
    await client.patch("/resource", { value: 1 });

    expect(adapter).toHaveBeenCalledTimes(7);
    expect(adapter.mock.calls.map(([config]) => config.method)).toEqual([
      "GET", "DELETE", "HEAD", "OPTIONS", "POST", "PUT", "PATCH",
    ]);
    expect(adapter.mock.calls[0]?.[0]).toMatchObject({
      url: "https://api.example.test/v1/resource",
      metadata: { trace: "one" },
    });
  });

  it("runs request and response interceptors, and supports removal", async () => {
    const adapter = vi.fn(async (config) => {
      expect(config.headers.get("x-request-id")).toBe("test");
      return makeResponse("ok", {
        headers: { "content-type": "text/plain" },
      });
    });
    const client = new Apexa({ adapter });
    const id = client.interceptors.request.use((config) => {
      config.headers.set("x-request-id", "test");
      return config;
    });
    client.interceptors.response.use((result) => ({
      ...result,
      data: `${result.data}!`,
    }));

    expect((await client.get<string>("/health")).data).toBe("ok!");
    client.interceptors.request.eject(id);
    await expect(client.get("/health")).rejects.toMatchObject({ code: "ERR_NETWORK" });
  });

  it("retries safe methods but never retries unsafe methods", async () => {
    const safeAdapter = vi.fn()
      .mockResolvedValueOnce(makeResponse("busy", { status: 503 }))
      .mockResolvedValueOnce(makeResponse('{"ok":true}'));
    const safeResult = await new Apexa({
      adapter: safeAdapter,
      retry: { enabled: true, retries: 1, delay: 0 },
    }).get("/health");
    expect(safeResult.data).toEqual({ ok: true });
    expect(safeAdapter).toHaveBeenCalledTimes(2);

    const unsafeAdapter = vi.fn(async () => makeResponse(
      '{"error":{"message":"busy"}}',
      { status: 503 },
    ));
    await expect(new Apexa({
      adapter: unsafeAdapter,
      retry: { enabled: true, retries: 2, delay: 0 },
    }).post("/write", {})).rejects.toMatchObject({ code: "ERR_HTTP" });
    expect(unsafeAdapter).toHaveBeenCalledOnce();
  });

  it("handles CSRF, HTTP errors, custom interpreters, and custom errors", async () => {
    const tokenProvider = vi.fn(async () => "token");
    const adapter = vi.fn(async (config) => {
      expect(config.headers.get("x-csrf-token")).toBe("token");
      return makeResponse('{"ok":true}');
    });
    const result = await new Apexa({
      adapter,
      csrf: { enabled: true, tokenProvider },
    }).post("/write", {});
    expect(result.data).toEqual({ ok: true });
    expect(tokenProvider).toHaveBeenCalledOnce();

    await expect(new Apexa({
      adapter: async () => makeResponse('{"error":{"code":"ERR_NO","message":"Missing"}}', {
        status: 404,
      }),
    }).get("/missing")).rejects.toMatchObject({
      code: "ERR_NO",
      response: expect.objectContaining({ status: 404 }),
    });

    const custom = await new Apexa({
      adapter: async () => makeResponse("raw", {
        headers: { "content-type": "text/plain" },
      }),
      interpreter: async (raw) => ({ value: await raw.text() }),
    }).get("/custom");
    expect(custom.data).toEqual({ value: "raw" });
  });

  it("classifies aborts and timeouts, and validates configuration", async () => {
    const adapter = vi.fn((config) => new Promise<Response>((_, reject) => {
      const abort = (): void => reject(
        config.signal.reason ?? new DOMException("Aborted", "AbortError"),
      );
      if (config.signal.aborted) abort();
      else config.signal.addEventListener("abort", abort, { once: true });
    }));
    const controller = new AbortController();
    const aborted = new Apexa({ adapter }).get("/slow", { signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ code: "ERR_ABORTED" });
    await expect(new Apexa({ adapter }).get("/slow", { timeout: 5 }))
      .rejects.toMatchObject({ code: "ERR_TIMEOUT" });
    expect(() => new Apexa({ timeout: -1 })).toThrow(ApexaError);
  });
});
