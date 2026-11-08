import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { z } from "zod";
import { createHash } from "node:crypto";

import {
  contentTypeForKind,
  defaultFileNameForKind,
  detectResumeFileKind,
  MAX_RESUME_FILE_SIZE_BYTES,
  MAX_RESUME_TEXT_CHARS,
  MAX_RESUME_WORDS,
} from "../lib/resume/extract-text.ts";

type ExtractResult =
  | { ok: true; kind: "pdf" | "doc" | "docx" | "txt"; text: string }
  | { ok: false; code: string };

type Harness = {
  POST: (req: Request) => Promise<Response>;
  state: {
    businessEvents: Array<{ event: string; properties?: Record<string, unknown> }>;
    consoleWarnings: unknown[];
    contactExtractionCalls: string[];
    contactInserts: unknown[];
    contactReads: number;
    candidateUpdates: unknown[];
    usageEvents: unknown[];
    parserInputs: Array<{ resumeText: string; deadlineAt?: number }>;
    pipelineEventInserts: unknown[];
    extractionCalls: Array<{ file: File; requestId?: string }>;
    planLoads: string[];
    rpcCalls: Array<Record<string, unknown>>;
    sideEffectLog: string[];
    storageUploads: Array<{ path: string; file: File; options: { contentType?: string; upsert?: boolean } }>;
    vacancyAccessCalls: string[];
  };
};

type DesiredSalary = { text: string | null; amount: number | null; currency: string | null; source: string | null };

const emptyDesiredSalary: DesiredSalary = { text: null, amount: null, currency: null, source: null };

function loadCandidateRouteHarness(options: {
  candidateCreateError?: unknown;
  candidateCreateRaw?: unknown;
  extractTextFromResumeFile: (file: File, requestId?: string) => Promise<ExtractResult>;
  aiAllowed?: boolean;
  contacts?: Array<{ type: string; value: string; label?: string | null }>;
  contactReadError?: unknown;
  nodeEnv?: string;
  idempotencyLookupRow?: Record<string, unknown> | null;
  parserProfile?: {
    name: string;
    position: string;
    contacts: Array<{ type: string; value: string; label?: string | null }>;
    desiredSalary?: DesiredSalary;
    meta?: Record<string, unknown>;
  };
  planSnapshot?: Record<string, unknown> | null;
  storageUploadError?: unknown;
  vacancyAccessResult?: { ok: false; response: Response };
}): Harness {
  let source = readFileSync("app/api/candidates/route.ts", "utf8");
  source = source.replace(/^import[\s\S]*?from "@\/lib\/resume\/extract-text";\r?\n/m, "");
  source = source.replace(/^import .+;\r?\n/gm, "");
  source = source.replace(/export const runtime/g, "const runtime");
  source = source.replace(/export const maxDuration/g, "const maxDuration");
  source = source.replace(/export async function POST/g, "async function POST");

  const stripped = stripTypeScriptTypes(source, { mode: "strip" });
  const script = new vm.Script(`${stripped}\n;({ POST });`, { filename: "app/api/candidates/route.ts" });
  const state: Harness["state"] = {
    businessEvents: [],
    consoleWarnings: [],
    contactExtractionCalls: [],
    contactInserts: [],
    contactReads: 0,
    candidateUpdates: [],
    usageEvents: [],
    parserInputs: [],
    pipelineEventInserts: [],
    extractionCalls: [],
    planLoads: [],
    rpcCalls: [],
    sideEffectLog: [],
    storageUploads: [],
    vacancyAccessCalls: [],
  };
  const defaultRaw = {
    responseStatus: 201,
    responseBody: { candidateId: "11111111-1111-4111-8111-111111111111", jobId: "22222222-2222-4222-8222-222222222222" },
    candidateId: "11111111-1111-4111-8111-111111111111",
    jobId: "22222222-2222-4222-8222-222222222222",
    replayed: false,
  };

  const admin = {
    from(table: string) {
      if (table === "candidate_contacts") {
        return {
          select() {
            return {
              eq: async () => {
                state.sideEffectLog.push("contact:read");
                state.contactReads += 1;
                return { data: [], error: options.contactReadError ?? null };
              },
            };
          },
          insert: async (payload: unknown) => {
            state.sideEffectLog.push("contact:insert");
            state.contactInserts.push(payload);
            return { error: null };
          },
        };
      }

      if (table === "api_idempotency_keys") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: options.idempotencyLookupRow ?? null, error: null }),
                };
              },
            };
          },
        };
      }

      if (table === "candidates") {
        return {
          update(payload: unknown) {
            return {
              eq: async () => {
                state.sideEffectLog.push("candidate:update");
                state.candidateUpdates.push(payload);
                return { error: null };
              },
            };
          },
        };
      }

      if (table === "pipeline_events") {
        return {
          insert: async (payload: unknown) => {
            state.sideEffectLog.push("pipeline:event");
            state.pipelineEventInserts.push(payload);
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async (_name: string, payload: Record<string, unknown>) => {
      state.sideEffectLog.push(`rpc:${_name}`);
      state.rpcCalls.push(payload);
      return { data: options.candidateCreateRaw ?? defaultRaw, error: options.candidateCreateError ?? null };
    },
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "resumes");
        return {
          upload: async (path: string, file: File, uploadOptions: { contentType?: string; upsert?: boolean }) => {
            state.sideEffectLog.push("storage:upload");
            state.storageUploads.push({ path, file, options: uploadOptions });
            return { error: options.storageUploadError ?? null };
          },
        };
      },
    },
  };

  const sandbox = {
    Buffer,
    File,
    Request,
    Response,
    URL,
    console: {
      ...console,
      warn: (...args: unknown[]) => {
        state.consoleWarnings.push(args);
      },
    },
    process: { env: { NODE_ENV: options.nodeEnv ?? "production" } },
    setTimeout,
    clearTimeout,
    createHash,
    randomUUID: () => "33333333-3333-4333-8333-333333333333",
    z,
    NextResponse: {
      json(body: unknown, init?: ResponseInit) {
        return Response.json(body, init);
      },
    },
    requireSameOriginRequest: (req: Request) => {
      const origin = req.headers.get("origin");
      return origin === "https://hiiire.test"
        ? { ok: true as const }
        : {
            ok: false as const,
            response: Response.json(
              { error: "CSRF_ORIGIN_MISMATCH", message: "Обновите страницу и попробуйте ещё раз." },
              { status: 403 }
            ),
          };
    },
    captureBusinessEvent: async (input: { event: string; properties?: Record<string, unknown> }) => {
      state.sideEffectLog.push(`event:${input.event}`);
      state.businessEvents.push(input);
    },
    isAiAllowed: () => options.aiAllowed ?? true,
    loadCompanyPlanSnapshot: async (_admin: unknown, companyId: string) => {
      state.sideEffectLog.push("plan:load");
      state.planLoads.push(companyId);
      return "planSnapshot" in options ? options.planSnapshot : { status: "active" };
    },
    createSupabaseServerClient: async () => ({}),
    getSupabaseAdminClient: () => admin,
    extractCandidateContactsFromText: (text: string) => {
      state.sideEffectLog.push("contact:extract");
      state.contactExtractionCalls.push(text);
      return options.contacts ?? [];
    },
    requireCompanyContext: async () => ({
      ok: true,
      data: {
        userId: "user-1",
        email: "hr@example.test",
        companyId: "company-1",
        role: "admin",
      },
    }),
    requireVacancyAccess: async (_admin: unknown, _ctx: unknown, vacancyId: string) => {
      state.vacancyAccessCalls.push(vacancyId);
      if (options.vacancyAccessResult) {
        return options.vacancyAccessResult;
      }

      return {
        ok: true,
        data: { vacancy: { id: vacancyId, companyId: "company-1", createdById: "user-1" } },
      };
    },
    buildCandidateCreateRequestHash: () => "request-hash",
    parseCandidateProfileFromResumeText: async (input: { resumeText: string; deadlineAt?: number }) => {
      state.sideEffectLog.push("parser:profile");
      state.parserInputs.push({ resumeText: input.resumeText, deadlineAt: input.deadlineAt });
      state.contactExtractionCalls.push(input.resumeText);
      if (options.parserProfile) {
        return {
          desiredSalary: emptyDesiredSalary,
          ...options.parserProfile,
          meta: {
            source: "deepseek",
            model: "deepseek-v4-flash",
            fallbackReason: null,
            attempts: 1,
            tokensInTotal: 10,
            tokensOutTotal: 5,
            durationMs: 123,
            ...(options.parserProfile.meta ?? {}),
          },
        };
      }
      const lines = input.resumeText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      return {
        name: lines[0] ?? "Кандидат",
        position: lines[1] ?? "Кандидат",
        contacts: options.contacts ?? [],
        desiredSalary: emptyDesiredSalary,
        meta: {
          source: "deepseek",
          model: "deepseek-v4-flash",
          fallbackReason: null,
          attempts: 1,
          tokensInTotal: 10,
          tokensOutTotal: 5,
          durationMs: 123,
        },
      };
    },
    withKeyedMutex: async (_key: string, fn: () => Promise<Response>) => fn(),
    recordAiUsageEventBestEffort: async (_admin: unknown, input: unknown) => {
      state.sideEffectLog.push("usage:record");
      state.usageEvents.push(input);
    },
    contentTypeForKind,
    defaultFileNameForKind,
    detectResumeFileKind,
    extractTextFromResumeFile: async (file: File, requestId?: string) => {
      state.extractionCalls.push({ file, requestId });
      return options.extractTextFromResumeFile(file, requestId);
    },
    MAX_RESUME_FILE_SIZE_BYTES,
    MAX_RESUME_TEXT_CHARS,
    MAX_RESUME_WORDS,
  };
  const result = script.runInNewContext(sandbox) as { POST: Harness["POST"] };

  return { POST: result.POST, state };
}

function multipartCandidateRequest(input?: {
  file?: File;
  saveResumeFile?: boolean;
  skipAiAnalysis?: boolean;
  idempotencyKey?: string;
}): Request {
  const fd = new FormData();
  fd.set("vacancyId", "vacancy-1");
  fd.set("source", "manual");
  if (input?.saveResumeFile) fd.set("saveResumeFile", "true");
  if (input?.skipAiAnalysis) fd.set("skipAiAnalysis", "true");
  fd.set("resumeFile", input?.file ?? new File(["fake"], "resume.doc", { type: "application/msword" }));

  return new Request("https://hiiire.test/api/candidates", {
    method: "POST",
    headers: {
      Origin: "https://hiiire.test",
      ...(input?.idempotencyKey ? { "X-Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: fd,
  });
}

function jsonCandidateRequest(input?: {
  resumeText?: string;
  source?: "manual" | "hh.ru" | "referral" | "other";
  skipAiAnalysis?: boolean;
  idempotencyKey?: string;
}): Request {
  return new Request("https://hiiire.test/api/candidates", {
    method: "POST",
    headers: {
      Origin: "https://hiiire.test",
      "Content-Type": "application/json",
      ...(input?.idempotencyKey ? { "X-Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      vacancyId: "vacancy-1",
      resumeText: input?.resumeText ?? "Иван Иванов\nSenior engineer\nivan@example.test",
      source: input?.source ?? "manual",
      skipAiAnalysis: input?.skipAiAnalysis ?? false,
    }),
  });
}

function businessEventNames(harness: Harness): string[] {
  return harness.state.businessEvents.map((event) => event.event);
}

function assertLogIncludes(log: string[], label: string) {
  assert.notEqual(log.indexOf(label), -1, `Expected side effect log to include ${label}`);
}

function assertLogOmits(log: string[], label: string) {
  assert.equal(log.indexOf(label), -1, `Expected side effect log to omit ${label}`);
}

function assertLogOrder(log: string[], before: string, after: string) {
  const beforeIndex = log.indexOf(before);
  const afterIndex = log.indexOf(after);

  assert.notEqual(beforeIndex, -1, `Expected side effect log to include ${before}`);
  assert.notEqual(afterIndex, -1, `Expected side effect log to include ${after}`);
  assert.ok(beforeIndex < afterIndex, `Expected ${before} before ${after}`);
}

function assertLastSideEffect(log: string[], label: string) {
  assertLogIncludes(log, label);
  assert.equal(log.lastIndexOf(label), log.length - 1, `Expected ${label} to be the final side effect`);
}

async function assertSafeInvalidCandidateBodyResponse(response: Response) {
  const body = await response.json();
  const bodyText = JSON.stringify(body);

  assert.equal(response.status, 400);
  assert.equal(body.error, "INVALID_BODY");
  assert.equal(body.message, "Проверьте данные кандидата и попробуйте ещё раз.");
  assert.doesNotMatch(bodyText, /resumeText|Too small|expected|path|boundary|multipart|parser|unexpected|internal|error:|\[[^\]]*"[^"]+"[^\]]*\]/i);
}

test("invalid multipart candidate body returns safe user-facing validation copy", async () => {
  const harness = loadCandidateRouteHarness({
    extractTextFromResumeFile: async () => ({ ok: true, kind: "txt", text: "Readable resume text" }),
  });
  const fd = new FormData();
  fd.set("vacancyId", "");
  fd.set("resumeText", "x".repeat(MAX_RESUME_TEXT_CHARS + 1));
  fd.set("resumeFile", new File(["fake"], "resume.txt", { type: "text/plain" }));

  const response = await harness.POST(
    new Request("https://hiiire.test/api/candidates", {
      method: "POST",
      headers: { Origin: "https://hiiire.test" },
      body: fd,
    }),
  );

  await assertSafeInvalidCandidateBodyResponse(response);
  assert.equal(harness.state.extractionCalls.length, 0);
  assert.equal(harness.state.rpcCalls.length, 0);
});

test("invalid JSON candidate body returns safe user-facing validation copy", async () => {
  const harness = loadCandidateRouteHarness({
    extractTextFromResumeFile: async () => ({ ok: true, kind: "txt", text: "Readable resume text" }),
  });

  const response = await harness.POST(
    new Request("https://hiiire.test/api/candidates", {
      method: "POST",
      headers: { Origin: "https://hiiire.test", "Content-Type": "application/json" },
      body: JSON.stringify({ vacancyId: "", resumeText: "short" }),
    }),
  );

  await assertSafeInvalidCandidateBodyResponse(response);
  assert.equal(harness.state.vacancyAccessCalls.length, 0);
  assert.equal(harness.state.rpcCalls.length, 0);
});

test("malformed multipart candidate body returns safe invalid-body response", async () => {
  const harness = loadCandidateRouteHarness({
    extractTextFromResumeFile: async () => ({ ok: true, kind: "txt", text: "Readable resume text" }),
  });

  const response = await harness.POST(
    new Request("https://hiiire.test/api/candidates", {
      method: "POST",
      headers: {
        Origin: "https://hiiire.test",
        "Content-Type": "multipart/form-data; boundary=broken-boundary",
      },
      body: "--different-boundary\r\nContent-Disposition: form-data; name=\"vacancyId\"\r\n\r\nvacancy-1\r\n",
    }),
  );

  await assertSafeInvalidCandidateBodyResponse(response);
  assert.equal(harness.state.vacancyAccessCalls.length, 0);
  assert.equal(harness.state.extractionCalls.length, 0);
  assert.equal(harness.state.businessEvents.length, 0);
  assert.equal(harness.state.rpcCalls.length, 0);
});

test("candidate create without Origin is rejected by same-origin guard", async () => {
  const harness = loadCandidateRouteHarness({
    extractTextFromResumeFile: async () => ({ ok: true, kind: "txt", text: "Readable resume text" }),
  });

  const response = await harness.POST(
    new Request("https://hiiire.test/api/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vacancyId: "", resumeText: "short" }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(body, {
    error: "CSRF_ORIGIN_MISMATCH",
    message: "Обновите страницу и попробуйте ещё раз.",
  });
  assert.equal(harness.state.vacancyAccessCalls.length, 0);
  assert.equal(harness.state.rpcCalls.length, 0);
});

test("vacancy access failure stops multipart candidate create before extraction and extraction telemetry", async () => {
  const harness = loadCandidateRouteHarness({
    vacancyAccessResult: { ok: false, response: Response.json({ error: "FORBIDDEN" }, { status: 403 }) },
    extractTextFromResumeFile: async () => ({ ok: true, kind: "txt", text: "Readable resume text" }),
  });

  const response = await harness.POST(multipartCandidateRequest());
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(body, { error: "FORBIDDEN" });
  assert.deepEqual(harness.state.vacancyAccessCalls, ["vacancy-1"]);
  assert.equal(harness.state.extractionCalls.length, 0);
  assert.equal(harness.state.businessEvents.length, 0);
  assert.equal(harness.state.rpcCalls.length, 0);
});

test("resume extraction and validation failures stop before candidate business side effects", async (t) => {
  const cases: Array<{
    name: string;
    file: File;
    extractionResult: ExtractResult;
    expectedError: string;
    extractionCalled: boolean;
    expectedBusinessEvents: string[];
    expectedVacancyAccessCalls: string[];
  }> = [
    {
      name: "Tika parse failure",
      file: new File(["fake"], "resume.doc", { type: "application/msword" }),
      extractionResult: { ok: false, code: "RESUME_FILE_PARSE_FAILED" },
      expectedError: "RESUME_FILE_PARSE_FAILED",
      extractionCalled: true,
      expectedBusinessEvents: ["resume_extraction_failed"],
      expectedVacancyAccessCalls: ["vacancy-1"],
    },
    {
      name: "Tika missing configuration",
      file: new File(["fake"], "resume.doc", { type: "application/msword" }),
      extractionResult: { ok: false, code: "RESUME_EXTRACTION_TIKA_NOT_CONFIGURED" },
      expectedError: "RESUME_EXTRACTION_TIKA_NOT_CONFIGURED",
      extractionCalled: true,
      expectedBusinessEvents: ["resume_extraction_failed"],
      expectedVacancyAccessCalls: ["vacancy-1"],
    },
    {
      name: "Tika auth failure",
      file: new File(["fake"], "resume.doc", { type: "application/msword" }),
      extractionResult: { ok: false, code: "RESUME_EXTRACTION_TIKA_AUTH_FAILED" },
      expectedError: "RESUME_EXTRACTION_TIKA_AUTH_FAILED",
      extractionCalled: true,
      expectedBusinessEvents: ["resume_extraction_failed"],
      expectedVacancyAccessCalls: ["vacancy-1"],
    },
    {
      name: "Tika service unavailable",
      file: new File(["fake"], "resume.doc", { type: "application/msword" }),
      extractionResult: { ok: false, code: "RESUME_EXTRACTION_TIKA_UNAVAILABLE" },
      expectedError: "RESUME_EXTRACTION_TIKA_UNAVAILABLE",
      extractionCalled: true,
      expectedBusinessEvents: ["resume_extraction_failed"],
      expectedVacancyAccessCalls: ["vacancy-1"],
    },
    {
      name: "extracted text exceeds business limit",
      file: new File(["fake"], "resume.doc", { type: "application/msword" }),
      extractionResult: { ok: false, code: "RESUME_TEXT_TOO_LONG" },
      expectedError: "RESUME_TEXT_TOO_LONG",
      extractionCalled: true,
      expectedBusinessEvents: ["resume_extraction_failed"],
      expectedVacancyAccessCalls: ["vacancy-1"],
    },
    {
      name: "unsupported file type",
      file: new File(["fake"], "resume.png", { type: "image/png" }),
      extractionResult: { ok: true, kind: "txt", text: "should not be extracted" },
      expectedError: "RESUME_FILE_UNSUPPORTED_TYPE",
      extractionCalled: false,
      expectedBusinessEvents: [],
      expectedVacancyAccessCalls: [],
    },
    {
      name: "file larger than upload limit",
      file: new File([new Uint8Array(MAX_RESUME_FILE_SIZE_BYTES + 1)], "resume.doc", {
        type: "application/msword",
      }),
      extractionResult: { ok: true, kind: "doc", text: "should not be extracted" },
      expectedError: "RESUME_FILE_TOO_LARGE",
      extractionCalled: false,
      expectedBusinessEvents: [],
      expectedVacancyAccessCalls: [],
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const harness = loadCandidateRouteHarness({
        extractTextFromResumeFile: async () => testCase.extractionResult,
      });

      const response = await harness.POST(multipartCandidateRequest({ file: testCase.file, saveResumeFile: true }));
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.error, testCase.expectedError);
      assert.equal(harness.state.extractionCalls.length, testCase.extractionCalled ? 1 : 0);
      assert.equal(harness.state.rpcCalls.length, 0);
      assert.equal(harness.state.pipelineEventInserts.length, 0);
      assert.equal(harness.state.storageUploads.length, 0);
      assert.equal(harness.state.candidateUpdates.length, 0);
      assert.equal(harness.state.contactExtractionCalls.length, 0);
      assert.equal(harness.state.contactReads, 0);
      assert.equal(harness.state.contactInserts.length, 0);
      assert.deepEqual(harness.state.planLoads, []);
      assert.deepEqual(harness.state.vacancyAccessCalls, testCase.expectedVacancyAccessCalls);
      assert.deepEqual(businessEventNames(harness), testCase.expectedBusinessEvents);
      if (testCase.expectedBusinessEvents.includes("resume_extraction_failed")) {
        assert.equal(harness.state.businessEvents[0]?.properties?.result_code, testCase.expectedError);
        assert.equal(harness.state.businessEvents[0]?.properties?.error_kind, testCase.expectedError);
      }
      assert.equal(harness.state.businessEvents.some((event) => event.event === "ai_analysis_started"), false);
    });
  }
});

test("successful extraction preserves candidate create, idempotency, storage, contacts, and AI telemetry flow", async () => {
  const uploadedFile = new File(["fake"], "resume.doc", { type: "application/msword" });
  const extractedText = "Иван Иванов\nSenior engineer\nperson@example.test";
  const harness = loadCandidateRouteHarness({
    contacts: [{ type: "email", value: "person@example.test", label: "Email" }],
    extractTextFromResumeFile: async () => ({
      ok: true,
      kind: "doc",
      text: extractedText,
    }),
  });

  const response = await harness.POST(
    multipartCandidateRequest({ file: uploadedFile, saveResumeFile: true, idempotencyKey: "candidate-create-key" }),
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.candidateId, "11111111-1111-4111-8111-111111111111");
  assert.equal(harness.state.extractionCalls.length, 1);
  assert.deepEqual(harness.state.contactExtractionCalls, [extractedText]);
  assert.equal(harness.state.rpcCalls.length, 1);
  assert.equal(harness.state.rpcCalls[0].p_key, "candidate-create-key");
  assert.equal(harness.state.rpcCalls[0].p_resume_text, extractedText);
  assert.equal(harness.state.rpcCalls[0].p_mode, "enqueue");
  assert.equal(harness.state.pipelineEventInserts.length, 1);
  const pipelineEvent = harness.state.pipelineEventInserts[0] as {
    company_id?: string;
    candidate_id?: string;
    vacancy_id?: string;
    actor_id?: string;
    from_status?: string | null;
    to_status?: string;
    event_type?: string;
    occurred_at?: string;
    metadata?: { source?: string; mode?: string; route?: string };
  };
  assert.equal(pipelineEvent.company_id, "company-1");
  assert.equal(pipelineEvent.candidate_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(pipelineEvent.vacancy_id, "vacancy-1");
  assert.equal(pipelineEvent.actor_id, "user-1");
  assert.equal(pipelineEvent.from_status, null);
  assert.equal(pipelineEvent.to_status, "new");
  assert.equal(pipelineEvent.event_type, "candidate_created");
  assert.equal(typeof pipelineEvent.occurred_at, "string");
  assert.equal(pipelineEvent.metadata?.source, "manual");
  assert.equal(pipelineEvent.metadata?.mode, "enqueue");
  assert.equal(pipelineEvent.metadata?.route, "api_candidates");
  assert.equal(harness.state.storageUploads.length, 1);
  assert.strictEqual(harness.state.extractionCalls[0].file, harness.state.storageUploads[0].file);
  assert.match(harness.state.storageUploads[0].path, /\.doc$/);
  assert.doesNotMatch(harness.state.storageUploads[0].path, /resume\.doc/i);
  assert.equal(harness.state.storageUploads[0].file.name, "resume.doc");
  assert.equal(harness.state.storageUploads[0].options.contentType, "application/msword");
  const metadata = harness.state.candidateUpdates[0] as {
    resume_url?: string;
    resume_file_name?: string;
    resume_file_size?: number;
  };
  assert.equal(metadata.resume_url, `resumes/${harness.state.storageUploads[0].path}`);
  assert.equal(metadata.resume_file_name, "resume.doc");
  assert.equal(metadata.resume_file_size, 4);
  assert.equal(harness.state.contactReads, 1);
  assert.equal(harness.state.contactInserts.length, 1);
  const insertedContacts = harness.state.contactInserts[0] as Array<{
    candidate_id?: string;
    type?: string;
    value?: string;
    label?: string | null;
  }>;
  assert.equal(insertedContacts.length, 1);
  assert.equal(insertedContacts[0].candidate_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(insertedContacts[0].type, "email");
  assert.equal(insertedContacts[0].value, "person@example.test");
  assert.equal(insertedContacts[0].label, "Email");
  const sideEffectLog = harness.state.sideEffectLog;
  assertLogOrder(sideEffectLog, "plan:load", "rpc:create_candidate_with_idempotency");
  assertLogOrder(sideEffectLog, "rpc:create_candidate_with_idempotency", "pipeline:event");
  assertLogOrder(sideEffectLog, "pipeline:event", "event:candidate_added");
  assertLogOrder(sideEffectLog, "event:candidate_added", "event:ai_analysis_started");
  assertLogOrder(sideEffectLog, "contact:read", "contact:insert");
  assertLogOrder(sideEffectLog, "storage:upload", "candidate:update");
  assert.deepEqual(businessEventNames(harness), [
    "resume_extraction_completed",
    "candidate_added",
    "ai_analysis_started",
  ]);
});

test("successful parser output does not merge route regex basics or contacts", async () => {
  const extractedText = [
    "Иван Иванов",
    "Senior engineer",
    "Email: regex@example.test",
    "Phone: +7 999 111-22-33",
    "Telegram: regex_handle",
  ].join("\n");
  const harness = loadCandidateRouteHarness({
    parserProfile: {
      name: "Кандидат",
      position: "Кандидат",
      contacts: [],
    },
    extractTextFromResumeFile: async () => ({ ok: true, kind: "doc", text: extractedText }),
  });

  const response = await harness.POST(multipartCandidateRequest());
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.candidateId, "11111111-1111-4111-8111-111111111111");
  assert.equal(harness.state.rpcCalls.length, 1);
  assert.equal(harness.state.rpcCalls[0].p_name, "Кандидат");
  assert.equal(harness.state.rpcCalls[0].p_position, "Кандидат");
  assert.deepEqual(harness.state.contactExtractionCalls, [extractedText]);
  assert.equal(harness.state.contactReads, 0);
  assert.equal(harness.state.contactInserts.length, 0);
  assert.equal(harness.state.usageEvents.length, 1);
  assert.equal((harness.state.usageEvents[0] as { status?: string }).status, "success");
});

test("manual JSON candidate create uses parser output and route-owned parser deadline", async () => {
  const harness = loadCandidateRouteHarness({
    extractTextFromResumeFile: async () => {
      throw new Error("manual json must not extract files");
    },
    parserProfile: {
      name: "Мария Смирнова",
      position: "Product Designer",
      contacts: [{ type: "telegram", value: "@maria", label: null }],
    },
  });

  const before = Date.now();
  const response = await harness.POST(
    jsonCandidateRequest({ resumeText: "Мария Смирнова\nProduct Designer\nTelegram: maria" }),
  );
  const after = Date.now();
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.candidateId, "11111111-1111-4111-8111-111111111111");
  assert.equal(harness.state.extractionCalls.length, 0);
  assert.equal(harness.state.parserInputs.length, 1);
  assert.equal(harness.state.parserInputs[0].resumeText, "Мария Смирнова\nProduct Designer\nTelegram: maria");
  assert.equal(typeof harness.state.parserInputs[0].deadlineAt, "number");
  assert.ok((harness.state.parserInputs[0].deadlineAt ?? 0) >= before + 26_000);
  assert.ok((harness.state.parserInputs[0].deadlineAt ?? 0) <= after + 27_000);
  assert.equal(harness.state.rpcCalls[0].p_name, "Мария Смирнова");
  assert.equal(harness.state.rpcCalls[0].p_position, "Product Designer");
  assert.equal(harness.state.contactInserts.length, 1);
  assert.equal(harness.state.usageEvents.length, 1);
});

test("manual JSON candidate create saves desired salary from parser profile only", async () => {
  const harness = loadCandidateRouteHarness({
    candidateCreateRaw: {
      responseStatus: 200,
      responseBody: {
        candidateId: "11111111-1111-4111-8111-111111111111",
        jobId: "22222222-2222-4222-8222-222222222222",
      },
      candidateId: "11111111-1111-4111-8111-111111111111",
      jobId: "22222222-2222-4222-8222-222222222222",
      replayed: false,
    },
    extractTextFromResumeFile: async () => {
      throw new Error("manual json must not extract files");
    },
    parserProfile: {
      name: "Мария Смирнова",
      position: "Product Designer",
      contacts: [],
      desiredSalary: { text: "250 000 RUB", amount: 250000, currency: "RUB", source: "ai_parser" },
    },
  });

  const response = await harness.POST(
    jsonCandidateRequest({
      resumeText: [
        "Мария Смирнова",
        "Product Designer",
        "Ожидаемая зарплата: 999 000 ₽",
        "Portfolio: https://example.test",
      ].join("\n"),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(harness.state.rpcCalls.length, 1);
  assert.equal(harness.state.rpcCalls[0].p_desired_salary_text, "250 000 RUB");
  assert.equal(harness.state.rpcCalls[0].p_desired_salary_amount, 250000);
  assert.equal(harness.state.rpcCalls[0].p_desired_salary_currency, "RUB");
  assert.equal(harness.state.rpcCalls[0].p_desired_salary_source, "ai_parser");

  const routeSource = readFileSync("app/api/candidates/route.ts", "utf8");
  assert.doesNotMatch(routeSource, /\b(?:extractDesiredSalaryFromText|extractDesiredSalaryText)\b/);
});

test("idempotency in-progress and reused-key conflicts stop before parser spend", async (t) => {
  await t.test("in-progress request", async () => {
    const harness = loadCandidateRouteHarness({
      idempotencyLookupRow: {
        operation: "candidate_create",
        user_id: "user-1",
        company_id: "company-1",
        request_hash: "request-hash",
        status: "in_progress",
      },
      extractTextFromResumeFile: async () => {
        throw new Error("manual json must not extract files");
      },
    });

    const response = await harness.POST(jsonCandidateRequest({ idempotencyKey: "same-key" }));
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.error, "IDEMPOTENCY_REQUEST_IN_PROGRESS");
    assert.equal(harness.state.parserInputs.length, 0);
    assert.equal(harness.state.rpcCalls.length, 0);
    assert.equal(harness.state.usageEvents.length, 0);
  });

  await t.test("reused key with different request", async () => {
    const harness = loadCandidateRouteHarness({
      idempotencyLookupRow: {
        operation: "candidate_create",
        user_id: "user-1",
        company_id: "company-1",
        request_hash: "different-request-hash",
        status: "completed",
        response_status: 201,
        response_body: { candidateId: "other" },
      },
      extractTextFromResumeFile: async () => {
        throw new Error("manual json must not extract files");
      },
    });

    const response = await harness.POST(jsonCandidateRequest({ idempotencyKey: "same-key" }));
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.error, "IDEMPOTENCY_KEY_REUSED");
    assert.equal(harness.state.parserInputs.length, 0);
    assert.equal(harness.state.rpcCalls.length, 0);
    assert.equal(harness.state.usageEvents.length, 0);
  });
});

test("skip AI analysis request creates candidate in skip mode without AI telemetry", async () => {
  const extractedText = "Иван Иванов\nSenior engineer\nperson@example.test";
  const harness = loadCandidateRouteHarness({
    extractTextFromResumeFile: async () => ({ ok: true, kind: "doc", text: extractedText }),
  });

  const response = await harness.POST(multipartCandidateRequest({ skipAiAnalysis: true }));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.candidateId, "11111111-1111-4111-8111-111111111111");
  assert.equal(harness.state.rpcCalls.length, 1);
  assert.equal(harness.state.rpcCalls[0].p_mode, "skip_ai_analysis");
  assert.equal(harness.state.pipelineEventInserts.length, 1);
  assert.deepEqual(harness.state.planLoads, []);
  assert.deepEqual(harness.state.contactExtractionCalls, [extractedText]);
  assert.equal(harness.state.contactReads, 0);
  assert.equal(harness.state.contactInserts.length, 0);
  assert.equal(harness.state.storageUploads.length, 0);
  assert.equal(harness.state.candidateUpdates.length, 0);
  assert.deepEqual(businessEventNames(harness), ["resume_extraction_completed", "candidate_added"]);
  assertLogOmits(harness.state.sideEffectLog, "event:ai_analysis_started");
});

test("inactive or disallowed plan creates candidate in subscription inactive mode without AI telemetry", async () => {
  const extractedText = "Иван Иванов\nSenior engineer\nperson@example.test";
  const harness = loadCandidateRouteHarness({
    aiAllowed: false,
    planSnapshot: { status: "inactive" },
    extractTextFromResumeFile: async () => ({ ok: true, kind: "doc", text: extractedText }),
  });

  const response = await harness.POST(multipartCandidateRequest());
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.candidateId, "11111111-1111-4111-8111-111111111111");
  assert.equal(harness.state.rpcCalls.length, 1);
  assert.equal(harness.state.rpcCalls[0].p_mode, "subscription_inactive");
  assert.equal(harness.state.pipelineEventInserts.length, 1);
  assert.deepEqual(harness.state.planLoads, ["company-1"]);
  assertLogOrder(harness.state.sideEffectLog, "plan:load", "rpc:create_candidate_with_idempotency");
  assert.deepEqual(harness.state.contactExtractionCalls, [extractedText]);
  assert.equal(harness.state.contactReads, 0);
  assert.equal(harness.state.contactInserts.length, 0);
  assert.equal(harness.state.storageUploads.length, 0);
  assert.equal(harness.state.candidateUpdates.length, 0);
  assert.deepEqual(businessEventNames(harness), ["resume_extraction_completed", "candidate_added"]);
  assertLogOmits(harness.state.sideEffectLog, "event:ai_analysis_started");
});

test("resume storage upload failure returns a candidate resume error without metadata update", async () => {
  const uploadedFile = new File(["fake"], "resume.doc", { type: "application/msword" });
  const extractedText = "Иван Иванов\nSenior engineer\nperson@example.test";
  const harness = loadCandidateRouteHarness({
    storageUploadError: { statusCode: 500, error: "upload failed" },
    contacts: [{ type: "email", value: "person@example.test", label: null }],
    extractTextFromResumeFile: async () => ({ ok: true, kind: "doc", text: extractedText }),
  });

  const response = await harness.POST(multipartCandidateRequest({ file: uploadedFile, saveResumeFile: true }));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: "CANDIDATE_RESUME_UPLOAD_FAILED",
    candidateId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(harness.state.rpcCalls.length, 1);
  assert.equal(harness.state.rpcCalls[0].p_mode, "enqueue");
  assert.equal(harness.state.pipelineEventInserts.length, 1);
  assert.deepEqual(harness.state.contactExtractionCalls, [extractedText]);
  assert.equal(harness.state.contactReads, 1);
  assert.equal(harness.state.contactInserts.length, 1);
  assert.equal(harness.state.storageUploads.length, 1);
  assert.equal(harness.state.storageUploads[0].file.name, uploadedFile.name);
  assert.equal(harness.state.storageUploads[0].file.size, uploadedFile.size);
  assert.equal(harness.state.candidateUpdates.length, 0);
  assert.deepEqual(businessEventNames(harness), [
    "resume_extraction_completed",
    "candidate_added",
    "ai_analysis_started",
  ]);
  assertLogOrder(harness.state.sideEffectLog, "plan:load", "rpc:create_candidate_with_idempotency");
  assertLogOrder(harness.state.sideEffectLog, "event:candidate_added", "event:ai_analysis_started");
  assertLogOrder(harness.state.sideEffectLog, "contact:read", "contact:insert");
  assertLogOrder(harness.state.sideEffectLog, "contact:insert", "storage:upload");
  assertLogIncludes(harness.state.sideEffectLog, "storage:upload");
  assertLogOmits(harness.state.sideEffectLog, "candidate:update");
});

test("idempotent replay preserves backfill side effects and skips duplicate candidate and AI telemetry", async () => {
  const harness = loadCandidateRouteHarness({
    candidateCreateRaw: {
      responseStatus: 200,
      responseBody: {
        candidateId: "11111111-1111-4111-8111-111111111111",
        jobId: "22222222-2222-4222-8222-222222222222",
      },
      candidateId: "11111111-1111-4111-8111-111111111111",
      jobId: "22222222-2222-4222-8222-222222222222",
      replayed: true,
    },
    contacts: [{ type: "email", value: "person@example.test", label: null }],
    extractTextFromResumeFile: async () => ({
      ok: true,
      kind: "doc",
      text: "Иван Иванов\nSenior engineer\nperson@example.test",
    }),
  });

  const response = await harness.POST(
    multipartCandidateRequest({ saveResumeFile: true, idempotencyKey: "candidate-create-key" }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.candidateId, "11111111-1111-4111-8111-111111111111");
  assert.equal(harness.state.rpcCalls.length, 1);
  assert.equal(harness.state.pipelineEventInserts.length, 0);
  assert.equal(harness.state.storageUploads.length, 1);
  assert.equal(harness.state.candidateUpdates.length, 1);
  assert.equal(harness.state.contactReads, 1);
  assert.equal(harness.state.contactInserts.length, 1);
  assert.deepEqual(harness.state.planLoads, ["company-1"]);
  assert.doesNotMatch(harness.state.storageUploads[0].path, /resume\.doc/i);
  assertLogOrder(harness.state.sideEffectLog, "plan:load", "rpc:create_candidate_with_idempotency");
  assertLogOrder(harness.state.sideEffectLog, "contact:read", "contact:insert");
  assertLogOrder(harness.state.sideEffectLog, "storage:upload", "candidate:update");
  assertLogOmits(harness.state.sideEffectLog, "event:candidate_added");
  assertLogOmits(harness.state.sideEffectLog, "event:ai_analysis_started");
  assert.deepEqual(businessEventNames(harness), ["resume_extraction_completed"]);
});

test("completed idempotent replay keeps stored response when resume storage backfill fails", async () => {
  const storedBody = {
    candidateId: "11111111-1111-4111-8111-111111111111",
    jobId: "22222222-2222-4222-8222-222222222222",
  };
  const harness = loadCandidateRouteHarness({
    idempotencyLookupRow: {
      operation: "candidate_create",
      user_id: "user-1",
      company_id: "company-1",
      request_hash: "request-hash",
      status: "completed",
      response_status: 201,
      response_body: storedBody,
      candidate_id: "11111111-1111-4111-8111-111111111111",
      job_id: "22222222-2222-4222-8222-222222222222",
    },
    contacts: [],
    storageUploadError: { statusCode: "500", message: "storage failed with resume PII" },
    extractTextFromResumeFile: async () => ({
      ok: true,
      kind: "doc",
      text: "Иван Иванов\nSenior engineer\nperson@example.test",
    }),
  });

  const response = await harness.POST(
    multipartCandidateRequest({ saveResumeFile: true, idempotencyKey: "candidate-create-key" }),
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(body, storedBody);
  assert.equal(harness.state.rpcCalls.length, 0);
  assert.equal(harness.state.pipelineEventInserts.length, 0);
  assert.equal(harness.state.storageUploads.length, 1);
  assert.equal(harness.state.candidateUpdates.length, 0);
  assert.deepEqual(businessEventNames(harness), ["resume_extraction_completed"]);
  assertLogIncludes(harness.state.sideEffectLog, "storage:upload");
  assertLogOmits(harness.state.sideEffectLog, "candidate:update");
});

test("completed idempotent replay keeps stored response when contact backfill read fails", async () => {
  const storedBody = {
    candidateId: "11111111-1111-4111-8111-111111111111",
    jobId: "22222222-2222-4222-8222-222222222222",
  };
  const harness = loadCandidateRouteHarness({
    idempotencyLookupRow: {
      operation: "candidate_create",
      user_id: "user-1",
      company_id: "company-1",
      request_hash: "request-hash",
      status: "completed",
      response_status: 201,
      response_body: storedBody,
      candidate_id: "11111111-1111-4111-8111-111111111111",
      job_id: "22222222-2222-4222-8222-222222222222",
    },
    contacts: [{ type: "email", value: "person@example.test", label: null }],
    contactReadError: { code: "XX000", message: "contact lookup failed" },
    extractTextFromResumeFile: async () => ({
      ok: true,
      kind: "doc",
      text: "Иван Иванов\nSenior engineer\nperson@example.test",
    }),
  });

  const response = await harness.POST(multipartCandidateRequest({ idempotencyKey: "candidate-create-key" }));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(body, storedBody);
  assert.equal(harness.state.rpcCalls.length, 0);
  assert.equal(harness.state.contactReads, 1);
  assert.equal(harness.state.contactInserts.length, 0);
  assert.equal(harness.state.usageEvents.length, 1);
});

test("candidate creation failure after extraction stops before storage and contact side effects", async () => {
  const harness = loadCandidateRouteHarness({
    candidateCreateError: { code: "XX000", message: "db failed" },
    contacts: [{ type: "email", value: "person@example.test", label: null }],
    extractTextFromResumeFile: async () => ({ ok: true, kind: "pdf", text: "Readable resume text with contact" }),
  });

  const response = await harness.POST(multipartCandidateRequest({ saveResumeFile: true }));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "CANDIDATE_CREATE_FAILED");
  assert.equal(harness.state.rpcCalls.length, 1);
  assert.equal(harness.state.pipelineEventInserts.length, 0);
  assert.equal(harness.state.storageUploads.length, 0);
  assert.equal(harness.state.candidateUpdates.length, 0);
  assert.equal(harness.state.contactReads, 0);
  assert.equal(harness.state.contactInserts.length, 0);
  assert.deepEqual(harness.state.planLoads, ["company-1"]);
  assert.deepEqual(businessEventNames(harness), ["resume_extraction_completed"]);
  assertLogOrder(harness.state.sideEffectLog, "plan:load", "rpc:create_candidate_with_idempotency");
  assertLogOrder(harness.state.sideEffectLog, "rpc:create_candidate_with_idempotency", "usage:record");
  assertLastSideEffect(harness.state.sideEffectLog, "usage:record");
  assertLogOmits(harness.state.sideEffectLog, "event:candidate_added");
  assertLogOmits(harness.state.sideEffectLog, "event:ai_analysis_started");
  assertLogOmits(harness.state.sideEffectLog, "contact:read");
  assertLogOmits(harness.state.sideEffectLog, "contact:insert");
  assertLogOmits(harness.state.sideEffectLog, "storage:upload");
  assertLogOmits(harness.state.sideEffectLog, "candidate:update");
});

test("candidate create failure after parser spend does not leak parser PII", async () => {
  const pii = {
    name: "Секретный Кандидат",
    position: "Secret Parser Position",
    contact: "secret.person@example.test",
    resume: "Raw resume secret text",
    prompt: "Ignore previous instructions",
    rawOutput: '{"name":"Секретный Кандидат"}',
  };
  const harness = loadCandidateRouteHarness({
    nodeEnv: "development",
    parserProfile: {
      name: pii.name,
      position: pii.position,
      contacts: [{ type: "email", value: pii.contact, label: "Email" }],
    },
    candidateCreateError: {
      code: "XX000",
      message: `${pii.name} ${pii.position} ${pii.contact} ${pii.resume} ${pii.prompt} ${pii.rawOutput}`,
      details: `${pii.name} ${pii.contact}`,
      hint: pii.position,
    },
    extractTextFromResumeFile: async () => ({ ok: true, kind: "pdf", text: pii.resume }),
  });

  const response = await harness.POST(multipartCandidateRequest({ saveResumeFile: true }));
  const body = await response.json();
  const responseText = JSON.stringify(body);
  const warningsText = JSON.stringify(harness.state.consoleWarnings);
  const usageText = JSON.stringify(harness.state.usageEvents);

  assert.equal(response.status, 500);
  assert.equal(body.error, "CANDIDATE_CREATE_FAILED");
  for (const value of Object.values(pii)) {
    assert.equal(responseText.includes(value), false, `response leaked ${value}`);
    assert.equal(warningsText.includes(value), false, `warning leaked ${value}`);
    assert.equal(usageText.includes(value), false, `usage leaked ${value}`);
  }
  assert.equal(harness.state.storageUploads.length, 0);
  assert.equal(harness.state.contactInserts.length, 0);
  assert.equal(harness.state.usageEvents.length, 1);
});

test("unexpected extractor rejections go through the route internal error handler", async () => {
  const harness = loadCandidateRouteHarness({
    extractTextFromResumeFile: async () => {
      throw new Error("unexpected extractor failure");
    },
  });

  const response = await harness.POST(multipartCandidateRequest());
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: "INTERNAL_ERROR" });
  assert.equal(harness.state.rpcCalls.length, 0);
  assert.equal(harness.state.businessEvents.length, 0);
});
