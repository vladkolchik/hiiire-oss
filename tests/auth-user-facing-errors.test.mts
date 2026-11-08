import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getPasswordResetRequestErrorMessage,
  getPasswordUpdateErrorMessage,
  getSignupErrorMessage,
} from "../lib/auth/user-facing-errors.ts";

test("maps Supabase 72 character signup password error to Russian copy", () => {
  assert.equal(
    getSignupErrorMessage({ message: "Password cannot be longer than 72 characters" }),
    "Пароль не должен быть длиннее 72 символов"
  );
});

test("maps same-as-old password reset error to actionable Russian copy", () => {
  assert.equal(
    getPasswordUpdateErrorMessage({ message: "New password should be different from the old password" }),
    "Новый пароль должен отличаться от текущего"
  );
});

test("does not expose unknown password update provider messages", () => {
  assert.equal(
    getSignupErrorMessage({ message: "Too small: expected string to have >=1 characters" }),
    "Не удалось зарегистрироваться. Попробуйте ещё раз."
  );
  assert.equal(
    getPasswordUpdateErrorMessage({ message: "Unexpected upstream auth provider failure" }),
    "Не удалось обновить пароль. Попробуйте ещё раз."
  );
});

test("maps password reset API errors to Russian user-facing copy", () => {
  assert.equal(
    getPasswordResetRequestErrorMessage({ error: "INVALID_BODY" }),
    "Введите корректный email."
  );
  assert.equal(
    getPasswordResetRequestErrorMessage({ error: "SUPABASE_RATE_LIMIT" }),
    "Слишком много запросов. Попробуйте позже."
  );
  assert.equal(
    getPasswordResetRequestErrorMessage({ error: "REQUEST_FAILED" }),
    "Не удалось отправить письмо. Попробуйте ещё раз."
  );
});

test("prefers safe password reset response message without leaking technical codes", () => {
  assert.equal(
    getPasswordResetRequestErrorMessage({
      error: "SUPABASE_RATE_LIMIT",
      message: "Слишком много запросов. Попробуйте позже.",
    }),
    "Слишком много запросов. Попробуйте позже."
  );
  assert.equal(
    getPasswordResetRequestErrorMessage({
      error: "REQUEST_FAILED",
      message: "AuthApiError: unexpected provider failure at auth.js:10",
    }),
    "Не удалось отправить письмо. Попробуйте ещё раз."
  );
});

test("signup email input mirrors server max length", () => {
  const source = readFileSync("app/(auth)/signup/page.tsx", "utf8");
  assert.match(source, /name="email"[\s\S]*maxLength=\{320\}/);
});
