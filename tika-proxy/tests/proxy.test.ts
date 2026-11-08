import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { loadConfig, type ProxyConfig } from "../src/config.js";
import { buildServer, type FetchLike } from "../src/server.js";
import type { SafeTelemetryFields, Telemetry, TikaProxyEventName } from "../src/posthog.js";

type CapturedEvent = {
  event: string;
  properties: SafeTelemetryFields;
};

const baseConfig: ProxyConfig = {
  port: 3000,
  authToken: "correct-token",
  tikaUpstreamUrl: "https://tika.internal",
  tikaUpstreamTimeoutMs: 12_000,
  nodeEnv: "test",
  posthogKey: "",
  posthogHost: "https://us.i.posthog.com",
  posthogServiceName: "tika-proxy",
};

const deniedTerms = [
  "%PDF-secret-bytes",
  "resume.pdf",
  "jane@example.com",
  "+79991234567",
  "Authorization",
  "Bearer correct-token",
  "raw tika body",
  "stack",
  "malicious\r\nrequest",
  "evil<script>",
  "image/png",
  "text/html",
  "application/x-msdownload",
];

function makeTelemetry(capture?: Telemetry["capture"]) {
  const events: CapturedEvent[] = [];
  const telemetry: Telemetry = {
    capture(event: TikaProxyEventName, properties: SafeTelemetryFields) {
      events.push({ event, properties });
      return capture?.(event, properties);
    },
    shutdown: async () => {},
  };

  return { telemetry, events };
}

function makeJsonLogCapture(t: TestContext) {
  const lines: string[] = [];
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };

  t.after(() => {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  });

  return lines;
}

function assertSafeOutput(events: CapturedEvent[], logs: string[]) {
  const output = JSON.stringify({ events, logs });

  for (const term of deniedTerms) {
    assert.equal(output.includes(term), false, `unsafe output included ${term}`);
  }
}

function createFetchResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

function authHeaders(extra?: Record<string, string>) {
  return {
    authorization: "Bearer correct-token",
    ...extra,
  };
}

test("loadConfig requires TIKA_AUTH_TOKEN", () => {
  assert.throws(
    () => loadConfig({}),
    /TIKA_AUTH_TOKEN/,
  );
});

test("loadConfig defaults proxy upstream timeout to 12 seconds", () => {
  const config = loadConfig({ TIKA_AUTH_TOKEN: "token" });

  assert.equal(config.tikaUpstreamTimeoutMs, 12_000);
});

test("GET /health returns ready only when Tika upstream is ready", async (t) => {
  const calls: string[] = [];
  const { telemetry } = makeTelemetry();
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async (url: string | URL | Request) => {
      calls.push(String(url));
      return createFetchResponse("Apache Tika 3.2.3.0");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    service: "tika-proxy",
    upstream: "ready",
  });
  assert.deepEqual(calls, ["https://tika.internal/version"]);
});

test("GET /health returns 503 while Tika upstream is unavailable", async (t) => {
  const { telemetry } = makeTelemetry();
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => {
      throw new TypeError("connect failed");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    service: "tika-proxy",
    upstream: "unavailable",
  });
});

test("unauthorized PUT /tika?probe=1 is rejected before upstream fetch and emits safe telemetry", async (t) => {
  const logs = makeJsonLogCapture(t);
  let fetchCalled = false;
  const fetchImpl: FetchLike = async () => {
    fetchCalled = true;
    return createFetchResponse("should not happen");
  };
  const { telemetry, events } = makeTelemetry();
  const app = buildServer({ config: baseConfig, telemetry, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika?probe=1",
    payload: Buffer.from("probe"),
    headers: {
      "content-type": "application/pdf",
      "x-hiiire-request-id": "probe-id",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body, "Unauthorized");
  assert.equal(fetchCalled, false);
  assert.equal(events[0]?.event, "tika_proxy_request_rejected");
  assert.equal(events[0]?.properties.request_id, "probe-id");
  assert.equal(events[0]?.properties.result_code, "unauthorized");
  assertSafeOutput(events, logs);
});

test("unauthorized oversized PUT /tika is rejected before body parsing and upstream fetch", async (t) => {
  const logs = makeJsonLogCapture(t);
  let fetchCalled = false;
  const fetchImpl: FetchLike = async () => {
    fetchCalled = true;
    return createFetchResponse("should not happen");
  };
  const { telemetry, events } = makeTelemetry();
  const app = buildServer({ config: baseConfig, telemetry, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: Buffer.alloc(7 * 1024 * 1024, "x"),
    headers: {
      "content-type": "application/pdf",
      "x-hiiire-request-id": "oversized-unauth",
      "x-hiiire-file-kind": "pdf",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body, "Unauthorized");
  assert.equal(fetchCalled, false);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.event, "tika_proxy_request_rejected");
  assert.equal(events[0]?.properties.error_kind, "unauthorized");
  assert.equal(events[0]?.properties.result_code, "unauthorized");
  assertSafeOutput(events, logs);
});

test("PDF binary content type forwards bytes and safe headers to upstream", async (t) => {
  const logs = makeJsonLogCapture(t);
  const payload = Buffer.from("%PDF-secret-bytes");
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: FetchLike = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return createFetchResponse("parsed text");
  };
  const { telemetry, events } = makeTelemetry();
  const app = buildServer({ config: baseConfig, telemetry, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload,
    headers: authHeaders({
      "content-type": "application/pdf",
      "x-hiiire-request-id": "safe-request-1",
      "x-hiiire-file-kind": "pdf",
    }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/plain");
  assert.equal(response.body, "parsed text");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://tika.internal/tika");
  assert.equal(calls[0]?.init.method, "PUT");
  assert.deepEqual(Buffer.from(calls[0]?.init.body as ArrayBuffer), payload);
  assert.equal((calls[0]?.init.headers as Record<string, string>).accept, "text/plain");
  assert.equal((calls[0]?.init.headers as Record<string, string>)["content-type"], "application/pdf");
  assert.equal(events.at(-1)?.event, "tika_proxy_request_completed");
  assert.equal(events.at(-1)?.properties.file_kind, "pdf");
  assert.equal(events.at(-1)?.properties.file_size_bytes, payload.length);
  assertSafeOutput(events, logs);
});

test("unsupported content types are rejected safely before upstream fetch", async (t) => {
  for (const contentType of ["image/png", "text/html", "application/x-msdownload"]) {
    await t.test(contentType, async (t) => {
      const logs = makeJsonLogCapture(t);
      let fetchCalled = false;
      const { telemetry, events } = makeTelemetry();
      const app = buildServer({
        config: baseConfig,
        telemetry,
        fetchImpl: async () => {
          fetchCalled = true;
          return createFetchResponse("should not happen");
        },
      });
      t.after(() => app.close());

      const response = await app.inject({
        method: "PUT",
        url: "/tika",
        payload: Buffer.from("not a resume"),
        headers: authHeaders({
          "content-type": contentType,
          "x-hiiire-request-id": "unsupported-type",
          "x-hiiire-file-kind": "pdf",
        }),
      });

      assert.equal(response.statusCode, 415);
      assert.equal(response.body, "Unsupported file type");
      assert.equal(fetchCalled, false);
      assert.equal(events.at(-1)?.event, "tika_proxy_request_rejected");
      assert.equal(events.at(-1)?.properties.error_kind, "unsupported_content_type");
      assert.equal(events.at(-1)?.properties.result_code, "unsupported_content_type");
      assertSafeOutput(events, logs);
    });
  }

  await t.test("missing content-type", async (t) => {
    makeJsonLogCapture(t);
    let fetchCalled = false;
    const { telemetry, events } = makeTelemetry();
    const app = buildServer({
      config: baseConfig,
      telemetry,
      fetchImpl: async () => {
        fetchCalled = true;
        return createFetchResponse("should not happen");
      },
    });
    t.after(() => app.close());

    const response = await app.inject({
      method: "PUT",
      url: "/tika",
      payload: Buffer.from("plain text without type"),
      headers: authHeaders({
        "x-hiiire-request-id": "missing-type",
        "x-hiiire-file-kind": "txt",
      }),
    });

    assert.equal(response.statusCode, 415);
    assert.equal(response.body, "Unsupported file type");
    assert.equal(fetchCalled, false);
    assert.equal(events.at(-1)?.properties.error_kind, "unsupported_content_type");
  });
});

test("octet-stream requires a valid sanitized file kind", async (t) => {
  await t.test("missing file kind", async (t) => {
    const logs = makeJsonLogCapture(t);
    let fetchCalled = false;
    const { telemetry, events } = makeTelemetry();
    const app = buildServer({
      config: baseConfig,
      telemetry,
      fetchImpl: async () => {
        fetchCalled = true;
        return createFetchResponse("should not happen");
      },
    });
    t.after(() => app.close());

    const response = await app.inject({
      method: "PUT",
      url: "/tika",
      payload: Buffer.from("%PDF-secret-bytes"),
      headers: authHeaders({
        "content-type": "application/octet-stream",
        "x-hiiire-request-id": "octet-missing-kind",
      }),
    });

    assert.equal(response.statusCode, 415);
    assert.equal(response.body, "Unsupported file type");
    assert.equal(fetchCalled, false);
    assert.equal(events.at(-1)?.properties.file_kind, "unknown");
    assert.equal(events.at(-1)?.properties.error_kind, "unsupported_content_type");
    assertSafeOutput(events, logs);
  });

  await t.test("invalid file kind", async (t) => {
    const logs = makeJsonLogCapture(t);
    let fetchCalled = false;
    const { telemetry, events } = makeTelemetry();
    const app = buildServer({
      config: baseConfig,
      telemetry,
      fetchImpl: async () => {
        fetchCalled = true;
        return createFetchResponse("should not happen");
      },
    });
    t.after(() => app.close());

    const response = await app.inject({
      method: "PUT",
      url: "/tika",
      payload: Buffer.from("%PDF-secret-bytes"),
      headers: authHeaders({
        "content-type": "application/octet-stream",
        "x-hiiire-request-id": "octet-invalid-kind",
        "x-hiiire-file-kind": "application/x-msdownload",
      }),
    });

    assert.equal(response.statusCode, 415);
    assert.equal(response.body, "Unsupported file type");
    assert.equal(fetchCalled, false);
    assert.equal(events.at(-1)?.properties.file_kind, "unknown");
    assert.equal(events.at(-1)?.properties.error_kind, "unsupported_content_type");
    assertSafeOutput(events, logs);
  });

  await t.test("valid file kind", async (t) => {
    makeJsonLogCapture(t);
    const calls: Array<{ init: RequestInit }> = [];
    const { telemetry } = makeTelemetry();
    const app = buildServer({
      config: baseConfig,
      telemetry,
      fetchImpl: async (_url: string | URL | Request, init: RequestInit = {}) => {
        calls.push({ init });
        return createFetchResponse("parsed text");
      },
    });
    t.after(() => app.close());

    const response = await app.inject({
      method: "PUT",
      url: "/tika",
      payload: Buffer.from("%PDF-secret-bytes"),
      headers: authHeaders({
        "content-type": "application/octet-stream",
        "x-hiiire-request-id": "octet-valid-kind",
        "x-hiiire-file-kind": "docx",
      }),
    });

    assert.equal(response.statusCode, 200);
    assert.equal((calls[0]?.init.headers as Record<string, string>)["content-type"], "application/octet-stream");
  });
});

test("request id sanitizes malicious input before telemetry and logs", async (t) => {
  const logs = makeJsonLogCapture(t);
  const { telemetry, events } = makeTelemetry();
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => createFetchResponse("parsed text"),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: Buffer.from("safe"),
    headers: authHeaders({
      "content-type": "text/plain",
      "x-hiiire-request-id": "malicious\r\nrequest",
      "x-hiiire-file-kind": "txt",
    }),
  });

  assert.equal(response.statusCode, 200);
  const requestId = events.at(-1)?.properties.request_id;
  assert.match(String(requestId), /^[0-9a-f-]{36}$/);
  assert.notEqual(requestId, "malicious\r\nrequest");
  assertSafeOutput(events, logs);
});

test("file kind sanitizes malicious values to unknown before telemetry and logs", async (t) => {
  const logs = makeJsonLogCapture(t);
  const { telemetry, events } = makeTelemetry();
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => createFetchResponse("parsed text"),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: Buffer.from("safe"),
    headers: authHeaders({
      "content-type": "text/plain",
      "x-hiiire-request-id": "safe-request-2",
      "x-hiiire-file-kind": "evil<script>",
    }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(events.at(-1)?.properties.file_kind, "unknown");
  assertSafeOutput(events, logs);
});

test("telemetry capture promise that never resolves does not block response", async (t) => {
  makeJsonLogCapture(t);
  const { telemetry } = makeTelemetry(() => new Promise(() => {}));
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => createFetchResponse("parsed text"),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: Buffer.from("safe"),
    headers: authHeaders({ "content-type": "text/plain" }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "parsed text");
});

test("telemetry capture throwing does not break response", async (t) => {
  const logs = makeJsonLogCapture(t);
  const { telemetry, events } = makeTelemetry(() => {
    throw new Error("stack secret");
  });
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => createFetchResponse("parsed text"),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: Buffer.from("safe"),
    headers: authHeaders({ "content-type": "text/plain" }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "parsed text");
  assertSafeOutput(events, logs);
});

test("text/plain body does not return 415", async (t) => {
  makeJsonLogCapture(t);
  const { telemetry } = makeTelemetry();
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => createFetchResponse("plain text parsed"),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: "hello",
    headers: authHeaders({ "content-type": "text/plain" }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "plain text parsed");
});

test("upstream 500 maps to safe 502 without raw upstream body", async (t) => {
  const logs = makeJsonLogCapture(t);
  const { telemetry, events } = makeTelemetry();
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => createFetchResponse("raw tika body jane@example.com", { status: 500 }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: Buffer.from("safe"),
    headers: authHeaders({ "content-type": "application/pdf", "x-hiiire-file-kind": "pdf" }),
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.body, "File could not be processed");
  assert.equal(events.at(-1)?.event, "tika_proxy_request_failed");
  assert.equal(events.at(-1)?.properties.upstream_status, 500);
  assert.equal(events.at(-1)?.properties.result_code, "upstream_error");
  assertSafeOutput(events, logs);
});

test("non-OK upstream response body is cancelled and never exposed", async (t) => {
  const logs = makeJsonLogCapture(t);
  let upstreamBodyCancelled = false;
  const { telemetry, events } = makeTelemetry();
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("raw tika body jane@example.com"));
        },
        cancel() {
          upstreamBodyCancelled = true;
        },
      });

      return new Response(stream, { status: 500 });
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: Buffer.from("safe"),
    headers: authHeaders({ "content-type": "application/pdf", "x-hiiire-file-kind": "pdf" }),
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.body, "File could not be processed");
  assert.equal(upstreamBodyCancelled, true);
  assertSafeOutput(events, logs);
});

test("oversized upstream success body is rejected safely", async (t) => {
  const logs = makeJsonLogCapture(t);
  const { telemetry, events } = makeTelemetry();
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => createFetchResponse("a".repeat(256 * 1024 + 1)),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: Buffer.from("safe"),
    headers: authHeaders({ "content-type": "application/pdf", "x-hiiire-file-kind": "pdf" }),
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.body, "File could not be processed");
  assert.equal(events.at(-1)?.event, "tika_proxy_request_failed");
  assert.equal(events.at(-1)?.properties.error_kind, "upstream_response_too_large");
  assert.equal(events.at(-1)?.properties.result_code, "upstream_response_too_large");
  assertSafeOutput(events, logs);
});

test("upstream 504 response and AbortError map to timeout telemetry", async (t) => {
  await t.test("HTTP 504", async (t) => {
    makeJsonLogCapture(t);
    const { telemetry, events } = makeTelemetry();
    const app = buildServer({
      config: baseConfig,
      telemetry,
      fetchImpl: async () => createFetchResponse("raw tika body", { status: 504 }),
    });
    t.after(() => app.close());

    const response = await app.inject({
      method: "PUT",
      url: "/tika",
      payload: Buffer.from("safe"),
      headers: authHeaders({ "content-type": "text/plain" }),
    });

    assert.equal(response.statusCode, 504);
    assert.equal(response.body, "Tika upstream timeout");
    assert.equal(events.at(-1)?.event, "tika_proxy_request_failed");
    assert.equal(events.at(-1)?.properties.result_code, "timeout");
  });

  await t.test("AbortError", async (t) => {
    makeJsonLogCapture(t);
    const { telemetry, events } = makeTelemetry();
    const app = buildServer({
      config: baseConfig,
      telemetry,
      fetchImpl: async () => {
        throw new DOMException("operation timed out", "AbortError");
      },
    });
    t.after(() => app.close());

    const response = await app.inject({
      method: "PUT",
      url: "/tika",
      payload: Buffer.from("safe"),
      headers: authHeaders({ "content-type": "text/plain" }),
    });

    assert.equal(response.statusCode, 504);
    assert.equal(response.body, "Tika upstream timeout");
    assert.equal(events.at(-1)?.event, "tika_proxy_request_failed");
    assert.equal(events.at(-1)?.properties.result_code, "timeout");
  });
});

test("network error maps to 503 unavailable telemetry", async (t) => {
  const logs = makeJsonLogCapture(t);
  const { telemetry, events } = makeTelemetry();
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => {
      throw new TypeError("connect ECONNREFUSED");
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: Buffer.from("safe"),
    headers: authHeaders({ "content-type": "text/plain" }),
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body, "Tika upstream unavailable");
  assert.equal(events.at(-1)?.event, "tika_proxy_upstream_unavailable");
  assert.equal(events.at(-1)?.properties.result_code, "unavailable");
  assertSafeOutput(events, logs);
});

test("telemetry and logs never include forbidden request, auth, file, contact, or upstream details", async (t) => {
  const logs = makeJsonLogCapture(t);
  const { telemetry, events } = makeTelemetry();
  const app = buildServer({
    config: baseConfig,
    telemetry,
    fetchImpl: async () => createFetchResponse("raw tika body jane@example.com", { status: 500 }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/tika",
    payload: Buffer.from("%PDF-secret-bytes"),
    headers: authHeaders({
      "content-type": "application/pdf",
      "x-hiiire-request-id": "malicious\r\nrequest",
      "x-hiiire-file-kind": "evil<script>",
      "x-file-name": "resume.pdf",
      "x-contact": "+79991234567",
    }),
  });

  assert.equal(response.statusCode, 502);
  assertSafeOutput(events, logs);
});
