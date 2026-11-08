import assert from "node:assert/strict";
import test from "node:test";

import {
  getAuthRedirectPath,
  hasPendingEmailConfirmation,
  isSupabaseEmailConfirmed,
} from "../lib/auth/email-confirmation.ts";

test("treats a user without confirmation timestamps as pending email confirmation", () => {
  const user = {
    email: "pending@example.com",
  };

  assert.equal(isSupabaseEmailConfirmed(user), false);
  assert.equal(hasPendingEmailConfirmation(user), true);
});

test("treats email_confirmed_at as a confirmed email marker", () => {
  const user = {
    email: "confirmed@example.com",
    email_confirmed_at: "2026-04-12T00:00:00.000Z",
  };

  assert.equal(isSupabaseEmailConfirmed(user), true);
  assert.equal(hasPendingEmailConfirmation(user), false);
});

test("redirects guests away from dashboard to login", () => {
  assert.equal(getAuthRedirectPath("/dashboard", null), "/login");
});

test("redirects authenticated users with pending confirmation away from dashboard", () => {
  const user = {
    email: "pending@example.com",
  };

  assert.equal(getAuthRedirectPath("/dashboard", user), "/verify-email");
});

test("keeps authenticated users with pending confirmation on verify-email", () => {
  const user = {
    email: "pending@example.com",
  };

  assert.equal(getAuthRedirectPath("/verify-email", user), null);
});

test("redirects confirmed users away from login to dashboard", () => {
  const user = {
    email: "confirmed@example.com",
    email_confirmed_at: "2026-04-12T00:00:00.000Z",
  };

  assert.equal(getAuthRedirectPath("/login", user), "/dashboard");
});
