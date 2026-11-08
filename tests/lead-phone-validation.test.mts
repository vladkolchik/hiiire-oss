import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LeadRequestBodySchema } from "../lib/validation/leads.ts";

const validLeadBody = {
  fullName: "Анна Иванова",
  email: "anna@company.com",
  phone: "+7 (999) 123-45-67",
  company: "Хайр Софт",
  requestedPlan: "enterprise",
};

test("lead phone validation rejects six-digit placeholder values", () => {
  const result = LeadRequestBodySchema.safeParse({
    ...validLeadBody,
    phone: "123456",
  });

  assert.equal(result.success, false);
  if (result.success) return;

  assert.equal(
    result.error.flatten().fieldErrors.phone?.[0],
    "Укажите полный номер телефона"
  );
});

test("lead phone validation rejects letters and symbols even when enough digits are present", () => {
  for (const phone of ["123456!@#", "+7 123456abc", "abc123456xyz"]) {
    const result = LeadRequestBodySchema.safeParse({
      ...validLeadBody,
      phone,
    });

    assert.equal(result.success, false, phone);
    if (result.success) continue;

    assert.equal(
      result.error.flatten().fieldErrors.phone?.[0],
      "Телефон может содержать только цифры, +, пробелы, скобки и дефисы"
    );
  }
});

test("lead request rejects oversized phone with user-facing copy", () => {
  const result = LeadRequestBodySchema.safeParse({
    ...validLeadBody,
    phone: "+7 " + "1".repeat(80),
    companySize: "10",
    message: "",
  });

  assert.equal(result.success, false);
  if (result.success) return;

  assert.match(
    result.error.issues[0]?.message ?? "",
    /Телефон не должен быть длиннее 50 символов/
  );
});

test("request access form mirrors lead text limits", () => {
  const source = readFileSync("app/(marketing)/request-access/page.tsx", "utf8");

  assert.match(source, /name="name"[\s\S]*maxLength=\{200\}/);
  assert.match(source, /name="email"[\s\S]*maxLength=\{200\}/);
  assert.match(source, /name="company"[\s\S]*maxLength=\{200\}/);
  assert.match(source, /name="message"[\s\S]*maxLength=\{2000\}/);
});
