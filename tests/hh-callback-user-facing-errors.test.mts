import assert from "node:assert/strict";
import test from "node:test";

import {
  HH_CALLBACK_REASON_EMPLOYER_ACCOUNT_REQUIRED,
  HhCallbackMeSchema,
  getHhCallbackErrorMessage,
  readHhEmployerContext,
} from "../lib/hh/callback.ts";

test("hh callback accepts applicant /me profile but rejects it with user-facing reason", () => {
  const parsed = HhCallbackMeSchema.safeParse({
    auth_type: "applicant",
    is_applicant: true,
    is_employer: false,
    is_employer_integration: false,
    employer: null,
    manager: null,
    resumes_url: "https://api.hh.ru/resumes/mine",
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  assert.deepEqual(readHhEmployerContext(parsed.data), {
    ok: false,
    reason: HH_CALLBACK_REASON_EMPLOYER_ACCOUNT_REQUIRED,
  });
});

test("hh callback extracts employer manager context for supported profiles", () => {
  const parsed = HhCallbackMeSchema.parse({
    auth_type: "employer",
    is_employer: true,
    is_employer_integration: false,
    employer: { id: "1455", name: "HeadHunter" },
    manager: {
      id: "87654321",
      has_admin_rights: true,
      has_multiple_manager_accounts: false,
    },
  });

  assert.deepEqual(readHhEmployerContext(parsed), {
    ok: true,
    employerId: "1455",
    employerName: "HeadHunter",
    managerId: "87654321",
    managerHasAdminRights: true,
    managerHasMultipleAccounts: false,
  });
});

test("hh callback error copy never exposes technical provider codes", () => {
  assert.equal(
    getHhCallbackErrorMessage(HH_CALLBACK_REASON_EMPLOYER_ACCOUNT_REQUIRED),
    "Подключение доступно только для аккаунтов работодателя. Войдите на HH.ru как работодатель и попробуйте снова."
  );
  assert.equal(
    getHhCallbackErrorMessage("HH_ME_INVALID"),
    "Не удалось подключить HH.ru. Войдите на HH.ru как работодатель и попробуйте снова."
  );
});
