import process from "node:process";

import { PostHog } from "posthog-node";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const workerDistinctId = process.env.WORKER_ID || "hiiire-worker";

let posthogClient: PostHog | null | undefined;

type WorkerTelemetryProperties = Record<string, string | number | boolean | null | undefined>;
const redactedErrorMessage = "Worker error details redacted";

function getPostHogClient() {
  if (!posthogKey) {
    return null;
  }

  if (posthogClient === undefined) {
    posthogClient = new PostHog(posthogKey, {
      host: posthogHost,
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogClient;
}

function safeTelemetryError(err: unknown): WorkerTelemetryProperties {
  if (err instanceof Error) {
    const record = err as unknown as Record<string, unknown>;
    return {
      error_name: err.name,
      error_message: err.message.slice(0, 500),
      error_code: typeof record.code === "string" || typeof record.code === "number" ? String(record.code) : null,
      error_status: typeof record.status === "string" || typeof record.status === "number" ? String(record.status) : null,
    };
  }

  if (typeof err === "string") {
    return { error_message: err.slice(0, 500) };
  }

  return { error_message: String(err).slice(0, 500) };
}

function sanitizeWorkerException(err: unknown): Error {
  const sanitized = new Error(redactedErrorMessage);
  sanitized.name = err instanceof Error && err.name ? err.name : "WorkerError";
  return sanitized;
}

function sanitizeWorkerTelemetryProperties(properties: WorkerTelemetryProperties = {}) {
  const output: WorkerTelemetryProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (key === "error_message" || key === "error_summary" || key === "detail" || key === "last_error") {
      output[key] = redactedErrorMessage;
      continue;
    }
    output[key] = value;
  }
  return output;
}

function withWorkerDefaults(properties: WorkerTelemetryProperties = {}) {
  return {
    "$process_person_profile": false,
    app: "hiiire",
    runtime: "worker",
    environment: process.env.NODE_ENV ?? "unknown",
    worker_id: workerDistinctId,
    worker_version: process.env.WORKER_VERSION || process.env.APP_VERSION || null,
    ...properties,
  };
}

function getCompanyGroup(properties: WorkerTelemetryProperties) {
  return typeof properties.company_id === "string" && properties.company_id.length > 0
    ? { company: properties.company_id }
    : undefined;
}

function getWorkerDistinctId(properties: WorkerTelemetryProperties) {
  if (typeof properties.user_id === "string" && properties.user_id.length > 0) return properties.user_id;
  if (typeof properties.requested_by === "string" && properties.requested_by.length > 0) return properties.requested_by;
  if (typeof properties.company_id === "string" && properties.company_id.length > 0) return properties.company_id;
  return workerDistinctId;
}

export async function captureWorkerEvent(event: string, properties: WorkerTelemetryProperties = {}) {
  const client = getPostHogClient();
  if (!client) return;

  try {
    await client.captureImmediate({
      distinctId: getWorkerDistinctId(properties),
      event,
      properties: withWorkerDefaults(sanitizeWorkerTelemetryProperties(properties)),
      groups: getCompanyGroup(properties),
    });
  } catch (err) {
    console.warn("[worker][posthog] event capture failed:", safeTelemetryError(err));
  }
}

export async function identifyWorkerCompanyGroup(input: {
  companyId: string;
  plan?: string | null;
  billingStatus?: string | null;
}) {
  const client = getPostHogClient();
  if (!client) return;

  try {
    client.groupIdentify({
      groupType: "company",
      groupKey: input.companyId,
      properties: {
        plan: input.plan ?? undefined,
        billing_status: input.billingStatus ?? undefined,
      },
    });
  } catch (err) {
    console.warn("[worker][posthog] group identify failed:", safeTelemetryError(err));
  }
}

export async function captureWorkerException(
  err: unknown,
  event: string,
  properties: WorkerTelemetryProperties = {},
) {
  const client = getPostHogClient();
  if (!client) return;

  try {
    await client.captureExceptionImmediate(
      sanitizeWorkerException(err),
      workerDistinctId,
      withWorkerDefaults(sanitizeWorkerTelemetryProperties({ event, ...properties })),
    );
  } catch (captureErr) {
    console.warn("[worker][posthog] exception capture failed:", safeTelemetryError(captureErr));
  }
}

export function registerWorkerProcessErrorHandlers() {
  process.on("uncaughtExceptionMonitor", (err) => {
    void captureWorkerException(err, "worker_uncaught_exception");
  });

  process.on("unhandledRejection", (reason) => {
    void captureWorkerException(reason, "worker_unhandled_rejection");
  });
}
