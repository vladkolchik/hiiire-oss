import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readSource(file: string) {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const useAuth = readFileSync("hooks/use-auth.tsx", "utf8");
const resetPassword = readFileSync("app/(auth)/reset-password/page.tsx", "utf8");
const verifyEmail = readFileSync("app/(auth)/verify-email/page.tsx", "utf8");
const navigation = readFileSync("components/landing/navigation.tsx", "utf8");
const loginRoute = readSource("app/api/auth/login/route.ts");
const logoutRoute = readSource("app/api/auth/logout/route.ts");
const sessionRoute = readSource("app/api/auth/session/route.ts");
const passwordUpdateRoute = readSource("app/api/auth/password-update/route.ts");
const authCallback = readFileSync("lib/supabase/auth-callback.ts", "utf8");
const passwordResetContextServer = readFileSync("lib/auth/password-reset-context.server.ts", "utf8");
const passwordResetRoute = readFileSync("app/api/auth/password-reset/route.ts", "utf8");

test("auth browser surfaces use Hiiire auth API routes instead of Supabase browser auth", () => {
  for (const [name, source] of [
    ["hooks/use-auth.tsx", useAuth],
    ["app/(auth)/reset-password/page.tsx", resetPassword],
    ["app/(auth)/verify-email/page.tsx", verifyEmail],
    ["components/landing/navigation.tsx", navigation],
  ] as const) {
    assert.doesNotMatch(source, /createSupabaseBrowserClient/, name);
    assert.doesNotMatch(source, /supabase\.auth/, name);
  }

  assert.match(useAuth, /\/api\/auth\/session/);
  assert.match(useAuth, /\/api\/auth\/login/);
  assert.match(useAuth, /\/api\/auth\/logout/);
  assert.match(resetPassword, /\/api\/auth\/password-update/);
});

test("auth BFF routes keep security and recovery contracts", () => {
  assert.match(loginRoute, /requireSameOriginRequest/);
  assert.match(loginRoute, /getClientIp/);
  assert.match(loginRoute, /checkFixedWindowRateLimit[\s\S]*checkFixedWindowRateLimit/);
  assert.match(loginRoute, /writeVerificationContext/);
  assert.match(loginRoute, /createVerificationContext/);
  assert.match(loginRoute, /EMAIL_NOT_CONFIRMED/);

  assert.match(logoutRoute, /requireSameOriginRequest/);
  assert.match(logoutRoute, /signOut\(/);
  assert.match(logoutRoute, /\{\s*ok:\s*true\s*\}/);

  assert.match(sessionRoute, /createSupabaseServerClient/);
  assert.match(sessionRoute, /hasPendingEmailConfirmation/);
  assert.match(sessionRoute, /profiles/);
  assert.match(sessionRoute, /role:\s*validRole\(profile\?\.role\)/);
  assert.doesNotMatch(sessionRoute, /userMetadata\.role|user_metadata\.role/);
  assert.match(sessionRoute, /["']Cache-Control["']:\s*["']no-store/);

  assert.match(passwordUpdateRoute, /requireSameOriginRequest/);
  assert.match(passwordUpdateRoute, /readPasswordResetRecoveryMarker/);
  assert.match(passwordUpdateRoute, /clearPasswordResetContext/);
  assert.match(passwordUpdateRoute, /clearPasswordResetRecoveryMarker/);
  assert.match(passwordUpdateRoute, /getPasswordValidationMessage/);
  assert.match(passwordUpdateRoute, /getPasswordUpdateErrorMessage/);
  assert.match(passwordUpdateRoute, /RESET_CONTEXT_UNVERIFIED/);
  assert.match(passwordUpdateRoute, /RESET_CONTEXT_MISMATCH/);
  assert.match(passwordUpdateRoute, /data\.user\.email\?\.trim\(\)\.toLowerCase\(\)\s*!==\s*recoveryMarker\.email/);
  assert.ok(
    passwordUpdateRoute.indexOf("readPasswordResetRecoveryMarker") <
      passwordUpdateRoute.indexOf("updateUser({ password"),
    "password update must verify the recovery marker before updateUser"
  );

  assert.match(passwordResetRoute, /requireSameOriginRequest/);
  assert.match(passwordResetRoute, /if \(!csrf\.ok\) return csrf\.response/);
  assert.doesNotMatch(passwordResetRoute, /if \(csrf\) return csrf/);
  assert.ok(
    passwordResetRoute.indexOf("requireSameOriginRequest(req)") < passwordResetRoute.indexOf("req.json()"),
    "password reset request guard must run before parsing the request body"
  );
  assert.ok(
    passwordResetRoute.indexOf("requireSameOriginRequest(req)") < passwordResetRoute.indexOf("resetPasswordForEmail"),
    "password reset request guard must run before Supabase provider work"
  );
  assert.ok(
    passwordResetRoute.indexOf("requireSameOriginRequest(req)", passwordResetRoute.indexOf("export async function DELETE")) >
      passwordResetRoute.indexOf("export async function DELETE"),
    "password reset DELETE must guard same-origin requests before clearing cookies"
  );

  assert.match(authCallback, /recoveryFlow/);
  assert.match(authCallback, /createPasswordResetRecoveryMarker/);
  assert.match(authCallback, /writePasswordResetRecoveryMarker/);
  assert.match(authCallback, /clearPasswordResetRecoveryMarker/);
  assert.doesNotMatch(authCallback, /readPasswordResetContext/);
  assert.ok(
    authCallback.match(/writePasswordResetRecoveryMarker/g)?.length >= 2,
    "both successful callback branches must write recovery markers"
  );

  assert.match(passwordResetContextServer, /parseSignedJson/);
  assert.match(passwordResetContextServer, /passwordResetRecoveryMarkerCookieName/);
  assert.match(passwordResetContextServer, /createPasswordResetRecoveryMarker/);
  assert.match(passwordResetContextServer, /readPasswordResetRecoveryMarker/);
  assert.match(passwordResetContextServer, /writePasswordResetRecoveryMarker/);
  assert.match(passwordResetContextServer, /clearPasswordResetRecoveryMarker/);

  assert.match(passwordResetRoute, /readPasswordResetRecoveryMarker/);
  assert.match(passwordResetRoute, /recoveryVerified/);
  assert.match(passwordResetRoute, /contextId:\s*context\?\.contextId\s*\?\?\s*null/);
  assert.match(passwordResetRoute, /email:\s*context\?\.email\s*\?\?\s*recoveryMarker\?\.email\s*\?\?\s*null/);
  assert.match(passwordResetRoute, /clearPasswordResetRecoveryMarker/);
});

test("auth hook treats session loading as a strict API contract", () => {
  assert.match(useAuth, /async function fetchAuthSession\(\): Promise<AppUser \| null>/);
  assert.match(useAuth, /fetch\("\/api\/auth\/session", \{ method: "GET", cache: "no-store" \}\)/);
  assert.match(useAuth, /throw new Error\("Не удалось загрузить сессию"\)/);
  assert.match(useAuth, /if \(!payload\.user\) return null/);
  assert.match(useAuth, /createdAt: new Date\(payload\.user\.createdAt\)/);

  assert.match(useAuth, /appUser = await fetchAuthSession\(\)/);
  assert.match(useAuth, /catch\s*\{[\s\S]*throw new AuthFlowError\("UNKNOWN_AUTH_ERROR"/);
  assert.match(useAuth, /const appUser = await fetchAuthSession\(\);[\s\S]*setUser\(appUser\);[\s\S]*Keep current user as-is on refresh errors/);
});

test("reset password page requires recovery verification from auth APIs", () => {
  assert.match(resetPassword, /\/api\/auth\/session/);
  assert.match(resetPassword, /\/api\/auth\/password-reset/);
  assert.match(resetPassword, /recoveryVerified/);
  assert.doesNotMatch(resetPassword, /contextPayload\?\.contextId/);
  assert.match(resetPassword, /\/api\/auth\/password-update/);
  assert.match(resetPassword, /clearPasswordResetContext/);
  assert.match(resetPassword, /router\.replace\("\/dashboard"\)/);
});
