import assert from "node:assert/strict";
import test from "node:test";

import { shouldNotifyForPostSignupEmailState } from "../lib/auth/signup-notification-eligibility.ts";

test("shouldNotifyForPostSignupEmailState allows notification when email state belongs to new user", () => {
  assert.equal(
    shouldNotifyForPostSignupEmailState(
      {
        user_id: "new-user",
        email: "anna@example.com",
        email_confirmed: false,
      },
      "new-user",
    ),
    true,
  );
});

test("shouldNotifyForPostSignupEmailState skips notification when email state is missing after signup", () => {
  assert.equal(shouldNotifyForPostSignupEmailState(null, "new-user"), false);
});

test("shouldNotifyForPostSignupEmailState skips notification when email state lookup failed", () => {
  assert.equal(shouldNotifyForPostSignupEmailState(undefined, "new-user"), false);
});

test("shouldNotifyForPostSignupEmailState blocks notification for another confirmed user", () => {
  assert.equal(
    shouldNotifyForPostSignupEmailState(
      {
        user_id: "other-user",
        email: "anna@example.com",
        email_confirmed: true,
      },
      "new-user",
    ),
    false,
  );
});

test("shouldNotifyForPostSignupEmailState blocks notification for another unconfirmed user", () => {
  assert.equal(
    shouldNotifyForPostSignupEmailState(
      {
        user_id: "other-user",
        email: "anna@example.com",
        email_confirmed: false,
      },
      "new-user",
    ),
    false,
  );
});
