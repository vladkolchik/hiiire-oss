import assert from "node:assert/strict";
import test from "node:test";

import {
  getLandingHeaderAuthView,
  resolveLandingHeaderAuthenticatedEmail,
} from "../lib/landing/header-auth.ts";

const confirmedUser = {
  email: "hr.owner+5@example.com",
  email_confirmed_at: "2026-05-30T10:00:00.000Z",
  confirmed_at: null,
};

test("landing header auth resolves confirmed users to their email", async () => {
  const email = await resolveLandingHeaderAuthenticatedEmail(async () => ({
    data: { user: confirmedUser },
    error: null,
  }));

  assert.equal(email, "hr.owner+5@example.com");
  assert.deepEqual(getLandingHeaderAuthView(email), {
    kind: "authenticated",
    email: "hr.owner+5@example.com",
    dashboardHref: "/dashboard",
  });
});

test("landing header auth treats pending email confirmation as guest", async () => {
  const email = await resolveLandingHeaderAuthenticatedEmail(async () => ({
    data: {
      user: {
        email: "pending@example.com",
        email_confirmed_at: null,
        confirmed_at: null,
      },
    },
    error: null,
  }));

  assert.equal(email, null);
  assert.deepEqual(getLandingHeaderAuthView(email), {
    kind: "guest",
    loginHref: "/login",
    signupHref: "/signup",
  });
});

test("landing header auth falls back to guest when auth returns an error", async () => {
  const email = await resolveLandingHeaderAuthenticatedEmail(async () => ({
    data: { user: confirmedUser },
    error: new Error("auth unavailable"),
  }));

  assert.equal(email, null);
  assert.equal(getLandingHeaderAuthView(email).kind, "guest");
});

test("landing header auth falls back to guest when the client throws", async () => {
  const email = await resolveLandingHeaderAuthenticatedEmail(async () => {
    throw new Error("missing env");
  });

  assert.equal(email, null);
  assert.equal(getLandingHeaderAuthView(email).kind, "guest");
});
