import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true };
    }
    if (specifier === "next/server") {
      return {
        url: "data:text/javascript,export%20function%20after(callback)%20%7B%20return%20callback()%3B%20%7D",
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/")) {
      const withoutAlias = specifier.slice(2);
      const resolvedPath = path.resolve(withoutAlias);
      const filePath = existsSync(resolvedPath) ? resolvedPath : `${resolvedPath}.ts`;
      return { url: pathToFileURL(filePath).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { notifyOwnerSignupCreated, scheduleOwnerSignupNotification } = await import("../lib/telegram/owner-signup-notification.ts");

const signup = {
  userId: "user-123",
  companyId: "company-456",
  name: "Анна Иванова",
  email: "anna@example.com",
  phone: "+7 999 123-45-67",
  company: "Хайр Софт",
  requestedPlan: "starter" as const,
  marketingAttribution: undefined,
};

test("notifyOwnerSignupCreated sends formatted message through owner notifier dependency", async () => {
  const sent: string[] = [];

  const result = await notifyOwnerSignupCreated(signup, {
    loadPlatformSummary: async () => ({
      companies: 1,
      users: 2,
      vacancies: 3,
      candidates: 4,
      aiRequests: 5,
    }),
    notifyOwners: async (text) => {
      sent.push(text);
      return { attempted: 1, sent: 1, failed: 0 };
    },
  });

  assert.deepEqual(result, { attempted: 1, sent: 1, failed: 0 });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Новая регистрация/);
  assert.match(sent[0], /Email: anna@example\.com/);
  assert.match(sent[0], /Компании: 1/);
});

test("notifyOwnerSignupCreated renders summary fallback when count loading fails", async () => {
  const sent: string[] = [];

  const result = await notifyOwnerSignupCreated(signup, {
    loadPlatformSummary: async () => {
      throw new Error("count failed");
    },
    notifyOwners: async (text) => {
      sent.push(text);
      return { attempted: 1, sent: 1, failed: 0 };
    },
  });

  assert.deepEqual(result, { attempted: 1, sent: 1, failed: 0 });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Не удалось загрузить актуальную сводку/);
});

test("notifyOwnerSignupCreated keeps Telegram failures best-effort to caller", async () => {
  const result = await notifyOwnerSignupCreated(signup, {
    loadPlatformSummary: async () => ({
      companies: 1,
      users: 2,
      vacancies: 3,
      candidates: 4,
      aiRequests: 5,
    }),
    notifyOwners: async () => {
      throw new Error("telegram timeout");
    },
  });

  assert.deepEqual(result, { attempted: 0, sent: 0, failed: 0 });
});

test("notifyOwnerSignupCreated keeps formatter failures best-effort to caller", async () => {
  const result = await notifyOwnerSignupCreated(signup, {
    formatOwnerSignupMessage: () => {
      throw new Error("format failed");
    },
    loadPlatformSummary: async () => ({
      companies: 1,
      users: 2,
      vacancies: 3,
      candidates: 4,
      aiRequests: 5,
    }),
    notifyOwners: async () => {
      throw new Error("should not send");
    },
  });

  assert.deepEqual(result, { attempted: 0, sent: 0, failed: 0 });
});

test("notifyOwnerSignupCreated bounds hung summary loading", async () => {
  const startedAt = Date.now();
  const result = await notifyOwnerSignupCreated(signup, {
    summaryTimeoutMs: 25,
    loadPlatformSummary: async () => new Promise(() => undefined),
    notifyOwners: async (text) => {
      assert.match(text, /Не удалось загрузить актуальную сводку/);
      return { attempted: 1, sent: 1, failed: 0 };
    },
  });

  assert.deepEqual(result, { attempted: 1, sent: 1, failed: 0 });
  assert.ok(Date.now() - startedAt < 250);
});

test("notifyOwnerSignupCreated bounds hung owner delivery", async () => {
  const startedAt = Date.now();
  const result = await notifyOwnerSignupCreated(signup, {
    deliveryTimeoutMs: 25,
    loadPlatformSummary: async () => ({
      companies: 1,
      users: 2,
      vacancies: 3,
      candidates: 4,
      aiRequests: 5,
    }),
    notifyOwners: async () => new Promise(() => undefined),
  });

  assert.deepEqual(result, { attempted: 0, sent: 0, failed: 0 });
  assert.ok(Date.now() - startedAt < 250);
});

test("scheduleOwnerSignupNotification never throws into signup when scheduling fails", () => {
  assert.doesNotThrow(() =>
    scheduleOwnerSignupNotification(signup, {
      defer: () => {
        throw new Error("after failed");
      },
      notifier: async () => {
        throw new Error("should not be reached");
      },
    }),
  );
});

test("scheduleOwnerSignupNotification callback catches synchronously throwing notifiers", async () => {
  const deferred: Array<() => void | Promise<void>> = [];

  scheduleOwnerSignupNotification(signup, {
    defer: (callback) => {
      deferred.push(callback);
    },
    notifier: () => {
      throw new Error("sync notifier failed");
    },
  });

  assert.equal(deferred.length, 1);
  await assert.doesNotReject(() => Promise.resolve(deferred[0]()));
});

test("scheduleOwnerSignupNotification skips notifier when guard returns false", async () => {
  const deferred: Array<() => void | Promise<void>> = [];
  let notifierCalled = false;

  scheduleOwnerSignupNotification(signup, {
    defer: (callback) => {
      deferred.push(callback);
    },
    shouldNotify: async () => false,
    notifier: async () => {
      notifierCalled = true;
      return { attempted: 1, sent: 1, failed: 0 };
    },
  });

  assert.equal(deferred.length, 1);
  await assert.doesNotReject(() => Promise.resolve(deferred[0]()));
  assert.equal(notifierCalled, false);
});

test("scheduleOwnerSignupNotification bounds hung guards and skips notifier", async () => {
  const deferred: Array<() => void | Promise<void>> = [];
  let notifierCalled = false;
  const startedAt = Date.now();

  scheduleOwnerSignupNotification(signup, {
    defer: (callback) => {
      deferred.push(callback);
    },
    guardTimeoutMs: 25,
    shouldNotify: async () => new Promise(() => undefined),
    notifier: async () => {
      notifierCalled = true;
      return { attempted: 1, sent: 1, failed: 0 };
    },
  });

  assert.equal(deferred.length, 1);
  await assert.doesNotReject(() => Promise.resolve(deferred[0]()));
  assert.equal(notifierCalled, false);
  assert.ok(Date.now() - startedAt < 250);
});

test("scheduleOwnerSignupNotification passes the notifier promise to the lifecycle defer hook", async () => {
  const deferred: Array<() => void | Promise<void>> = [];
  let notifierStarted = false;
  let notifierSettled = false;

  scheduleOwnerSignupNotification(signup, {
    defer: (callback) => {
      deferred.push(callback);
    },
    notifier: async () => {
      notifierStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 50));
      notifierSettled = true;
      return { attempted: 1, sent: 1, failed: 0 };
    },
  });

  assert.equal(deferred.length, 1);
  assert.equal(notifierStarted, false);

  const callbackResult = deferred[0]();
  assert.ok(callbackResult instanceof Promise);

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(notifierStarted, true);
  assert.equal(notifierSettled, false);
  await callbackResult;
  assert.equal(notifierSettled, true);
});
