import { z } from "zod";

export const HH_CALLBACK_REASON_EMPLOYER_ACCOUNT_REQUIRED = "employer_account_required";

export const HhCallbackMeSchema = z
  .object({
    auth_type: z.string().nullable().optional(),
    is_employer: z.boolean().optional(),
    is_employer_integration: z.boolean().optional(),
    employer: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    manager: z
      .object({
        id: z.string().optional(),
        has_admin_rights: z.boolean().optional(),
        has_multiple_manager_accounts: z.boolean().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type HhCallbackMe = z.infer<typeof HhCallbackMeSchema>;

export type HhEmployerContext =
  | {
      ok: true;
      employerId: string;
      employerName: string | null;
      managerId: string;
      managerHasAdminRights: boolean | null;
      managerHasMultipleAccounts: boolean | null;
    }
  | {
      ok: false;
      reason: typeof HH_CALLBACK_REASON_EMPLOYER_ACCOUNT_REQUIRED;
    };

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readHhEmployerContext(me: HhCallbackMe): HhEmployerContext {
  const employerId = cleanString(me.employer?.id);
  const managerId = cleanString(me.manager?.id);

  if (!employerId || !managerId) {
    return { ok: false, reason: HH_CALLBACK_REASON_EMPLOYER_ACCOUNT_REQUIRED };
  }

  return {
    ok: true,
    employerId,
    employerName: cleanString(me.employer?.name),
    managerId,
    managerHasAdminRights: typeof me.manager?.has_admin_rights === "boolean" ? me.manager.has_admin_rights : null,
    managerHasMultipleAccounts:
      typeof me.manager?.has_multiple_manager_accounts === "boolean" ? me.manager.has_multiple_manager_accounts : null,
  };
}

export function getHhCallbackErrorMessage(reason: unknown): string {
  const code = cleanString(reason);

  if (code === HH_CALLBACK_REASON_EMPLOYER_ACCOUNT_REQUIRED) {
    return "Подключение доступно только для аккаунтов работодателя. Войдите на HH.ru как работодатель и попробуйте снова.";
  }

  if (code === "access_denied") {
    return "Подключение HH.ru отменено. Чтобы импортировать отклики, разрешите доступ на странице HH.ru.";
  }

  return "Не удалось подключить HH.ru. Войдите на HH.ru как работодатель и попробуйте снова.";
}
