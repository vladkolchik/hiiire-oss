"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHhTokenExpired = isHhTokenExpired;
exports.classifyHhRequestFailureForHandling = classifyHhRequestFailureForHandling;
exports.classifyHhRefreshFailureForHandling = classifyHhRefreshFailureForHandling;
exports.shouldReloadPersistedTokensAfterRefreshFailure = shouldReloadPersistedTokensAfterRefreshFailure;
exports.classifyHhMessageFailureForHandling = classifyHhMessageFailureForHandling;
exports.performHhRequestWithRefreshRetry = performHhRequestWithRefreshRetry;
const HH_FATAL_OAUTH_ERRORS = new Set([
    "token-revoked",
    "bad-auth-type",
    "client-id-deleted",
]);
const HH_FATAL_ERROR_VALUES = new Set([
    "bad_authorization",
    "token_revoked",
    "application_not_found",
    "used_manager_account_forbidden",
    "user_auth_expected",
]);
const HH_FATAL_REFRESH_MESSAGES = new Set([
    "account is locked",
    "password invalidated",
    "login not verified",
    "token not found",
    "token is empty",
    "token has already been refreshed",
]);
const REFRESH_IN_FLIGHT = new WeakMap();
function normalizeToken(raw) {
    return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}
function buildAuthFailureDetail(input) {
    const chunks = [
        input.code,
        typeof input.status === "number" ? `status=${input.status}` : null,
        input.oauthError ? `oauth=${input.oauthError}` : null,
        input.errorValues && input.errorValues.length > 0 ? `errors=${input.errorValues.join(",")}` : null,
        input.description ? `description=${input.description}` : null,
    ].filter((value) => Boolean(value));
    return chunks.join(" ");
}
function isFatalRefreshMessage(msgNorm) {
    if (!msgNorm)
        return false;
    if (HH_FATAL_REFRESH_MESSAGES.has(msgNorm))
        return true;
    for (const known of HH_FATAL_REFRESH_MESSAGES) {
        if (msgNorm.includes(known))
            return true;
    }
    return false;
}
function isTokenExpiredFailure(input) {
    const oauthNorm = normalizeToken(input.oauthError);
    const descriptionNorm = normalizeToken(input.description);
    const errorNorms = input.errorValues.map((value) => normalizeToken(value));
    return (input.status === 403 &&
        (oauthNorm === "token-expired" ||
            errorNorms.includes("token_expired") ||
            descriptionNorm.includes("token expired")));
}
function isHhTokenExpired(expiresAtIso, options) {
    if (!expiresAtIso)
        return false;
    const expiresAt = Date.parse(expiresAtIso);
    if (!Number.isFinite(expiresAt))
        return false;
    const now = typeof options?.now === "function"
        ? options.now()
        : typeof options?.now === "number"
            ? options.now
            : Date.now();
    const skewMs = (options?.skewSeconds ?? 60) * 1000;
    return expiresAt <= now + skewMs;
}
function classifyHhRequestFailureForHandling(input) {
    if (isTokenExpiredFailure(input)) {
        return { kind: "retry_refresh_once", reason: input.code };
    }
    const oauthNorm = normalizeToken(input.oauthError);
    const hasFatalErrorValue = input.errorValues.some((value) => HH_FATAL_ERROR_VALUES.has(normalizeToken(value)));
    const isFatal = input.status === 401 || HH_FATAL_OAUTH_ERRORS.has(oauthNorm) || hasFatalErrorValue;
    if (!isFatal) {
        return { kind: "not_auth_related" };
    }
    return {
        kind: "fatal_disconnect",
        reason: input.code,
        detail: buildAuthFailureDetail({
            code: input.code,
            status: input.status,
            oauthError: input.oauthError,
            errorValues: input.errorValues,
            description: input.description,
        }),
    };
}
function classifyHhRefreshFailureForHandling(input) {
    const errorCodeNorm = normalizeToken(input.errorCode);
    const descriptionNorm = normalizeToken(input.errorDescription);
    const isFatal = input.status === 401 ||
        input.status === 403 ||
        errorCodeNorm === "invalid_grant" ||
        isFatalRefreshMessage(descriptionNorm);
    if (!isFatal) {
        return { kind: "not_auth_related" };
    }
    return {
        kind: "fatal_disconnect",
        reason: "HH_REFRESH_AUTH_FAILED",
        detail: buildAuthFailureDetail({
            code: "HH_REFRESH_AUTH_FAILED",
            status: input.status,
            description: input.errorDescription || input.errorCode || "refresh token error",
        }),
    };
}
function shouldReloadPersistedTokensAfterRefreshFailure(input) {
    return (normalizeToken(input.errorCode) === "invalid_grant" &&
        normalizeToken(input.errorDescription).includes("token has already been refreshed"));
}
function classifyHhMessageFailureForHandling(message) {
    const normalized = normalizeToken(message);
    if (!normalized)
        return { kind: "not_auth_related" };
    if (normalized === "hh_token_missing" || normalized === "hh_refresh_token_missing") {
        return {
            kind: "fatal_disconnect",
            reason: message,
            detail: message,
        };
    }
    const refreshDecision = classifyHhRefreshFailureForHandling({
        status: 0,
        errorCode: null,
        errorDescription: message,
    });
    if (refreshDecision.kind === "fatal_disconnect") {
        return refreshDecision;
    }
    if (normalized.includes("hh_http_401")) {
        return {
            kind: "fatal_disconnect",
            reason: "HH_HTTP_401",
            detail: "HH_HTTP_401",
        };
    }
    return { kind: "not_auth_related" };
}
async function runSingleFlightRefresh(input) {
    const current = REFRESH_IN_FLIGHT.get(input.authState);
    if (current) {
        await current;
        return;
    }
    const next = (async () => {
        try {
            await input.refreshAndPersist();
        }
        finally {
            REFRESH_IN_FLIGHT.delete(input.authState);
        }
    })();
    REFRESH_IN_FLIGHT.set(input.authState, next);
    await next;
}
async function performHhRequestWithRefreshRetry(input) {
    let refreshUsed = false;
    if (isHhTokenExpired(input.authState.tokenExpiresAt, { now: input.now, skewSeconds: input.skewSeconds })) {
        if (!input.authState.refreshToken)
            throw new Error("HH_REFRESH_TOKEN_MISSING");
        await runSingleFlightRefresh({
            authState: input.authState,
            refreshAndPersist: input.refreshAndPersist,
        });
        refreshUsed = true;
    }
    try {
        return await input.request(input.authState.accessToken);
    }
    catch (err) {
        if (refreshUsed || !input.isRetryableFailure(err)) {
            throw err;
        }
        if (!input.authState.refreshToken)
            throw new Error("HH_REFRESH_TOKEN_MISSING");
        await runSingleFlightRefresh({
            authState: input.authState,
            refreshAndPersist: input.refreshAndPersist,
        });
        return input.request(input.authState.accessToken);
    }
}
