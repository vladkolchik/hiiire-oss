"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHhAutoSync = startHhAutoSync;
const node_crypto_1 = require("node:crypto");
const node_os_1 = __importDefault(require("node:os"));
const node_process_1 = __importDefault(require("node:process"));
const node_util_1 = require("node:util");
const hh_auth_retry_1 = require("./hh-auth-retry");
const hh_candidate_write_payload_js_1 = require("./hh-candidate-write-payload.js");
const candidate_desired_salary_js_1 = require("./shared/candidate-desired-salary.js");
const supabase_1 = require("./supabase");
const telemetry_1 = require("./telemetry");
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
const HH_AUTO_SURVEY_MAX_CHARS = 4000;
const HH_SYNC_BATCH_SIZE = 100;
const HH_SYNC_CANDIDATE_SELECT_BATCH = 250;
const HH_SYNC_CANDIDATE_SELECT_PAGE_SIZE = 1000;
const HH_SYNC_CONTACT_SELECT_BATCH = 200;
const HH_SYNC_CONTACT_SELECT_PAGE_SIZE = 1000;
const HH_SYNC_VACANCY_SELECT_PAGE_SIZE = 1000;
const HH_SYNC_LEASE_SECONDS = Math.max(60, Number(node_process_1.default.env.WORKER_HH_SYNC_LEASE_SECONDS || 15 * 60));
const HH_SYNC_WORKER_ID = node_process_1.default.env.WORKER_ID || `${node_os_1.default.hostname()}:${node_process_1.default.pid}`;
const PERSISTED_HH_AUTH_RELOAD_ATTEMPTS = 10;
const PERSISTED_HH_AUTH_RELOAD_DELAY_MS = 200;
function getEnvBool(name, def = false) {
    const v = String(node_process_1.default.env[name] ?? "").toLowerCase();
    if (!v)
        return def;
    return v === "1" || v === "true" || v === "yes" || v === "on";
}
function hhUserAgent() {
    return node_process_1.default.env.HH_USER_AGENT || "hiiire.com (worker hhru sync)";
}
function hhDefaultHost() {
    return node_process_1.default.env.HH_RU_HOST || node_process_1.default.env.HH_HOST || "hh.ru";
}
function parseHhApiErrorMeta(json) {
    const out = {
        oauthError: null,
        errorValues: [],
        description: null,
    };
    if (!json || typeof json !== "object")
        return out;
    const anyJson = json;
    if (typeof anyJson.oauth_error === "string" && anyJson.oauth_error.trim()) {
        out.oauthError = anyJson.oauth_error.trim();
    }
    if (typeof anyJson.description === "string" && anyJson.description.trim()) {
        out.description = anyJson.description.trim();
    }
    if (Array.isArray(anyJson.errors)) {
        for (const item of anyJson.errors) {
            if (!item || typeof item !== "object")
                continue;
            const value = typeof item.value === "string" ? String(item.value).trim() : "";
            if (!value)
                continue;
            out.errorValues.push(value);
        }
    }
    return out;
}
class HhHttpError extends Error {
    status;
    code;
    oauthError;
    errorValues;
    description;
    requestContext;
    constructor(input) {
        super(input.code);
        this.name = "HhHttpError";
        this.status = input.status;
        this.code = input.code;
        this.oauthError = input.oauthError;
        this.errorValues = input.errorValues;
        this.description = input.description;
        this.requestContext = input.requestContext ?? null;
    }
}
class HhRefreshTokenError extends Error {
    status;
    errorCode;
    errorDescription;
    requestContext;
    constructor(input) {
        super(input.errorDescription || `HH_REFRESH_HTTP_${input.status}`);
        this.name = "HhRefreshTokenError";
        this.status = input.status;
        this.errorCode = input.errorCode;
        this.errorDescription = input.errorDescription;
        this.requestContext = input.requestContext ?? null;
    }
}
class HhNetworkError extends Error {
    code;
    requestContext;
    cause;
    constructor(cause, requestContext) {
        const causeText = getSafeErrorSummary(cause);
        super(`HH_REQUEST_FAILED ${requestContext.hh_request_method} ${requestContext.hh_request_path}: ${causeText}`);
        this.name = "HhNetworkError";
        this.code = getErrorCode(cause);
        this.requestContext = requestContext;
        this.cause = cause;
    }
}
function buildAuthFailureDetail(input) {
    const chunks = [
        input.code,
        typeof input.status === "number" ? `status=${input.status}` : null,
        input.oauthError ? `oauth=${input.oauthError}` : null,
        input.errorValues && input.errorValues.length > 0 ? `errors=${input.errorValues.join(",")}` : null,
        input.description ? `description=${input.description}` : null,
    ].filter((x) => Boolean(x));
    return chunks.join(" ");
}
function getFatalHhAuthFailure(err) {
    if (err instanceof HhHttpError) {
        const decision = (0, hh_auth_retry_1.classifyHhRequestFailureForHandling)({
            code: err.code,
            status: err.status,
            oauthError: err.oauthError,
            errorValues: err.errorValues,
            description: err.description,
        });
        if (decision.kind !== "fatal_disconnect")
            return null;
        return { reason: decision.reason, detail: decision.detail };
    }
    if (err instanceof HhRefreshTokenError) {
        const decision = (0, hh_auth_retry_1.classifyHhRefreshFailureForHandling)({
            status: err.status,
            errorCode: err.errorCode,
            errorDescription: err.errorDescription,
        });
        if (decision.kind !== "fatal_disconnect")
            return null;
        return { reason: decision.reason, detail: decision.detail };
    }
    const message = err instanceof Error ? err.message : formatUnknownError(err);
    const messageDecision = (0, hh_auth_retry_1.classifyHhMessageFailureForHandling)(message);
    if (messageDecision.kind === "fatal_disconnect") {
        return {
            reason: messageDecision.reason,
            detail: messageDecision.detail,
        };
    }
    return null;
}
function trimErrorForDb(err, max = 2000) {
    const raw = formatUnknownError(err);
    const text = raw.trim() || "UNKNOWN_SYNC_ERROR";
    return text.length > max ? text.slice(0, max) : text;
}
function formatUnknownError(err) {
    if (err instanceof Error) {
        const text = `${err.name}: ${err.message}`.trim();
        return text || err.name || "UNKNOWN_ERROR";
    }
    if (!err)
        return "";
    if (typeof err === "string")
        return err;
    if (typeof err === "object") {
        const record = err;
        const parts = [
            typeof record.name === "string" ? `name=${record.name}` : null,
            typeof record.message === "string" ? `message=${record.message}` : null,
            typeof record.code === "string" || typeof record.code === "number" ? `code=${String(record.code)}` : null,
            typeof record.status === "string" || typeof record.status === "number" ? `status=${String(record.status)}` : null,
            typeof record.details === "string" ? `details=${record.details}` : null,
            typeof record.hint === "string" ? `hint=${record.hint}` : null,
            typeof record.description === "string" ? `description=${record.description}` : null,
            typeof record.error === "string" ? `error=${record.error}` : null,
        ].filter((value) => Boolean(value));
        if (parts.length > 0)
            return parts.join(" ");
        try {
            return JSON.stringify(err);
        }
        catch {
            return (0, node_util_1.inspect)(err, {
                depth: 4,
                breakLength: 120,
                maxArrayLength: 20,
            });
        }
    }
    return String(err);
}
function getErrorCode(err) {
    if (!err || typeof err !== "object")
        return null;
    const record = err;
    const code = record.code;
    if (typeof code === "string" || typeof code === "number")
        return String(code);
    if (record.cause && typeof record.cause === "object") {
        const causeCode = record.cause.code;
        if (typeof causeCode === "string" || typeof causeCode === "number")
            return String(causeCode);
    }
    return null;
}
function getSafeErrorSummary(err) {
    if (err instanceof Error) {
        const code = getErrorCode(err);
        const cause = err.cause;
        const causeSummary = cause instanceof Error ? [cause.name || null, cause.message ? cause.message.slice(0, 120) : null].filter(Boolean).join(" ") : null;
        return [
            err.name || "Error",
            code ? `code=${code}` : null,
            err.message ? err.message.slice(0, 240) : null,
            causeSummary ? `cause=${causeSummary}` : null,
        ]
            .filter((part) => Boolean(part))
            .join(" ");
    }
    return formatUnknownError(err).slice(0, 240) || "UNKNOWN_ERROR";
}
function normalizeHhRequestPath(path) {
    const value = path.startsWith("/") ? path : `/${path}`;
    const segments = value.split("/").filter(Boolean);
    const [root, second, third] = segments;
    if (root === "resumes" && second)
        return { path: "/resumes/:id", kind: "resume" };
    if (root === "vacancies" && second)
        return { path: "/vacancies/:id", kind: "vacancy" };
    if (root === "negotiations" && second)
        return { path: "/negotiations/:id", kind: "negotiation_collection" };
    if (root === "negotiations")
        return { path: "/negotiations", kind: "negotiations" };
    if (root === "employers" && second && third === "vacancies") {
        return { path: "/employers/:id/vacancies/active", kind: "employer_vacancies" };
    }
    if (root === "token")
        return { path: "/token", kind: "token" };
    const normalizedSegments = segments.map((segment) => {
        if (/^[0-9a-f-]{12,}$/i.test(segment) || /^\d{5,}$/.test(segment))
            return ":id";
        return segment;
    });
    return {
        path: `/${normalizedSegments.join("/")}`,
        kind: root || "unknown",
    };
}
function toTelemetryNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value !== "string" || !value.trim())
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function toTelemetryStatus(value) {
    if (typeof value !== "string")
        return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized.length > 40)
        return null;
    return normalized.replace(/[^a-z0-9_-]/g, "_");
}
function buildHhRequestContext(urlPath, query, method) {
    const normalized = normalizeHhRequestPath(urlPath);
    const queryKeys = Object.keys(query ?? {})
        .filter((key) => query?.[key] !== undefined)
        .sort();
    return {
        hh_request_method: method,
        hh_request_path: normalized.path,
        hh_request_path_kind: normalized.kind,
        hh_request_query_keys: queryKeys.length > 0 ? queryKeys.join(",") : null,
        hh_request_page: toTelemetryNumber(query?.page),
        hh_request_per_page: toTelemetryNumber(query?.per_page),
        hh_request_status: toTelemetryStatus(query?.status),
        hh_request_has_manager_id: query?.manager_id !== undefined,
        hh_request_has_vacancy_id: query?.vacancy_id !== undefined,
    };
}
function getHhRequestLogContext(err) {
    if (!err || typeof err !== "object")
        return null;
    const requestContext = err.requestContext;
    return requestContext && typeof requestContext === "object" ? requestContext : null;
}
function getHhErrorKind(err) {
    const text = formatUnknownError(err).toLowerCase();
    if (text.includes("und_err_headers_overflow") || text.includes("headersoverflowerror"))
        return "headers_overflow";
    if (text.includes("fetch failed"))
        return "fetch_failed";
    if (err instanceof HhHttpError)
        return `http_${err.status}`;
    if (err instanceof HhRefreshTokenError)
        return `refresh_http_${err.status}`;
    if (err instanceof HhNetworkError)
        return "network";
    if (err instanceof Error && err.name)
        return err.name;
    return "unknown";
}
function getHhErrorTelemetry(err) {
    if (!err || typeof err !== "object") {
        return {
            hh_error_kind: getHhErrorKind(err),
            hh_error_name: null,
            hh_error_code: null,
            hh_error_status: null,
        };
    }
    const record = err;
    return {
        hh_error_kind: getHhErrorKind(err),
        hh_error_name: typeof record.name === "string" ? record.name : null,
        hh_error_code: getErrorCode(err),
        hh_error_status: typeof record.status === "string" || typeof record.status === "number" ? String(record.status) : null,
    };
}
function captureHhSyncFailureTelemetry(integration, err) {
    const request = getHhRequestLogContext(err);
    const properties = {
        integration_id: integration.id,
        company_id: integration.company_id,
        user_id: integration.user_id,
        ...getHhErrorTelemetry(err),
        ...(request ?? {}),
    };
    void (0, telemetry_1.captureWorkerEvent)("hh_sync_failed", properties);
    void (0, telemetry_1.captureWorkerException)(err, "hh_sync_failed", properties);
}
async function deactivateIntegrationAccount(admin, row, failure) {
    const nowIso = new Date().toISOString();
    const settings = row?.settings && typeof row.settings === "object"
        ? { ...row.settings }
        : {};
    const nextSettings = {
        ...settings,
        disconnect_reason: failure.reason,
        disconnect_detail: failure.detail,
        disconnect_at: nowIso,
    };
    const { error: updErr } = await admin
        .from("integrations_accounts")
        .update({
        is_active: false,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        settings: nextSettings,
        sync_started_at: null,
        sync_lock_expires_at: null,
        last_sync_error: failure.detail,
        last_sync_error_at: nowIso,
        updated_at: nowIso,
    })
        .eq("id", row.id);
    if (updErr) {
        console.warn("[worker][hh] failed to disable broken integration", {
            integrationId: row?.id ? String(row.id) : null,
            reason: failure.reason,
            code: updErr?.code,
        });
    }
}
async function refreshToken(refreshToken) {
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refreshToken);
    const requestContext = buildHhRequestContext("/token", undefined, "POST");
    let res;
    try {
        res = await fetch("https://api.hh.ru/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
                "HH-User-Agent": hhUserAgent(),
            },
            body,
        });
    }
    catch (err) {
        throw new HhNetworkError(err, requestContext);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
        const errorDescription = typeof json?.error_description === "string" ? json.error_description.trim() : null;
        const errorCode = typeof json?.error === "string" ? json.error.trim() : null;
        throw new HhRefreshTokenError({
            status: res.status,
            errorCode,
            errorDescription,
            requestContext,
        });
    }
    if (!json?.access_token)
        throw new Error("HH_REFRESH_FAILED");
    return {
        accessToken: String(json.access_token),
        refreshToken: json.refresh_token ? String(json.refresh_token) : null,
        expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
    };
}
async function loadPersistedWorkerHhAuthState(admin, input) {
    for (let attempt = 0; attempt < PERSISTED_HH_AUTH_RELOAD_ATTEMPTS; attempt += 1) {
        const { data, error } = await admin
            .from("integrations_accounts")
            .select("is_active,access_token,refresh_token,token_expires_at")
            .eq("id", input.integrationId)
            .maybeSingle();
        if (error)
            throw error;
        if (data?.is_active &&
            typeof data.access_token === "string" &&
            data.access_token &&
            (data.access_token !== input.currentAccessToken || data.refresh_token !== input.currentRefreshToken)) {
            return {
                accessToken: data.access_token,
                refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
                tokenExpiresAt: typeof data.token_expires_at === "string" ? data.token_expires_at : null,
            };
        }
        if (attempt < PERSISTED_HH_AUTH_RELOAD_ATTEMPTS - 1) {
            await sleep(PERSISTED_HH_AUTH_RELOAD_DELAY_MS);
        }
    }
    return null;
}
async function hhFetchJson(accessToken, host, urlPath, query) {
    const requestContext = buildHhRequestContext(urlPath, query, "GET");
    const url = new URL(urlPath, "https://api.hh.ru");
    url.searchParams.set("host", host);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            if (v === undefined)
                continue;
            url.searchParams.set(k, String(v));
        }
    }
    let res;
    try {
        res = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
                "HH-User-Agent": hhUserAgent(),
            },
        });
    }
    catch (err) {
        throw new HhNetworkError(err, requestContext);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
        const meta = parseHhApiErrorMeta(json);
        throw new HhHttpError({
            status: res.status,
            code: `HH_HTTP_${res.status}`,
            oauthError: meta.oauthError,
            errorValues: meta.errorValues,
            description: meta.description,
            requestContext,
        });
    }
    return json;
}
function stripHtmlToText(html) {
    const s = String(html ?? "");
    return s
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}
function asString(v) {
    return typeof v === "string" ? v.trim() : "";
}
function asIdName(v) {
    if (!v || typeof v !== "object")
        return "";
    const anyV = v;
    return asString(anyV.name) || asString(anyV.id);
}
function mapHhContactType(raw) {
    const x = raw.trim().toLowerCase();
    if (!x)
        return "other";
    if (x.includes("mail") || x.includes("email") || x.includes("e-mail"))
        return "email";
    if (x.includes("phone") || x.includes("тел") || x.includes("mobile"))
        return "phone";
    if (x.includes("telegram") || x === "tg")
        return "telegram";
    if (x.includes("whatsapp"))
        return "whatsapp";
    if (x.includes("linkedin"))
        return "linkedin";
    if (x.includes("github"))
        return "github";
    if (x.includes("website") || x.includes("site") || x.includes("сайт"))
        return "website";
    return "other";
}
function normalizeContacts(contacts) {
    const out = contacts
        .map((contact) => ({
        label: asString(contact.label).trim() || null,
        type: mapHhContactType(contact.type),
        value: asString(contact.value),
    }))
        .filter((contact) => contact.value.length > 0);
    out.sort((a, b) => {
        const left = `${a.type}\u0000${a.value}\u0000${a.label ?? ""}`;
        const right = `${b.type}\u0000${b.value}\u0000${b.label ?? ""}`;
        return left.localeCompare(right);
    });
    return out;
}
function extractContactsFromResume(resume) {
    if (!resume || typeof resume !== "object")
        return [];
    const rawOut = [];
    const seen = new Set();
    const anyResume = resume;
    const push = (type, valueRaw, labelRaw) => {
        const value = asString(valueRaw);
        if (!value)
            return;
        const label = asString(labelRaw);
        const normalizedType = mapHhContactType(type);
        const key = `${normalizedType}::${value}`;
        if (seen.has(key))
            return;
        seen.add(key);
        rawOut.push({ type: normalizedType, value, label: label || null });
    };
    const contact = Array.isArray(anyResume.contact) ? anyResume.contact : [];
    for (const c of contact) {
        if (!c || typeof c !== "object")
            continue;
        const item = c;
        const typeName = asIdName(item.type) || asString(item.kind);
        const value = asString(item.value) || asString(item.contact_value);
        const comment = asString(item.comment);
        push(typeName, value, comment);
    }
    const sites = Array.isArray(anyResume.site) ? anyResume.site : [];
    for (const s of sites) {
        if (!s || typeof s !== "object")
            continue;
        const site = s;
        const typeName = asIdName(site.type) || "website";
        const value = asString(site.url);
        push(typeName, value, null);
    }
    return normalizeContacts(rawOut).slice(0, 30);
}
function normalizeHhAutoSurveyText(raw) {
    if (typeof raw !== "string")
        return null;
    let text = raw.replace(/\r\n?/g, "\n");
    text = text.replace(/[ \t]*\\+[ \t]*/g, "\n");
    text = text.replace(/[ \t]+\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");
    text = text.trim();
    if (!text)
        return null;
    if (text.length > HH_AUTO_SURVEY_MAX_CHARS)
        text = text.slice(0, HH_AUTO_SURVEY_MAX_CHARS);
    return text;
}
function toHttpUrl(raw) {
    if (typeof raw !== "string")
        return null;
    const value = raw.trim();
    if (!value)
        return null;
    try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:")
            return null;
        return url.toString();
    }
    catch {
        return null;
    }
}
function pickHhResumePhotoUrl(resume) {
    if (!resume || typeof resume !== "object")
        return null;
    const photo = resume.photo;
    if (!photo || typeof photo !== "object")
        return null;
    const p = photo;
    const candidates = [p.small, p.medium, p["100"], p["40"], p["500"]];
    for (const candidate of candidates) {
        const url = toHttpUrl(candidate);
        if (url)
            return url;
    }
    return null;
}
function resumeToText(resume) {
    if (!resume || typeof resume !== "object")
        return "";
    const anyResume = resume;
    const parts = [];
    const title = asString(anyResume.title);
    const first = asString(anyResume.first_name);
    const last = asString(anyResume.last_name);
    const middle = asString(anyResume.middle_name);
    const name = [last, first, middle].filter(Boolean).join(" ").trim();
    if (name)
        parts.push(`Имя: ${name}`);
    if (title)
        parts.push(`Должность: ${title}`);
    const area = asString(anyResume.area?.name);
    if (area)
        parts.push(`Локация: ${area}`);
    const salaryAmount = typeof anyResume.salary?.amount === "number" ? String(anyResume.salary.amount) : "";
    const salaryCurrency = asString(anyResume.salary?.currency);
    if (salaryAmount || salaryCurrency) {
        parts.push(`Ожидаемая зарплата: ${[salaryAmount, salaryCurrency].filter(Boolean).join(" ")}`.trim());
    }
    const contacts = extractContactsFromResume(anyResume);
    if (contacts.length) {
        parts.push("Контакты:");
        for (const c of contacts)
            parts.push(`- ${c.type}: ${c.value}${c.label ? ` (${c.label})` : ""}`);
    }
    const skillSet = Array.isArray(anyResume.skill_set)
        ? anyResume.skill_set.filter((s) => typeof s === "string" && s.trim())
        : [];
    if (skillSet.length)
        parts.push(`Навыки: ${skillSet.join(", ")}`);
    const experience = Array.isArray(anyResume.experience) ? anyResume.experience : [];
    if (experience.length) {
        parts.push("Опыт:");
        for (const e of experience.slice(0, 25)) {
            const company = asString(e?.company) || asString(e?.employer?.name);
            const position = asString(e?.position);
            const start = asString(e?.start);
            const end = asString(e?.end);
            const period = [start || "?", end || "н.в."].join("..");
            const line = [company, position].filter(Boolean).join(" — ");
            if (line)
                parts.push(`- ${line} (${period})`);
            const desc = asString(e?.description);
            if (desc)
                parts.push(`  ${desc}`);
        }
    }
    const education = anyResume.education && typeof anyResume.education === "object" ? anyResume.education : null;
    const primaryEdu = Array.isArray(education?.primary) ? education.primary : [];
    if (primaryEdu.length) {
        parts.push("Образование:");
        for (const ed of primaryEdu.slice(0, 15)) {
            const nameEd = asString(ed?.name);
            const org = asString(ed?.organization);
            const result = asString(ed?.result);
            const year = typeof ed?.year === "number" ? String(ed.year) : "";
            const line = [nameEd, org, result].filter(Boolean).join(" — ");
            if (line)
                parts.push(`- ${line}${year ? ` (${year})` : ""}`);
        }
    }
    const summary = asString(anyResume.summary);
    if (summary)
        parts.push(`О себе: ${summary}`);
    return parts.join("\n").trim();
}
function chunk(items, size) {
    if (items.length === 0)
        return [];
    const out = [];
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size));
    return out;
}
function normalizeJson(value) {
    if (Array.isArray(value))
        return value.map((item) => normalizeJson(item));
    if (value && typeof value === "object") {
        const out = {};
        const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
        for (const [key, nested] of entries) {
            if (nested === undefined)
                continue;
            out[key] = normalizeJson(nested);
        }
        return out;
    }
    return value;
}
function fingerprint(value) {
    return (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(normalizeJson(value))).digest("hex");
}
function buildCandidateKey(vacancyId, resumeId) {
    return `${vacancyId}::${resumeId}`;
}
function buildCandidateFingerprintPayload(input) {
    const payload = {
        applied_at: input.appliedAt,
        avatar_url: input.avatarUrl,
        contacts: input.contacts,
        hh_auto_survey_text: input.hhAutoSurveyText,
        name: input.name,
        position: input.position,
        resume_text: input.resumeText,
    };
    if (input.desiredSalary) {
        payload.desiredSalary = {
            desired_salary_text: input.desiredSalary.desired_salary_text,
            desired_salary_amount: input.desiredSalary.desired_salary_amount,
            desired_salary_currency: input.desiredSalary.desired_salary_currency,
            desired_salary_source: input.desiredSalary.desired_salary_source,
        };
    }
    return payload;
}
function buildVacancyFingerprintPayload(input) {
    return {
        description: input.description,
        experience_level: input.experienceLevel,
        location: input.location,
        title: input.title,
    };
}
function mapHhExperienceIdToVacancyLevel(hhExperienceId) {
    const normalized = (hhExperienceId ?? "").toLowerCase().replace(/[_-]/g, "");
    switch (normalized) {
        case "noexperience":
            return "trainee";
        case "between1and3":
            return "junior";
        case "between3and6":
            return "middle";
        case "morethan6":
            return "senior";
        default:
            return "middle";
    }
}
function toVacancyExperienceLevel(value) {
    return value === "trainee" || value === "junior" || value === "middle" || value === "senior" || value === "lead"
        ? value
        : "middle";
}
function toIsoOrNow(v) {
    if (typeof v !== "string" || !v)
        return new Date().toISOString();
    const t = Date.parse(v);
    if (!Number.isFinite(t))
        return new Date().toISOString();
    return new Date(t).toISOString();
}
function asSettingsObject(value) {
    return value && typeof value === "object" ? value : null;
}
function toClaimedIntegration(value) {
    if (!value || typeof value !== "object")
        return null;
    const row = value;
    if (typeof row.id !== "string" || !row.id)
        return null;
    if (typeof row.company_id !== "string" || typeof row.user_id !== "string")
        return null;
    return {
        access_token: typeof row.access_token === "string" ? row.access_token : null,
        company_id: row.company_id,
        id: row.id,
        is_active: Boolean(row.is_active),
        refresh_token: typeof row.refresh_token === "string" ? row.refresh_token : null,
        settings: asSettingsObject(row.settings),
        token_expires_at: typeof row.token_expires_at === "string" ? row.token_expires_at : null,
        user_id: row.user_id,
    };
}
async function fetchExistingCandidates(admin, vacancyIds) {
    const byKey = new Map();
    for (const vacancyChunk of chunk(vacancyIds, HH_SYNC_CANDIDATE_SELECT_BATCH)) {
        let candidatePageStart = 0;
        while (true) {
            const candidatePageEnd = candidatePageStart + HH_SYNC_CANDIDATE_SELECT_PAGE_SIZE - 1;
            const { data, error } = await admin
                .from("candidates")
                .select("id,vacancy_id,created_by,source,status,hhru_resume_id,hh_source_fingerprint,created_at,avatar_url")
                .in("vacancy_id", vacancyChunk)
                .eq("source", "hh.ru")
                .not("hhru_resume_id", "is", null)
                .order("id", { ascending: true })
                .range(candidatePageStart, candidatePageEnd);
            if (error)
                throw error;
            for (const row of data ?? []) {
                if (!row?.vacancy_id || !row?.hhru_resume_id)
                    continue;
                byKey.set(buildCandidateKey(String(row.vacancy_id), String(row.hhru_resume_id)), {
                    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
                    created_at: String(row.created_at),
                    created_by: String(row.created_by),
                    hh_source_fingerprint: row.hh_source_fingerprint ? String(row.hh_source_fingerprint) : null,
                    hhru_resume_id: row.hhru_resume_id ? String(row.hhru_resume_id) : null,
                    id: String(row.id),
                    source: row.source,
                    status: row.status,
                    vacancy_id: String(row.vacancy_id),
                });
            }
            if ((data ?? []).length < HH_SYNC_CANDIDATE_SELECT_PAGE_SIZE)
                break;
            candidatePageStart += HH_SYNC_CANDIDATE_SELECT_PAGE_SIZE;
        }
    }
    return byKey;
}
async function fetchExistingContacts(admin, candidateIds) {
    const byCandidateId = new Map();
    if (candidateIds.length === 0)
        return byCandidateId;
    for (const candidateChunk of chunk(candidateIds, HH_SYNC_CONTACT_SELECT_BATCH)) {
        let contactPageStart = 0;
        while (true) {
            const contactPageEnd = contactPageStart + HH_SYNC_CONTACT_SELECT_PAGE_SIZE - 1;
            const { data, error } = await admin
                .from("candidate_contacts")
                .select("candidate_id,type,value,label")
                .in("candidate_id", candidateChunk)
                .order("id", { ascending: true })
                .range(contactPageStart, contactPageEnd);
            if (error)
                throw error;
            for (const row of data ?? []) {
                const candidateId = String(row.candidate_id);
                const existing = byCandidateId.get(candidateId) ?? [];
                existing.push({
                    label: row.label ? String(row.label) : null,
                    type: String(row.type),
                    value: String(row.value),
                });
                byCandidateId.set(candidateId, existing);
            }
            if ((data ?? []).length < HH_SYNC_CONTACT_SELECT_PAGE_SIZE)
                break;
            contactPageStart += HH_SYNC_CONTACT_SELECT_PAGE_SIZE;
        }
    }
    for (const [candidateId, contacts] of byCandidateId) {
        byCandidateId.set(candidateId, normalizeContacts(contacts));
    }
    return byCandidateId;
}
function contactsEqual(left, right) {
    if (left.length !== right.length)
        return false;
    for (let i = 0; i < left.length; i += 1) {
        if (left[i].type !== right[i].type || left[i].value !== right[i].value || left[i].label !== right[i].label) {
            return false;
        }
    }
    return true;
}
async function completeClaimedIntegration(admin, integrationId) {
    const nowIso = new Date().toISOString();
    const { error } = await admin
        .from("integrations_accounts")
        .update({
        last_synced_at: nowIso,
        sync_started_at: null,
        sync_lock_expires_at: null,
        last_sync_error: null,
        last_sync_error_at: null,
        updated_at: nowIso,
    })
        .eq("id", integrationId);
    if (error)
        throw error;
}
async function failClaimedIntegration(admin, integrationId, err) {
    const nowIso = new Date().toISOString();
    const { error } = await admin
        .from("integrations_accounts")
        .update({
        sync_started_at: null,
        sync_lock_expires_at: null,
        last_sync_error: trimErrorForDb(err),
        last_sync_error_at: nowIso,
        updated_at: nowIso,
    })
        .eq("id", integrationId);
    if (error) {
        console.warn("[worker][hh] failed to persist sync error", {
            integrationId,
            code: error?.code,
        });
    }
}
async function insertCandidateRows(admin, rows) {
    const persisted = [];
    for (const rowChunk of chunk(rows, HH_SYNC_BATCH_SIZE)) {
        const payload = rowChunk.map((row) => (0, hh_candidate_write_payload_js_1.buildHhCandidateWritePayload)(row));
        const { data, error } = await admin
            .from("candidates")
            .insert(payload)
            .select("id,vacancy_id,hhru_resume_id");
        if (error)
            throw error;
        const returnedRows = (data ?? []);
        for (const persistedRow of returnedRows) {
            persisted.push({
                contactKey: buildCandidateKey(String(persistedRow.vacancy_id), String(persistedRow.hhru_resume_id)),
                id: String(persistedRow.id),
            });
        }
    }
    return persisted;
}
async function updateCandidateRows(admin, rows) {
    const persisted = [];
    for (const rowChunk of chunk(rows, HH_SYNC_BATCH_SIZE)) {
        const { withoutDesiredSalaryPatch, withDesiredSalaryPatch } = (0, hh_candidate_write_payload_js_1.splitHhCandidateRowsByDesiredSalaryPatch)(rowChunk);
        for (const splitChunk of [withoutDesiredSalaryPatch, withDesiredSalaryPatch]) {
            if (splitChunk.length === 0)
                continue;
            const payload = splitChunk.map((row) => ({
                id: row.candidate_id,
                ...(0, hh_candidate_write_payload_js_1.buildHhCandidateWritePayload)(row),
            }));
            const { error } = await admin.from("candidates").upsert(payload, { onConflict: "id" });
            if (error)
                throw error;
        }
        for (const row of rowChunk) {
            if (!row.candidate_id)
                continue;
            persisted.push({
                contactKey: row.contactKey,
                id: row.candidate_id,
            });
        }
    }
    return persisted;
}
async function replaceCandidateContactsBatch(admin, input) {
    for (const idChunk of chunk(input.candidateIdsToReplace, HH_SYNC_BATCH_SIZE)) {
        const { error } = await admin.from("candidate_contacts").delete().in("candidate_id", idChunk);
        if (error)
            throw error;
    }
    const payload = [];
    for (const [candidateId, contacts] of input.candidateContacts) {
        for (const contact of contacts) {
            payload.push({
                candidate_id: candidateId,
                created_at: input.nowIso,
                label: contact.label,
                type: contact.type,
                updated_at: input.nowIso,
                value: contact.value,
            });
        }
    }
    for (const payloadChunk of chunk(payload, HH_SYNC_BATCH_SIZE)) {
        if (payloadChunk.length === 0)
            continue;
        const { error } = await admin.from("candidate_contacts").insert(payloadChunk);
        if (error)
            throw error;
    }
}
async function fetchLocalHhVacancies(admin, input) {
    const rows = [];
    let vacancyPageStart = 0;
    while (true) {
        const vacancyPageEnd = vacancyPageStart + HH_SYNC_VACANCY_SELECT_PAGE_SIZE - 1;
        const { data, error } = await admin
            .from("vacancies")
            .select("id,title,description,location,status,company_id,created_by,hhru_vacancy_id,hh_source_fingerprint,experience_level")
            .eq("company_id", input.companyId)
            .eq("created_by", input.userId)
            .not("hhru_vacancy_id", "is", null)
            .order("id", { ascending: true })
            .range(vacancyPageStart, vacancyPageEnd);
        if (error)
            throw error;
        rows.push(...(data ?? []));
        if ((data ?? []).length < HH_SYNC_VACANCY_SELECT_PAGE_SIZE)
            break;
        vacancyPageStart += HH_SYNC_VACANCY_SELECT_PAGE_SIZE;
    }
    return rows;
}
async function syncVacancies(admin, input) {
    const localVacanciesRaw = await fetchLocalHhVacancies(admin, {
        companyId: input.companyId,
        userId: input.userId,
    });
    const localByHhVacancyId = new Map();
    for (const row of localVacanciesRaw) {
        if (!row.hhru_vacancy_id)
            continue;
        localByHhVacancyId.set(String(row.hhru_vacancy_id), {
            company_id: String(row.company_id),
            created_by: String(row.created_by),
            description: String(row.description ?? ""),
            experience_level: toVacancyExperienceLevel(row.experience_level),
            hh_source_fingerprint: row.hh_source_fingerprint ? String(row.hh_source_fingerprint) : null,
            hhru_vacancy_id: String(row.hhru_vacancy_id),
            id: String(row.id),
            location: String(row.location ?? ""),
            status: row.status,
            title: String(row.title ?? ""),
        });
    }
    const activeItems = [];
    let page = 0;
    let pages = 1;
    while (page < pages) {
        const list = await input.requestJson(`/employers/${encodeURIComponent(input.employerId)}/vacancies/active`, {
            manager_id: input.managerId,
            page,
            per_page: 50,
        });
        const items = Array.isArray(list?.items) ? list.items : [];
        activeItems.push(...items);
        pages = typeof list?.pages === "number" ? Math.max(1, Math.trunc(list.pages)) : pages;
        page += 1;
        if (items.length === 0)
            break;
    }
    const vacancyInserts = [];
    const vacancyUpdates = [];
    for (const item of activeItems) {
        const hhVacId = String(item?.id ?? "");
        if (!hhVacId)
            continue;
        const details = await input.requestJson(`/vacancies/${encodeURIComponent(hhVacId)}`);
        const title = typeof details?.name === "string" ? details.name : typeof item?.name === "string" ? item.name : `HH.ru #${hhVacId}`;
        const description = typeof details?.description === "string"
            ? stripHtmlToText(details.description)
            : `Импортировано из HH.ru (vacancy_id=${hhVacId}).`;
        const location = typeof details?.address?.raw === "string"
            ? details.address.raw
            : typeof details?.area?.name === "string"
                ? details.area.name
                : "—";
        const experienceLevel = mapHhExperienceIdToVacancyLevel(typeof details?.experience?.id === "string" ? details.experience.id : undefined);
        const nextFingerprint = fingerprint(buildVacancyFingerprintPayload({
            description,
            experienceLevel,
            location,
            title,
        }));
        const existing = localByHhVacancyId.get(hhVacId);
        if (!existing) {
            vacancyInserts.push({
                company_id: input.companyId,
                created_at: input.nowIso,
                created_by: input.userId,
                description,
                employment_type: "full-time",
                experience_level: experienceLevel,
                hh_source_fingerprint: nextFingerprint,
                hhru_vacancy_id: hhVacId,
                location,
                requirements: [],
                responsibilities: [],
                status: "active",
                title,
                updated_at: input.nowIso,
            });
            continue;
        }
        if (existing.hh_source_fingerprint === nextFingerprint)
            continue;
        vacancyUpdates.push({
            description,
            experience_level: experienceLevel,
            hh_source_fingerprint: nextFingerprint,
            id: existing.id,
            location,
            title,
        });
    }
    for (const insertChunk of chunk(vacancyInserts, HH_SYNC_BATCH_SIZE)) {
        const { error } = await admin.from("vacancies").insert(insertChunk);
        if (error)
            throw error;
    }
    for (const update of vacancyUpdates) {
        const { error } = await admin
            .from("vacancies")
            .update({
            description: update.description,
            experience_level: update.experience_level,
            hh_source_fingerprint: update.hh_source_fingerprint,
            location: update.location,
            title: update.title,
            updated_at: input.nowIso,
        })
            .eq("id", update.id);
        if (error)
            throw error;
    }
    return fetchLocalHhVacancies(admin, {
        companyId: input.companyId,
        userId: input.userId,
    });
}
async function syncCandidatesForVacancies(admin, input) {
    const vacancyIds = input.vacancies.map((vacancy) => String(vacancy.id));
    if (vacancyIds.length === 0)
        return;
    const existingCandidatesByKey = await fetchExistingCandidates(admin, vacancyIds);
    const existingContactsByCandidateId = await fetchExistingContacts(admin, Array.from(existingCandidatesByKey.values()).map((candidate) => candidate.id));
    const candidateWrites = [];
    const contactPayloadByKey = new Map();
    const contactKeysToReplace = new Set();
    for (const vacancy of input.vacancies) {
        const localVacId = String(vacancy.id);
        const hhVacId = String(vacancy.hhru_vacancy_id ?? "");
        if (!hhVacId)
            continue;
        const cols = await input.requestJson("/negotiations", {
            vacancy_id: hhVacId,
            status: "active",
            page: 0,
            per_page: 20,
        });
        const collections = Array.isArray(cols?.collections) ? cols.collections : [];
        for (const collection of collections) {
            const collectionId = String(collection?.id ?? "");
            if (!collectionId)
                continue;
            let page = 0;
            let pages = 1;
            while (page < pages) {
                const resp = await input.requestJson(`/negotiations/${encodeURIComponent(collectionId)}`, {
                    vacancy_id: hhVacId,
                    page,
                    per_page: 50,
                });
                const items = Array.isArray(resp?.items) ? resp.items : [];
                pages = typeof resp?.pages === "number" ? Math.max(1, Math.trunc(resp.pages)) : pages;
                page += 1;
                if (items.length === 0)
                    break;
                for (const item of items) {
                    const previewResume = item?.resume;
                    const resumeId = previewResume?.id ? String(previewResume.id) : "";
                    if (!resumeId)
                        continue;
                    const hhAutoSurveyText = normalizeHhAutoSurveyText(item?.chat_bot?.auto_survey?.text);
                    let fullResume = null;
                    try {
                        fullResume = await input.requestJson(`/resumes/${encodeURIComponent(resumeId)}`, {
                            with_negotiations_history: true,
                            with_creds: true,
                            with_job_search_status: true,
                        });
                    }
                    catch (err) {
                        if (getFatalHhAuthFailure(err))
                            throw err;
                        fullResume = null;
                    }
                    const resume = fullResume && typeof fullResume === "object" ? fullResume : previewResume;
                    const appliedAt = toIsoOrNow(item?.created_at);
                    const name = (resume?.last_name || resume?.first_name)
                        ? [resume?.last_name, resume?.first_name, resume?.middle_name].filter(Boolean).join(" ")
                        : "Кандидат";
                    const position = typeof resume?.title === "string" ? resume.title : String(vacancy.title ?? "—");
                    const resumeText = resumeToText(resume) || null;
                    const desiredSalaryPatch = (0, candidate_desired_salary_js_1.buildDesiredSalaryDbPatchFromHhResume)(resume);
                    const desiredSalaryWritePatch = desiredSalaryPatch ?? {};
                    const existing = existingCandidatesByKey.get(buildCandidateKey(localVacId, resumeId));
                    const avatarUrl = pickHhResumePhotoUrl(resume) ?? existing?.avatar_url ?? null;
                    const contacts = extractContactsFromResume(resume);
                    const nextFingerprint = fingerprint(buildCandidateFingerprintPayload({
                        appliedAt,
                        avatarUrl,
                        contacts,
                        desiredSalary: desiredSalaryPatch,
                        hhAutoSurveyText,
                        name,
                        position,
                        resumeText,
                    }));
                    if (existing?.hh_source_fingerprint === nextFingerprint)
                        continue;
                    const currentContacts = existing ? existingContactsByCandidateId.get(existing.id) ?? [] : [];
                    const contactKey = buildCandidateKey(localVacId, resumeId);
                    if (!existing || !contactsEqual(currentContacts, contacts)) {
                        contactKeysToReplace.add(contactKey);
                        contactPayloadByKey.set(contactKey, contacts);
                    }
                    candidateWrites.push({
                        applied_at: appliedAt,
                        avatar_url: avatarUrl,
                        candidate_id: existing?.id ?? null,
                        contactKey,
                        created_at: existing?.created_at ?? input.nowIso,
                        created_by: existing?.created_by ?? input.userId,
                        ...desiredSalaryWritePatch,
                        hh_auto_survey_text: hhAutoSurveyText,
                        hh_source_fingerprint: nextFingerprint,
                        hhru_resume_id: resumeId,
                        name,
                        position,
                        resume_text: resumeText,
                        source: existing?.source ?? "hh.ru",
                        status: existing?.status ?? "new",
                        updated_at: input.nowIso,
                        vacancy_id: localVacId,
                    });
                }
            }
        }
    }
    if (candidateWrites.length === 0)
        return;
    const newCandidateWrites = candidateWrites.filter((row) => !row.candidate_id);
    const changedCandidateWrites = candidateWrites.filter((row) => Boolean(row.candidate_id));
    const persisted = [
        ...(newCandidateWrites.length > 0 ? await insertCandidateRows(admin, newCandidateWrites) : []),
        ...(changedCandidateWrites.length > 0 ? await updateCandidateRows(admin, changedCandidateWrites) : []),
    ];
    const candidateContactsById = new Map();
    const candidateIdsToReplace = [];
    for (const row of persisted) {
        if (!contactKeysToReplace.has(row.contactKey))
            continue;
        candidateIdsToReplace.push(row.id);
        candidateContactsById.set(row.id, contactPayloadByKey.get(row.contactKey) ?? []);
    }
    if (candidateIdsToReplace.length > 0) {
        await replaceCandidateContactsBatch(admin, {
            candidateContacts: candidateContactsById,
            candidateIdsToReplace,
            nowIso: input.nowIso,
        });
    }
}
async function syncClaimedIntegration(admin, integration) {
    const companyId = String(integration.company_id);
    const userId = String(integration.user_id);
    const settings = integration.settings ?? {};
    const host = typeof settings.host === "string" ? settings.host : hhDefaultHost();
    const employerId = typeof settings.employer_id === "string" ? settings.employer_id : null;
    const managerId = typeof settings.manager_id === "string" ? settings.manager_id : null;
    if (!employerId || !managerId)
        throw new Error("HH_SETTINGS_MISSING");
    const authState = {
        accessToken: integration.access_token ? String(integration.access_token) : "",
        refreshToken: integration.refresh_token ? String(integration.refresh_token) : null,
        tokenExpiresAt: integration.token_expires_at ? String(integration.token_expires_at) : null,
    };
    if (!authState.accessToken)
        throw new Error("HH_TOKEN_MISSING");
    const refreshAndPersist = async () => {
        if (!authState.refreshToken)
            throw new Error("HH_REFRESH_TOKEN_MISSING");
        let refreshed;
        try {
            refreshed = await refreshToken(authState.refreshToken);
            authState.accessToken = refreshed.accessToken;
            authState.refreshToken = refreshed.refreshToken ?? authState.refreshToken;
            authState.tokenExpiresAt = refreshed.expiresIn
                ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
                : authState.tokenExpiresAt;
        }
        catch (err) {
            if (err instanceof HhRefreshTokenError &&
                (0, hh_auth_retry_1.shouldReloadPersistedTokensAfterRefreshFailure)({
                    status: err.status,
                    errorCode: err.errorCode,
                    errorDescription: err.errorDescription,
                })) {
                const persisted = await loadPersistedWorkerHhAuthState(admin, {
                    integrationId: integration.id,
                    currentAccessToken: authState.accessToken,
                    currentRefreshToken: authState.refreshToken,
                });
                if (persisted) {
                    authState.accessToken = persisted.accessToken;
                    authState.refreshToken = persisted.refreshToken;
                    authState.tokenExpiresAt = persisted.tokenExpiresAt;
                    return;
                }
            }
            throw err;
        }
        const nowIso = new Date().toISOString();
        const { error } = await admin
            .from("integrations_accounts")
            .update({
            access_token: authState.accessToken,
            refresh_token: authState.refreshToken,
            token_expires_at: authState.tokenExpiresAt,
            updated_at: nowIso,
        })
            .eq("id", integration.id);
        if (error)
            throw error;
    };
    const requestJson = (path, query) => (0, hh_auth_retry_1.performHhRequestWithRefreshRetry)({
        authState,
        isRetryableFailure: (err) => err instanceof HhHttpError &&
            (0, hh_auth_retry_1.classifyHhRequestFailureForHandling)({
                code: err.code,
                status: err.status,
                oauthError: err.oauthError,
                errorValues: err.errorValues,
                description: err.description,
            }).kind === "retry_refresh_once",
        refreshAndPersist,
        request: (accessToken) => hhFetchJson(accessToken, host, path, query),
    });
    const nowIso = new Date().toISOString();
    const vacancies = await syncVacancies(admin, {
        companyId,
        employerId,
        host,
        managerId,
        nowIso,
        requestJson,
        userId,
    });
    await syncCandidatesForVacancies(admin, {
        host,
        nowIso,
        requestJson,
        userId,
        vacancies,
    });
}
function startHhAutoSync() {
    const enabled = getEnvBool("WORKER_ENABLE_HH_SYNC", false);
    if (!enabled)
        return;
    const minIntervalMin = Math.max(1, Number(node_process_1.default.env.WORKER_HH_SYNC_MIN_INTERVAL_MINUTES || 10));
    const loopEveryMs = Math.max(30_000, Number(node_process_1.default.env.WORKER_HH_SYNC_LOOP_MS || 60_000));
    const maxCompaniesPerLoop = Math.max(1, Math.min(50, Number(node_process_1.default.env.WORKER_HH_SYNC_LIMIT || 10)));
    console.log(`[worker][hh] auto-sync enabled. min_interval_min=${minIntervalMin} loop_ms=${loopEveryMs}`);
    void (async () => {
        while (true) {
            try {
                const admin = (0, supabase_1.getSupabaseAdmin)();
                let claimedCount = 0;
                while (claimedCount < maxCompaniesPerLoop) {
                    const cutoff = new Date(Date.now() - minIntervalMin * 60_000).toISOString();
                    const { data, error } = await admin.rpc("claim_due_hh_integration", {
                        worker_id: HH_SYNC_WORKER_ID,
                        cutoff,
                        lease_seconds: HH_SYNC_LEASE_SECONDS,
                    });
                    if (error)
                        throw error;
                    const integration = toClaimedIntegration(data);
                    if (!integration)
                        break;
                    claimedCount += 1;
                    try {
                        await syncClaimedIntegration(admin, integration);
                        await completeClaimedIntegration(admin, integration.id);
                    }
                    catch (accountErr) {
                        const fatal = getFatalHhAuthFailure(accountErr);
                        if (fatal) {
                            await deactivateIntegrationAccount(admin, integration, fatal);
                            console.warn("[worker][hh] integration disabled after fatal auth error", {
                                integrationId: integration.id,
                                companyId: integration.company_id,
                                userId: integration.user_id,
                                reason: fatal.reason,
                            });
                            continue;
                        }
                        await failClaimedIntegration(admin, integration.id, accountErr);
                        captureHhSyncFailureTelemetry(integration, accountErr);
                        console.warn("[worker][hh] sync account error", {
                            integrationId: integration.id,
                            companyId: integration.company_id,
                            userId: integration.user_id,
                            request: getHhRequestLogContext(accountErr),
                            errorKind: getHhErrorKind(accountErr),
                            error: formatUnknownError(accountErr),
                        });
                    }
                }
            }
            catch (err) {
                console.warn("[worker][hh] sync loop error:", formatUnknownError(err));
            }
            await sleep(loopEveryMs);
        }
    })();
}
