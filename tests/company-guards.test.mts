import assert from "node:assert/strict";
import test from "node:test";

import { requireCompanyContext } from "../lib/access/company-guards.ts";

test("requireCompanyContext blocks a pending email session before profile lookup", async () => {
  let profileLookups = 0;

  const supabase = {
    auth: {
      async getUser() {
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
    from(table: string) {
      assert.equal(table, "profiles");
      profileLookups += 1;

      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: {
                      company_id: "company-1",
                      role: "hr",
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await requireCompanyContext(supabase);

  assert.equal(result.ok, false);
  assert.equal(profileLookups, 0);

  if (result.ok) {
    assert.fail("Expected pending email session to be rejected");
  }

  assert.equal(result.response.status, 403);
  assert.deepEqual(await result.response.json(), { error: "EMAIL_NOT_CONFIRMED" });
});

test("requireCompanyContext still allows confirmed sessions through to the company profile lookup", async () => {
  let profileLookups = 0;

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
    from(table: string) {
      assert.equal(table, "profiles");
      profileLookups += 1;

      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: {
                      company_id: "company-2",
                      role: "admin",
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await requireCompanyContext(supabase);

  assert.equal(result.ok, true);
  assert.equal(profileLookups, 1);

  if (!result.ok) {
    assert.fail("Expected confirmed session to pass through");
  }

  assert.deepEqual(result.data, {
    userId: "user-2",
    email: "confirmed@example.com",
    companyId: "company-2",
    role: "admin",
  });
});
