import assert from "node:assert/strict";
import test from "node:test";

import { sanitizePhoneInput } from "../lib/validation/phone.ts";
import { SignupBodySchema } from "../lib/validation/signup.ts";

const validSignupBody = {
  email: "anna@company.com",
  password: "Abc123!",
  name: "Анна Иванова",
  phone: "+7 999 123-45-67",
  company: "Хайр Софт",
  intendedPlan: "starter",
};

test("signup phone validation uses Russian copy for values longer than 50 characters", () => {
  const result = SignupBodySchema.safeParse({
    ...validSignupBody,
    phone: "1".repeat(51),
  });

  assert.equal(result.success, false);
  if (result.success) return;

  assert.equal(result.error.flatten().fieldErrors.phone?.[0], "Телефон не должен быть длиннее 50 символов");
});

test("signup phone validation rejects letters with Russian copy", () => {
  const result = SignupBodySchema.safeParse({
    ...validSignupBody,
    phone: "+7 call me",
  });

  assert.equal(result.success, false);
  if (result.success) return;

  assert.equal(
    result.error.flatten().fieldErrors.phone?.[0],
    "Телефон может содержать только цифры, +, пробелы, скобки и дефисы"
  );
});

test("phone input sanitizer removes letters and keeps phone punctuation", () => {
  assert.equal(sanitizePhoneInput("+7 call (999)-123"), "+7 (999)-123");
});
