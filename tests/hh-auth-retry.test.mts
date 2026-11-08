import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyHhMessageFailureForHandling as classifyAppMessageFailure,
  classifyHhRefreshFailureForHandling as classifyAppRefreshFailure,
  classifyHhRequestFailureForHandling as classifyAppRequestFailure,
  performHhRequestWithRefreshRetry as performAppHhRequestWithRefreshRetry,
  shouldReloadPersistedTokensAfterRefreshFailure as shouldAppReloadPersistedTokensAfterRefreshFailure,
} from "../lib/hh/auth-retry.ts";
import {
  classifyHhMessageFailureForHandling as classifyWorkerMessageFailure,
  classifyHhRefreshFailureForHandling as classifyWorkerRefreshFailure,
  classifyHhRequestFailureForHandling as classifyWorkerRequestFailure,
  performHhRequestWithRefreshRetry as performWorkerHhRequestWithRefreshRetry,
  shouldReloadPersistedTokensAfterRefreshFailure as shouldWorkerReloadPersistedTokensAfterRefreshFailure,
} from "../worker/src/hh-auth-retry.ts";

test("app auth helper treats token_expired request failure as retryable", () => {
  assert.deepEqual(
    classifyAppRequestFailure({
      code: "HH_HTTP_403",
      status: 403,
      oauthError: "token-expired",
      errorValues: ["token_expired"],
      description: "access token expired",
    }),
    {
      kind: "retry_refresh_once",
      reason: "HH_HTTP_403",
    }
  );
});

test("worker auth helper treats token_expired request failure as retryable", () => {
  assert.deepEqual(
    classifyWorkerRequestFailure({
      code: "HH_HTTP_403",
      status: 403,
      oauthError: "token-expired",
      errorValues: ["token_expired"],
      description: "access token expired",
    }),
    {
      kind: "retry_refresh_once",
      reason: "HH_HTTP_403",
    }
  );
});

test("app auth helper does not auto-disconnect on generic 403 without fatal metadata", () => {
  assert.deepEqual(
    classifyAppRequestFailure({
      code: "HH_HTTP_403",
      status: 403,
      oauthError: null,
      errorValues: [],
      description: "quota exceeded",
    }),
    {
      kind: "not_auth_related",
    }
  );
});

test("worker auth helper does not auto-disconnect on generic 403 without fatal metadata", () => {
  assert.deepEqual(
    classifyWorkerRequestFailure({
      code: "HH_HTTP_403",
      status: 403,
      oauthError: null,
      errorValues: [],
      description: "quota exceeded",
    }),
    {
      kind: "not_auth_related",
    }
  );
});

test("app auth helper treats invalid_grant refresh failure as fatal", () => {
  assert.deepEqual(
    classifyAppRefreshFailure({
      status: 400,
      errorCode: "invalid_grant",
      errorDescription: "token has already been refreshed",
    }),
    {
      kind: "fatal_disconnect",
      reason: "HH_REFRESH_AUTH_FAILED",
      detail:
        "HH_REFRESH_AUTH_FAILED status=400 description=token has already been refreshed",
    }
  );
});

test("worker auth helper treats invalid_grant refresh failure as fatal", () => {
  assert.deepEqual(
    classifyWorkerRefreshFailure({
      status: 400,
      errorCode: "invalid_grant",
      errorDescription: "token has already been refreshed",
    }),
    {
      kind: "fatal_disconnect",
      reason: "HH_REFRESH_AUTH_FAILED",
      detail:
        "HH_REFRESH_AUTH_FAILED status=400 description=token has already been refreshed",
    }
  );
});

test("app helper marks 'already refreshed' refresh failure as DB reload candidate", () => {
  assert.equal(
    shouldAppReloadPersistedTokensAfterRefreshFailure({
      status: 400,
      errorCode: "invalid_grant",
      errorDescription: "token has already been refreshed",
    }),
    true
  );
});

test("worker helper marks 'already refreshed' refresh failure as DB reload candidate", () => {
  assert.equal(
    shouldWorkerReloadPersistedTokensAfterRefreshFailure({
      status: 400,
      errorCode: "invalid_grant",
      errorDescription: "token has already been refreshed",
    }),
    true
  );
});

test("app message classifier treats missing token as fatal disconnect", () => {
  assert.deepEqual(classifyAppMessageFailure("HH_REFRESH_TOKEN_MISSING"), {
    kind: "fatal_disconnect",
    reason: "HH_REFRESH_TOKEN_MISSING",
    detail: "HH_REFRESH_TOKEN_MISSING",
  });
});

test("worker message classifier treats missing token as fatal disconnect", () => {
  assert.deepEqual(classifyWorkerMessageFailure("HH_TOKEN_MISSING"), {
    kind: "fatal_disconnect",
    reason: "HH_TOKEN_MISSING",
    detail: "HH_TOKEN_MISSING",
  });
});

test("app request wrapper refreshes expired token before request", async () => {
  const calls: Array<string> = [];
  const authState = {
    accessToken: "old-token",
    refreshToken: "refresh-token",
    tokenExpiresAt: "2026-04-10T00:00:00.000Z",
  };

  const result = await performAppHhRequestWithRefreshRetry({
    authState,
    now: () => Date.parse("2026-04-10T01:00:00.000Z"),
    isRetryableFailure: () => false,
    refreshAndPersist: async () => {
      calls.push("refresh");
      authState.accessToken = "new-token";
      authState.refreshToken = "new-refresh-token";
      authState.tokenExpiresAt = "2026-04-10T02:00:00.000Z";
    },
    request: async (accessToken) => {
      calls.push(`request:${accessToken}`);
      return { ok: true };
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ["refresh", "request:new-token"]);
});

test("app request wrapper coalesces parallel refreshes for shared auth state", async () => {
  const calls: Array<string> = [];
  const authState = {
    accessToken: "old-token",
    refreshToken: "refresh-token",
    tokenExpiresAt: "2026-04-10T00:00:00.000Z",
  };

  await Promise.all([
    performAppHhRequestWithRefreshRetry({
      authState,
      now: () => Date.parse("2026-04-10T01:00:00.000Z"),
      isRetryableFailure: () => false,
      refreshAndPersist: async () => {
        calls.push("refresh");
        await new Promise((resolve) => setTimeout(resolve, 10));
        authState.accessToken = "new-token";
        authState.refreshToken = "new-refresh-token";
        authState.tokenExpiresAt = "2026-04-10T02:00:00.000Z";
      },
      request: async (accessToken) => {
        calls.push(`request-a:${accessToken}`);
        return { ok: true };
      },
    }),
    performAppHhRequestWithRefreshRetry({
      authState,
      now: () => Date.parse("2026-04-10T01:00:00.000Z"),
      isRetryableFailure: () => false,
      refreshAndPersist: async () => {
        calls.push("refresh");
        await new Promise((resolve) => setTimeout(resolve, 10));
        authState.accessToken = "new-token";
        authState.refreshToken = "new-refresh-token";
        authState.tokenExpiresAt = "2026-04-10T02:00:00.000Z";
      },
      request: async (accessToken) => {
        calls.push(`request-b:${accessToken}`);
        return { ok: true };
      },
    }),
  ]);

  assert.equal(
    calls.filter((entry) => entry === "refresh").length,
    1
  );
  assert.ok(calls.includes("request-a:new-token"));
  assert.ok(calls.includes("request-b:new-token"));
});

test("worker request wrapper refreshes once after token_expired and retries", async () => {
  const calls: Array<string> = [];
  const authState = {
    accessToken: "old-token",
    refreshToken: "refresh-token",
    tokenExpiresAt: null,
  };

  const result = await performWorkerHhRequestWithRefreshRetry({
    authState,
    isRetryableFailure: (err) =>
      classifyWorkerRequestFailure(err as Parameters<typeof classifyWorkerRequestFailure>[0]).kind === "retry_refresh_once",
    refreshAndPersist: async () => {
      calls.push("refresh");
      authState.accessToken = "new-token";
      authState.refreshToken = "new-refresh-token";
      authState.tokenExpiresAt = "2026-04-10T02:00:00.000Z";
    },
    request: async (accessToken) => {
      calls.push(`request:${accessToken}`);
      if (accessToken === "old-token") {
        throw {
          code: "HH_HTTP_403",
          status: 403,
          oauthError: "token-expired",
          errorValues: ["token_expired"],
          description: "access token expired",
        };
      }
      return { ok: true };
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ["request:old-token", "refresh", "request:new-token"]);
});

test("worker request wrapper coalesces parallel refreshes for shared auth state", async () => {
  const calls: Array<string> = [];
  const authState = {
    accessToken: "old-token",
    refreshToken: "refresh-token",
    tokenExpiresAt: "2026-04-10T00:00:00.000Z",
  };

  await Promise.all([
    performWorkerHhRequestWithRefreshRetry({
      authState,
      now: () => Date.parse("2026-04-10T01:00:00.000Z"),
      isRetryableFailure: () => false,
      refreshAndPersist: async () => {
        calls.push("refresh");
        await new Promise((resolve) => setTimeout(resolve, 10));
        authState.accessToken = "new-token";
        authState.refreshToken = "new-refresh-token";
        authState.tokenExpiresAt = "2026-04-10T02:00:00.000Z";
      },
      request: async (accessToken) => {
        calls.push(`request-a:${accessToken}`);
        return { ok: true };
      },
    }),
    performWorkerHhRequestWithRefreshRetry({
      authState,
      now: () => Date.parse("2026-04-10T01:00:00.000Z"),
      isRetryableFailure: () => false,
      refreshAndPersist: async () => {
        calls.push("refresh");
        await new Promise((resolve) => setTimeout(resolve, 10));
        authState.accessToken = "new-token";
        authState.refreshToken = "new-refresh-token";
        authState.tokenExpiresAt = "2026-04-10T02:00:00.000Z";
      },
      request: async (accessToken) => {
        calls.push(`request-b:${accessToken}`);
        return { ok: true };
      },
    }),
  ]);

  assert.equal(
    calls.filter((entry) => entry === "refresh").length,
    1
  );
  assert.ok(calls.includes("request-a:new-token"));
  assert.ok(calls.includes("request-b:new-token"));
});
