import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginSource = readFileSync(new URL("../app/(auth)/login/page.tsx", import.meta.url), "utf8");

test("login validates password length on the client before auth request", () => {
  assert.match(
    loginSource,
    /import\s+\{\s*getPasswordValidationMessage,\s*PASSWORD_MAX_LENGTH\s*\}\s+from\s+"@\/lib\/validation\/password";/,
  );
  assert.match(loginSource, /const passwordError = getPasswordValidationMessage\(password\);/);
  assert.match(loginSource, /if \(passwordError\) \{\s*setError\(passwordError\);\s*return;\s*\}/);
});

test("login password input mirrors the auth provider password max length", () => {
  assert.match(
    loginSource,
    /<PasswordInput[\s\S]*?id="password"[\s\S]*?maxLength=\{PASSWORD_MAX_LENGTH\}/,
  );
});
