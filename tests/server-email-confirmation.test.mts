import assert from "node:assert/strict";
import test from "node:test";

import { getConfirmedServerUser } from "../lib/auth/server-email-confirmation.ts";

test("getConfirmedServerUser blocks pending sessions", async () => {
  let authLookups = 0;

  const supabase = {
    auth: {
      async getUser() {
        authLookups += 1;
        return {
          data: {
            user: {
              id: "user-1",
              email: "pending@example.com",
            },
          },
          error: null,
        };
      },
    },
  };

  const result = await getConfirmedServerUser(supabase);

  assert.equal(authLookups, 1);
  assert.deepEqual(result, { ok: false, reason: "pending_email" });
});

test("getConfirmedServerUser passes confirmed sessions through", async () => {
  const supabase = {
    auth: {
      async getUser() {
        return {
          data: {
            user: {
              id: "user-2",
              email: "confirmed@example.com",
              email_confirmed_at: "2026-04-12T00:00:00.000Z",
            },
          },
          error: null,
        };
      },
    },
  };

  const result = await getConfirmedServerUser(supabase);

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("Expected confirmed session to pass through");
  }

  assert.deepEqual(result.user, {
    id: "user-2",
    email: "confirmed@example.com",
    email_confirmed_at: "2026-04-12T00:00:00.000Z",
  });
});
