import assert from "node:assert/strict";
import test from "node:test";

import { formatOwnerLeadMessage, formatOwnerSignupMessage } from "../lib/telegram/format.ts";

const summary = {
  companies: 12,
  users: 34,
  vacancies: 56,
  candidates: 78,
  aiRequests: 90,
};

const emptyTouch = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_term: null,
  utm_content: null,
  gclid: null,
  fbclid: null,
  msclkid: null,
};

test("formatOwnerSignupMessage includes contacts, UTM attribution, and platform summary", () => {
  const text = formatOwnerSignupMessage({
    userId: "user-123",
    companyId: "company-456",
    name: "Анна Иванова",
    email: "anna@example.com",
    phone: "+7 999 123-45-67",
    company: "Хайр Софт",
    requestedPlan: "professional",
    marketingAttribution: {
      visitor_id: "00000000-0000-4000-8000-000000000123",
      landing_path: "/signup?plan=professional",
      referrer: "https://google.example/search",
      captured_at: "2026-06-09T10:00:00.000Z",
      first_touch: {
        ...emptyTouch,
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "brand",
        utm_term: "hr crm",
        utm_content: "top",
        gclid: "gclid-123",
      },
      last_touch: {
        ...emptyTouch,
        utm_source: "retargeting",
        utm_medium: "paid_social",
        utm_campaign: "demo",
        fbclid: "fbclid-456",
      },
    },
    platformSummary: summary,
  });

  assert.match(text, /Новая регистрация/);
  assert.match(text, /Имя: Анна Иванова/);
  assert.match(text, /Email: anna@example\.com/);
  assert.match(text, /Телефон: \+7 999 123-45-67/);
  assert.match(text, /Компания: Хайр Софт/);
  assert.match(text, /План: Professional/);
  assert.match(text, /User ID: user-123/);
  assert.match(text, /Company ID: company-456/);
  assert.match(text, /First-touch UTM: google \/ cpc \/ brand/);
  assert.match(text, /First utm_term: hr crm/);
  assert.match(text, /First utm_content: top/);
  assert.match(text, /Last-touch UTM: retargeting \/ paid_social \/ demo/);
  assert.match(text, /Click IDs: gclid=gclid-123, fbclid=fbclid-456/);
  assert.match(text, /Landing: \/signup\?plan=professional/);
  assert.match(text, /Referrer: https:\/\/google\.example\/search/);
  assert.match(text, /Компании: 12/);
  assert.match(text, /Пользователи: 34/);
  assert.match(text, /Вакансии: 56/);
  assert.match(text, /Кандидаты: 78/);
  assert.match(text, /Запросы к ИИ: 90/);
});

test("formatOwnerSignupMessage renders direct traffic separately from missing attribution", () => {
  const directText = formatOwnerSignupMessage({
    userId: "user-direct",
    companyId: null,
    name: "Павел",
    email: "pavel@example.com",
    phone: "+7 900 000-00-00",
    company: "Direct Company",
    requestedPlan: "starter",
    marketingAttribution: {
      visitor_id: "00000000-0000-4000-8000-000000000124",
      landing_path: "/signup",
      referrer: null,
      captured_at: "2026-06-09T10:00:00.000Z",
      first_touch: emptyTouch,
      last_touch: emptyTouch,
    },
    platformSummary: summary,
  });

  assert.match(directText, /First-touch UTM: direct \/ none \/ not set/);
  assert.doesNotMatch(directText, /Атрибуция не получена/);

  const missingText = formatOwnerSignupMessage({
    userId: "user-missing",
    companyId: null,
    name: "Мария",
    email: "maria@example.com",
    phone: "+7 900 111-11-11",
    company: "Missing Company",
    requestedPlan: "starter",
    marketingAttribution: undefined,
    platformSummary: summary,
  });

  assert.match(missingText, /Атрибуция не получена/);
  assert.doesNotMatch(missingText, /First-touch UTM: direct/);
});

test("formatOwnerSignupMessage renders last-touch term and content when only detailed UTM fields differ", () => {
  const text = formatOwnerSignupMessage({
    userId: "user-detail",
    companyId: null,
    name: "Анна",
    email: "anna@example.com",
    phone: "+7 999 123-45-67",
    company: "Хайр Софт",
    requestedPlan: "starter",
    marketingAttribution: {
      visitor_id: "00000000-0000-4000-8000-000000000126",
      landing_path: "/signup",
      referrer: null,
      captured_at: "2026-06-09T10:00:00.000Z",
      first_touch: {
        ...emptyTouch,
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "brand",
        utm_term: "hr crm",
      },
      last_touch: {
        ...emptyTouch,
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "brand",
        utm_term: "ats crm",
        utm_content: "bottom",
      },
    },
    platformSummary: summary,
  });

  assert.match(text, /First-touch UTM: google \/ cpc \/ brand/);
  assert.match(text, /First utm_term: hr crm/);
  assert.match(text, /Last-touch UTM: google \/ cpc \/ brand/);
  assert.match(text, /Last utm_term: ats crm/);
  assert.match(text, /Last utm_content: bottom/);
});

test("formatOwnerSignupMessage renders distinct first and last click ids for the same key", () => {
  const text = formatOwnerSignupMessage({
    userId: "user-click",
    companyId: null,
    name: "Анна",
    email: "anna@example.com",
    phone: "+7 999 123-45-67",
    company: "Хайр Софт",
    requestedPlan: "starter",
    marketingAttribution: {
      visitor_id: "00000000-0000-4000-8000-000000000127",
      landing_path: "/signup",
      referrer: null,
      captured_at: "2026-06-09T10:00:00.000Z",
      first_touch: {
        ...emptyTouch,
        utm_source: "google",
        gclid: "gclid-first",
      },
      last_touch: {
        ...emptyTouch,
        utm_source: "google",
        gclid: "gclid-last",
      },
    },
    platformSummary: summary,
  });

  assert.match(text, /Click IDs: first_gclid=gclid-first, last_gclid=gclid-last/);
});

test("formatOwnerSignupMessage normalizes multiline and control-character values", () => {
  const text = formatOwnerSignupMessage({
    userId: "user\nfake",
    companyId: "company\r fake",
    name: "Анна\nRole: admin",
    email: "anna@example.com\r\nInjected: yes",
    phone: "+7 999\t123\n45",
    company: "Company\u0000Name\nOther:",
    requestedPlan: "starter",
    marketingAttribution: {
      visitor_id: "00000000-0000-4000-8000-000000000125",
      landing_path: "/signup\nInjected: true\u202E",
      referrer: "https://referrer.test/\r\nNext: value\u200B\u061C",
      captured_at: "2026-06-09T10:00:00.000Z",
      first_touch: {
        ...emptyTouch,
        utm_source: "google\nEmail: attacker@example.com\u0085hidden\u00AD",
        utm_medium: "cpc\r\nКомпания: fake",
        utm_campaign: "brand\tcampaign",
      },
      last_touch: emptyTouch,
    },
    platformSummary: summary,
  });

  assert.doesNotMatch(text, /\nRole: admin/);
  assert.doesNotMatch(text, /\nInjected: yes/);
  assert.doesNotMatch(text, /\nEmail: attacker@example\.com/);
  assert.doesNotMatch(text, /[\u0085\u202E\u200B\u061C\u00AD]/);
  assert.match(text, /Имя: Анна Role: admin/);
  assert.match(text, /Email: anna@example\.com Injected: yes/);
  assert.match(text, /Компания: Company Name Other:/);
  assert.match(text, /First-touch UTM: google Email: attacker@example\.com hidden \/ cpc Компания: fake \/ brand campaign/);
});

test("formatOwnerSignupMessage uses a safe summary fallback", () => {
  const text = formatOwnerSignupMessage({
    userId: "user-123",
    companyId: null,
    name: "Анна",
    email: "anna@example.com",
    phone: "+7 999 123-45-67",
    company: "Хайр Софт",
    requestedPlan: "starter",
    marketingAttribution: undefined,
    platformSummary: null,
  });

  assert.match(text, /Сводка платформы/);
  assert.match(text, /Не удалось загрузить актуальную сводку/);
});

test("existing owner lead Telegram format remains stable", () => {
  const text = formatOwnerLeadMessage({
    fullName: "Анна Иванова",
    email: "anna@example.com",
    phone: "+7 999 123-45-67",
    company: "Хайр Софт",
    companySize: "51-200",
    message: "Хочу Enterprise",
    requestedPlan: "enterprise",
  });

  assert.equal(
    text,
    [
      "📝 Новая заявка с лендинга",
      "Имя: Анна Иванова",
      "Email: anna@example.com",
      "Телефон: +7 999 123-45-67",
      "Компания: Хайр Софт",
      "План: Enterprise",
      "Размер: 51-200",
      "Сообщение: Хочу Enterprise",
    ].join("\n"),
  );
});
