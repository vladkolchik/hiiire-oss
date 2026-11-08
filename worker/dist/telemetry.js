"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureWorkerEvent = captureWorkerEvent;
exports.identifyWorkerCompanyGroup = identifyWorkerCompanyGroup;
exports.captureWorkerException = captureWorkerException;
exports.registerWorkerProcessErrorHandlers = registerWorkerProcessErrorHandlers;
const node_process_1 = __importDefault(require("node:process"));
const posthog_node_1 = require("posthog-node");
const posthogKey = node_process_1.default.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = node_process_1.default.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const workerDistinctId = node_process_1.default.env.WORKER_ID || "hiiire-worker";
let posthogClient;
const redactedErrorMessage = "Worker error details redacted";
function getPostHogClient() {
    if (!posthogKey) {
        return null;
    }
    if (posthogClient === undefined) {
        posthogClient = new posthog_node_1.PostHog(posthogKey, {
            host: posthogHost,
            flushAt: 1,
            flushInterval: 0,
        });
    }
    return posthogClient;
}
function safeTelemetryError(err) {
    if (err instanceof Error) {
        const record = err;
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
function sanitizeWorkerException(err) {
    const sanitized = new Error(redactedErrorMessage);
    sanitized.name = err instanceof Error && err.name ? err.name : "WorkerError";
    return sanitized;
}
function sanitizeWorkerTelemetryProperties(properties = {}) {
    const output = {};
    for (const [key, value] of Object.entries(properties)) {
        if (key === "error_message" || key === "error_summary" || key === "detail" || key === "last_error") {
            output[key] = redactedErrorMessage;
            continue;
        }
        output[key] = value;
    }
    return output;
}
function withWorkerDefaults(properties = {}) {
    return {
        "$process_person_profile": false,
        app: "hiiire",
        runtime: "worker",
        environment: node_process_1.default.env.NODE_ENV ?? "unknown",
        worker_id: workerDistinctId,
        worker_version: node_process_1.default.env.WORKER_VERSION || node_process_1.default.env.APP_VERSION || null,
        ...properties,
    };
}
function getCompanyGroup(properties) {
    return typeof properties.company_id === "string" && properties.company_id.length > 0
        ? { company: properties.company_id }
        : undefined;
}
function getWorkerDistinctId(properties) {
    if (typeof properties.user_id === "string" && properties.user_id.length > 0)
        return properties.user_id;
    if (typeof properties.requested_by === "string" && properties.requested_by.length > 0)
        return properties.requested_by;
    if (typeof properties.company_id === "string" && properties.company_id.length > 0)
        return properties.company_id;
    return workerDistinctId;
}
async function captureWorkerEvent(event, properties = {}) {
    const client = getPostHogClient();
    if (!client)
        return;
    try {
        await client.captureImmediate({
            distinctId: getWorkerDistinctId(properties),
            event,
            properties: withWorkerDefaults(sanitizeWorkerTelemetryProperties(properties)),
            groups: getCompanyGroup(properties),
        });
    }
    catch (err) {
        console.warn("[worker][posthog] event capture failed:", safeTelemetryError(err));
    }
}
async function identifyWorkerCompanyGroup(input) {
    const client = getPostHogClient();
    if (!client)
        return;
    try {
        client.groupIdentify({
            groupType: "company",
            groupKey: input.companyId,
            properties: {
                plan: input.plan ?? undefined,
                billing_status: input.billingStatus ?? undefined,
            },
        });
    }
    catch (err) {
        console.warn("[worker][posthog] group identify failed:", safeTelemetryError(err));
    }
}
async function captureWorkerException(err, event, properties = {}) {
    const client = getPostHogClient();
    if (!client)
        return;
    try {
        await client.captureExceptionImmediate(sanitizeWorkerException(err), workerDistinctId, withWorkerDefaults(sanitizeWorkerTelemetryProperties({ event, ...properties })));
    }
    catch (captureErr) {
        console.warn("[worker][posthog] exception capture failed:", safeTelemetryError(captureErr));
    }
}
function registerWorkerProcessErrorHandlers() {
    node_process_1.default.on("uncaughtExceptionMonitor", (err) => {
        void captureWorkerException(err, "worker_uncaught_exception");
    });
    node_process_1.default.on("unhandledRejection", (reason) => {
        void captureWorkerException(reason, "worker_unhandled_rejection");
    });
}
