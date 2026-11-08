import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  emailVerificationLinkLifetimeCopy,
  emailVerificationLinkLifetimeLabel,
  emailVerificationLinkLifetimeSeconds,
} from "../lib/auth/email-verification.constants.ts";

const verifyEmailPagePath = path.resolve(process.cwd(), "app/(auth)/verify-email/page.tsx");
const signupPagePath = path.resolve(process.cwd(), "app/(auth)/signup/page.tsx");
const constantsPath = path.resolve(process.cwd(), "lib/auth/email-verification.constants.ts");

test("email verification link lifetime constants match Supabase OTP expiration", () => {
  assert.equal(emailVerificationLinkLifetimeSeconds, 3600);
  assert.equal(emailVerificationLinkLifetimeLabel, "1 час");
  assert.equal(emailVerificationLinkLifetimeCopy, "Ссылка действительна 1 час.");
});

test("verify email page uses user-facing link expiration copy", () => {
  const source = readFileSync(verifyEmailPagePath, "utf8");
  const constantsSource = readFileSync(constantsPath, "utf8");

  assert.doesNotMatch(source, /Сессия подтверждения истекла/);
  assert.doesNotMatch(source, /контекст подтверждения/);
  assert.match(source, /Срок действия ссылки истёк\. Запросите новое письмо\./);
  assert.match(source, /emailVerificationLinkLifetimeCopy/);
  assert.match(constantsSource, /Ссылка действительна 1 час\./);
  assert.match(source, /Не нашли активное подтверждение в этом браузере/);
  assert.match(source, /Не удалось обновить данные подтверждения\. Попробуйте ещё раз\./);
  assert.match(source, /Email подтверждён\. Теперь можно войти\./);
  assert.match(source, /isEmailConfirmed/);
  assert.match(source, /href="\/login"/);
});

test("signup confirmation toast tells users the email link is valid for one hour", () => {
  const source = readFileSync(signupPagePath, "utf8");
  const constantsSource = readFileSync(constantsPath, "utf8");

  assert.match(source, /Письмо отправлено/);
  assert.match(source, /emailVerificationLinkLifetimeCopy/);
  assert.match(constantsSource, /Ссылка действительна 1 час\./);
});
