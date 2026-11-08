import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
  countResumeWords,
  detectResumeFileKind,
  extractTextFromResumeFile,
  MAX_RESUME_FILE_SIZE_BYTES,
  MAX_RESUME_TEXT_CHARS,
  MAX_RESUME_WORDS,
  MIN_RESUME_TEXT_CHARS,
  normalizeResumeText,
} from "../lib/resume/extract-text.ts";
import { extractPlainTextWithTika, getTikaTimeoutMs } from "../lib/resume/tika-client.ts";

const supportedResumeFiles = [
  { name: "resume.pdf", type: "application/pdf" },
  { name: "resume.doc", type: "application/msword" },
  {
    name: "resume.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  { name: "resume.txt", type: "text/plain" },
];

function setEnvForTest(t: TestContext, key: string, value: string) {
  const original = process.env[key];
  t.after(() => {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  });
  process.env[key] = value;
}

function deleteEnvForTest(t: TestContext, key: string) {
  const original = process.env[key];
  t.after(() => {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  });
  delete process.env[key];
}

test("detectResumeFileKind supports pdf, doc, docx, and txt", () => {
  assert.equal(detectResumeFileKind(new File(["x"], "resume.pdf", { type: "application/pdf" })), "pdf");
  assert.equal(detectResumeFileKind(new File(["x"], "resume.doc", { type: "application/msword" })), "doc");
  assert.equal(
    detectResumeFileKind(
      new File(["x"], "resume.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ),
    "docx",
  );
  assert.equal(detectResumeFileKind(new File(["x"], "resume.txt", { type: "text/plain" })), "txt");
});

test("detectResumeFileKind prefers a docx extension over a wrong browser MIME", () => {
  assert.equal(detectResumeFileKind(new File(["x"], "resume.docx", { type: "application/msword" })), "docx");
});

test("normalizeResumeText keeps paragraphs and removes layout noise", () => {
  assert.equal(
    normalizeResumeText("Иван Иванов\r\n\r\nEmail:\u00A0test@example.com\r\n   \r\nОпыт\t\tработы"),
    "Иван Иванов\n\nEmail: test@example.com\n\nОпыт работы",
  );
});

test("resume extraction keeps existing business limits", () => {
  assert.equal(MAX_RESUME_FILE_SIZE_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_RESUME_TEXT_CHARS, 50_000);
  assert.equal(MAX_RESUME_WORDS, 8_000);
  assert.equal(MIN_RESUME_TEXT_CHARS, 20);
  assert.equal(countResumeWords("one two three"), 3);
});

test("extractTextFromResumeFile rejects unsupported files before calling Tika", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("should not be called", { status: 200 });
  };

  const result = await extractTextFromResumeFile(new File(["fake"], "resume.png", { type: "image/png" }));

  assert.deepEqual(result, { ok: false, code: "RESUME_FILE_UNSUPPORTED_TYPE" });
  assert.equal(fetchCalls, 0);
});

test("extractTextFromResumeFile rejects oversized files before kind detection and Tika", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("should not be called", { status: 200 });
  };

  const result = await extractTextFromResumeFile(
    new File([new Uint8Array(MAX_RESUME_FILE_SIZE_BYTES + 1)], "resume.png", { type: "image/png" }),
  );

  assert.deepEqual(result, { ok: false, code: "RESUME_FILE_TOO_LARGE" });
  assert.equal(fetchCalls, 0);
});

test("extractTextFromResumeFile maps empty Tika output to RESUME_FILE_EMPTY", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
  globalThis.fetch = async () => new Response("  \n\n ", { status: 200 });

  const result = await extractTextFromResumeFile(new File(["fake"], "resume.doc", { type: "application/msword" }));
  assert.deepEqual(result, { ok: false, code: "RESUME_FILE_EMPTY" });
});

test("extractTextFromResumeFile rejects text shorter than 20 chars as RESUME_FILE_EMPTY", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
  globalThis.fetch = async () => new Response("short text", { status: 200 });

  const result = await extractTextFromResumeFile(new File(["fake"], "resume.txt", { type: "text/plain" }));
  assert.deepEqual(result, { ok: false, code: "RESUME_FILE_EMPTY" });
});

test("extractTextFromResumeFile rejects extracted text over 50,000 chars for every supported kind", async (t) => {
  for (const fileInput of supportedResumeFiles) {
    await t.test(fileInput.name, async (t) => {
      const originalFetch = globalThis.fetch;
      t.after(() => {
        globalThis.fetch = originalFetch;
      });
      setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
      globalThis.fetch = async () => new Response("а".repeat(50_001), { status: 200 });

      const result = await extractTextFromResumeFile(new File(["fake"], fileInput.name, { type: fileInput.type }));
      assert.deepEqual(result, { ok: false, code: "RESUME_TEXT_TOO_LONG" });
    });
  }
});

test("extractTextFromResumeFile rejects extracted text over 8,000 words for every supported kind", async (t) => {
  for (const fileInput of supportedResumeFiles) {
    await t.test(fileInput.name, async (t) => {
      const originalFetch = globalThis.fetch;
      t.after(() => {
        globalThis.fetch = originalFetch;
      });
      setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
      globalThis.fetch = async () =>
        new Response(Array.from({ length: 8_001 }, () => "word").join(" "), { status: 200 });

      const result = await extractTextFromResumeFile(new File(["fake"], fileInput.name, { type: fileInput.type }));
      assert.deepEqual(result, { ok: false, code: "RESUME_TEXT_TOO_LONG" });
    });
  }
});

test("extractTextFromResumeFile maps Tika timeout to RESUME_FILE_TIMEOUT", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
  globalThis.fetch = async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };

  const result = await extractTextFromResumeFile(new File(["fake"], "resume.pdf", { type: "application/pdf" }));
  assert.deepEqual(result, { ok: false, code: "RESUME_FILE_TIMEOUT" });
});

test("extractTextFromResumeFile maps Tika parse failures to RESUME_FILE_PARSE_FAILED", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
  globalThis.fetch = async () => new Response("failed", { status: 500 });

  const result = await extractTextFromResumeFile(new File(["fake"], "resume.pdf", { type: "application/pdf" }));
  assert.deepEqual(result, { ok: false, code: "RESUME_FILE_PARSE_FAILED" });
});

test("extractTextFromResumeFile keeps operational Tika failures distinct from file parse failures", async (t) => {
  await t.test("missing TIKA_BASE_URL", async (t) => {
    deleteEnvForTest(t, "TIKA_BASE_URL");

    const result = await extractTextFromResumeFile(new File(["fake"], "resume.pdf", { type: "application/pdf" }));

    assert.deepEqual(result, { ok: false, code: "RESUME_EXTRACTION_TIKA_NOT_CONFIGURED" });
  });

  await t.test("auth failure", async (t) => {
    setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
    const originalFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async () => new Response("unauthorized", { status: 401 });

    const result = await extractTextFromResumeFile(new File(["fake"], "resume.pdf", { type: "application/pdf" }));

    assert.deepEqual(result, { ok: false, code: "RESUME_EXTRACTION_TIKA_AUTH_FAILED" });
  });

  await t.test("service unavailable", async (t) => {
    setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
    const originalFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });

    const result = await extractTextFromResumeFile(new File(["fake"], "resume.pdf", { type: "application/pdf" }));

    assert.deepEqual(result, { ok: false, code: "RESUME_EXTRACTION_TIKA_UNAVAILABLE" });
  });
});

test("extractPlainTextWithTika returns operational result codes for config, auth, and availability failures", async (t) => {
  await t.test("missing TIKA_BASE_URL", async (t) => {
    deleteEnvForTest(t, "TIKA_BASE_URL");

    const result = await extractPlainTextWithTika({
      file: new File(["fake"], "resume.pdf", { type: "application/pdf" }),
      fileKind: "pdf",
    });

    assert.deepEqual(result, { ok: false, code: "TIKA_NOT_CONFIGURED" });
  });

  await t.test("HTTP 403", async (t) => {
    setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
    const originalFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async () => new Response("forbidden", { status: 403 });

    const result = await extractPlainTextWithTika({
      file: new File(["fake"], "resume.pdf", { type: "application/pdf" }),
      fileKind: "pdf",
    });

    assert.deepEqual(result, { ok: false, code: "TIKA_AUTH_FAILED", status: 403 });
  });

  await t.test("fetch failure", async (t) => {
    setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
    const originalFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async () => {
      throw new TypeError("connect failed");
    };

    const result = await extractPlainTextWithTika({
      file: new File(["fake"], "resume.pdf", { type: "application/pdf" }),
      fileKind: "pdf",
    });

    assert.deepEqual(result, { ok: false, code: "TIKA_UNAVAILABLE" });
  });
});

test("web Tika timeout defaults to 20 seconds and allows explicit overrides", (t) => {
  deleteEnvForTest(t, "TIKA_TIMEOUT_MS");
  assert.equal(getTikaTimeoutMs(), 20_000);
  assert.equal(getTikaTimeoutMs(3_000), 3_000);
});

test("extractTextFromResumeFile returns kind and text on success and forwards request id", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
  let seenHeaders: Headers | null = null;
  globalThis.fetch = async (_url, init) => {
    seenHeaders = new Headers(init?.headers);
    return new Response("Readable resume text with enough length", { status: 200 });
  };

  const result = await extractTextFromResumeFile(
    new File(["fake"], "resume.docx", { type: "application/msword" }),
    "req-from-route",
  );

  assert.deepEqual(result, { ok: true, kind: "docx", text: "Readable resume text with enough length" });
  assert.equal(seenHeaders?.get("x-hiiire-request-id"), "req-from-route");
  assert.equal(seenHeaders?.get("x-hiiire-file-kind"), "docx");
  assert.equal(
    seenHeaders?.get("content-type"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
});

test("extractPlainTextWithTika sends auth token, request id, and file kind when configured", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
  setEnvForTest(t, "TIKA_AUTH_TOKEN", "secret-token");
  let seenHeaders: Headers | null = null;
  globalThis.fetch = async (_url, init) => {
    seenHeaders = new Headers(init?.headers);
    return new Response("Readable resume text with enough length", { status: 200 });
  };

  const result = await extractPlainTextWithTika({
    file: new File(["fake"], "resume.pdf", { type: "application/pdf" }),
    requestId: "req-123",
    fileKind: "pdf",
  });

  assert.deepEqual(result, { ok: true, text: "Readable resume text with enough length" });
  assert.equal(seenHeaders?.get("authorization"), "Bearer secret-token");
  assert.equal(seenHeaders?.get("x-hiiire-request-id"), "req-123");
  assert.equal(seenHeaders?.get("x-hiiire-file-kind"), "pdf");
});

test("extractPlainTextWithTika uses the safe file-kind content type over a wrong browser MIME", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");
  let seenHeaders: Headers | null = null;
  globalThis.fetch = async (_url, init) => {
    seenHeaders = new Headers(init?.headers);
    return new Response("Readable resume text with enough length", { status: 200 });
  };

  const result = await extractPlainTextWithTika({
    file: new File(["fake"], "resume.docx", { type: "application/msword" }),
    fileKind: "docx",
  });

  assert.deepEqual(result, { ok: true, text: "Readable resume text with enough length" });
  assert.equal(
    seenHeaders?.get("content-type"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
});

test("extractPlainTextWithTika maps HTTP 408 and 504 responses to TIKA_TIMEOUT", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  setEnvForTest(t, "TIKA_BASE_URL", "https://tika.example.test");

  for (const status of [408, 504]) {
    globalThis.fetch = async () => new Response("timeout", { status });

    const result = await extractPlainTextWithTika({
      file: new File(["fake"], "resume.pdf", { type: "application/pdf" }),
      fileKind: "pdf",
    });

    assert.deepEqual(result, { ok: false, code: "TIKA_TIMEOUT", status });
  }
});
