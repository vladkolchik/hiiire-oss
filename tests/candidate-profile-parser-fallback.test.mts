import assert from "node:assert/strict";
import test from "node:test";

import { extractCandidateBasicsFromText } from "../lib/candidates/extract-candidate-basics.ts";
import { normalizeCandidateContactForStorage } from "../lib/candidates/contact-normalization.ts";
import { parseCandidateProfileFromResumeText } from "../lib/candidates/profile-parser.ts";
import { extractCandidateContactsFromText } from "../lib/contacts/extract-candidate-contacts.ts";

test("extractCandidateBasicsFromText preserves current HH-style demographic fallback behavior", () => {
  const resume = [
    "Резюме",
    "Иванов Иван Иванович",
    "Мужчина, 27 лет, родился 11 ноября 1998",
    "Frontend Developer",
    "Email: ivan@example.com",
  ].join("\n");

  assert.deepEqual(extractCandidateBasicsFromText(resume), {
    name: "Иванов Иван Иванович",
    position: "Frontend Developer",
  });
});

test("extractCandidateBasicsFromText falls back to candidate defaults for noisy headers", () => {
  const resume = [
    "Curriculum Vitae",
    "Email: user@example.com",
    "Phone: +7 999 111-22-33",
    "Опыт работы",
    "ООО Ромашка",
  ].join("\n");

  assert.deepEqual(extractCandidateBasicsFromText(resume), {
    name: "Кандидат",
    position: "Опыт работы",
  });
});

test("normalizeCandidateContactForStorage accepts DeepSeek-like contacts through project normalizers", () => {
  assert.deepEqual(normalizeCandidateContactForStorage({ type: "email", value: "USER@Example.COM" }), {
    type: "email",
    value: "user@example.com",
  });
  assert.deepEqual(normalizeCandidateContactForStorage({ type: "phone", value: "8 (999) 111-22-33" }), {
    type: "phone",
    value: "+79991112233",
  });
  assert.deepEqual(normalizeCandidateContactForStorage({ type: "telegram", value: "ivan_recruiter" }), {
    type: "telegram",
    value: "@ivan_recruiter",
  });
});

test("normalizeCandidateContactForStorage rejects empty and malformed model contacts", () => {
  assert.equal(normalizeCandidateContactForStorage({ type: "email", value: "not an email" }), null);
  assert.equal(normalizeCandidateContactForStorage({ type: "phone", value: "12345" }), null);
  assert.equal(normalizeCandidateContactForStorage({ type: "website", value: "not a url" }), null);
  assert.equal(normalizeCandidateContactForStorage({ type: "custom_secret", value: "value" }), null);
  assert.equal(normalizeCandidateContactForStorage({ type: "custom_1", value: "value" }), null);
});

test("normalizeCandidateContactForStorage keeps supported other contacts", () => {
  assert.deepEqual(normalizeCandidateContactForStorage({ type: "other", value: "Behance: designer" }), {
    type: "other",
    value: "Behance: designer",
  });
});

test("normalizeCandidateContactForStorage rejects typed social URL host mismatches", () => {
  assert.equal(normalizeCandidateContactForStorage({ type: "linkedin", value: "example.com/profile" }), null);
  assert.equal(normalizeCandidateContactForStorage({ type: "github", value: "linkedin.com/in/dev" }), null);
  assert.deepEqual(normalizeCandidateContactForStorage({ type: "linkedin", value: "linkedin.com/in/dev" }), {
    type: "linkedin",
    value: "https://linkedin.com/in/dev",
  });
});

test("normalizeCandidateContactForStorage stays compatible with regex contact normalization", () => {
  const resume = [
    "Email: USER@Example.COM",
    "Phone: 8 (999) 111-22-33",
    "Telegram: https://t.me/ivan_recruiter",
    "WhatsApp: https://wa.me/79991112233",
    "LinkedIn: linkedin.com/in/dev",
    "GitHub: github.com/dev",
  ].join("\n");
  const regexContacts = extractCandidateContactsFromText(resume);
  const modelContacts = [
    { type: "email", value: "USER@Example.COM" },
    { type: "phone", value: "8 (999) 111-22-33" },
    { type: "telegram", value: "https://t.me/ivan_recruiter" },
    { type: "whatsapp", value: "https://wa.me/79991112233" },
    { type: "linkedin", value: "linkedin.com/in/dev" },
    { type: "github", value: "github.com/dev" },
  ].map((contact) => normalizeCandidateContactForStorage(contact));

  for (const contact of modelContacts) {
    assert.ok(contact);
    assert.ok(
      regexContacts.some((regexContact) => regexContact.type === contact.type && regexContact.value === contact.value),
      `expected regex contacts to contain ${contact.type}:${contact.value}`,
    );
  }
});

test("normalizeCandidateContactForStorage matches regex extractor edge cases", () => {
  const expected = (resume: string, type: string) =>
    extractCandidateContactsFromText(resume).find((contact) => contact.type === type) ?? null;

  assert.deepEqual(
    normalizeCandidateContactForStorage({ type: "email", value: "USER@Example.COM." }),
    expected("Email: USER@Example.COM.", "email"),
  );
  assert.deepEqual(
    normalizeCandidateContactForStorage({ type: "phone", value: "8 (999) 111-22-33" }),
    expected("Phone: 8 (999) 111-22-33", "phone"),
  );
  assert.deepEqual(
    normalizeCandidateContactForStorage({ type: "phone", value: "+7 (999) 111-22-33" }),
    expected("Phone: +7 (999) 111-22-33", "phone"),
  );
  assert.deepEqual(
    normalizeCandidateContactForStorage({ type: "telegram", value: "https://t.me/s/ivan_recruiter" }),
    expected("Telegram: https://t.me/s/ivan_recruiter", "telegram"),
  );
  assert.deepEqual(
    normalizeCandidateContactForStorage({ type: "telegram", value: "https://t.me/+inviteCode" }),
    expected("Telegram: https://t.me/+inviteCode", "telegram"),
  );
  assert.deepEqual(
    normalizeCandidateContactForStorage({ type: "whatsapp", value: "https://api.whatsapp.com/send?phone=79991112233" }),
    expected("WhatsApp: https://api.whatsapp.com/send?phone=79991112233", "whatsapp"),
  );
  assert.deepEqual(
    normalizeCandidateContactForStorage({ type: "github", value: "github.com/dev" }),
    expected("GitHub: github.com/dev", "github"),
  );
  assert.deepEqual(
    normalizeCandidateContactForStorage({ type: "website", value: "portfolio.example.com" }),
    expected("Portfolio: portfolio.example.com", "website"),
  );
});

test("regex contact extraction behavior remains available for fallback", () => {
  const contacts = extractCandidateContactsFromText("Email: user@example.com\nТелефон: +7 999 111-22-33\nTelegram: ivan_recruiter");
  assert.deepEqual(
    contacts.map((c) => `${c.type}:${c.value}`),
    ["email:user@example.com", "telegram:@ivan_recruiter", "phone:+79991112233"],
  );
});

test("regex fallback profile parser includes desired salary extracted from resume text", async () => {
  const result = await parseCandidateProfileFromResumeText({
    resumeText: "Иван Иванов\nFrontend Developer\nEmail: regex@example.test\nОжидаемая зарплата: 180 000 ₽",
    requestId: "fallback-desired-salary",
    config: {
      apiKey: "",
      baseURL: "https://api.deepseek.test",
      model: "deepseek-v4-flash",
      maxTokens: 3000,
      requestTimeoutMs: 500,
      totalTimeoutMs: 2_000,
      concurrencyLimit: 1,
      queueTimeoutMs: 500,
    },
    now: () => 1_000,
  });

  assert.equal(result.meta.source, "regex_fallback");
  assert.deepEqual(result.desiredSalary, {
    text: "180 000 ₽",
    amount: 180000,
    currency: "RUB",
    source: "regex",
  });
});
