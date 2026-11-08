import assert from "node:assert/strict";
import test from "node:test";

import { getPasswordValidationMessage } from "../lib/validation/password.ts";

test("accepts passwords with latin letters digits and symbols", () => {
  assert.equal(getPasswordValidationMessage("Abc123!"), "");
});

test("rejects passwords longer than the auth provider accepts", () => {
  assert.equal(
    getPasswordValidationMessage("A".repeat(73)),
    "Пароль не должен быть длиннее 72 символов"
  );
});

test("rejects passwords with whitespace", () => {
  assert.equal(
    getPasswordValidationMessage("Abc 123!"),
    "Пароль может содержать только латинские буквы, цифры и знаки без пробелов"
  );
});

test("rejects passwords with cyrillic characters", () => {
  assert.equal(
    getPasswordValidationMessage("Пароль123!"),
    "Пароль может содержать только латинские буквы, цифры и знаки без пробелов"
  );
});
