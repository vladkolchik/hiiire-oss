import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeVerificationEmailResendRateLimit,
  verificationMaxResendsPerWindow,
  verificationResendCooldownSeconds,
} from "../lib/auth/verification-resend-rate-limit-core.ts";

test("verification resend cooldown is shared for the same email across fresh checks", () => {
  const now = 1_710_000_000_000;

  const first = consumeVerificationEmailResendRateLimit("User@example.com", now);
  const second = consumeVerificationEmailResendRateLimit("user@example.com", now + 1_000);

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);

  if (second.ok) {
    assert.fail("Expected cooldown response");
  }

  assert.equal(second.reason, "cooldown");
  assert.equal(second.cooldownLeftSeconds, verificationResendCooldownSeconds - 1);
});

test("verification resend hourly limit is shared for the same email across fresh checks", () => {
  const email = "limit@example.com";
  let now = 1_720_000_000_000;

  for (let attempt = 0; attempt < verificationMaxResendsPerWindow; attempt += 1) {
    const decision = consumeVerificationEmailResendRateLimit(email, now);
    assert.equal(decision.ok, true);
    now += verificationResendCooldownSeconds * 1_000 + 1;
  }

  const blocked = consumeVerificationEmailResendRateLimit(email, now);

  assert.equal(blocked.ok, false);

  if (blocked.ok) {
    assert.fail("Expected rate limit response");
  }

  assert.equal(blocked.reason, "rate_limit");
  assert.ok(blocked.retryAfterSeconds > 0);
});
