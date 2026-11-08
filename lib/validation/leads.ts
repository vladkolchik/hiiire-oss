import { z } from "zod";

import { createEmailSchema } from "./email.ts";
import { createPhoneSchema } from "./phone.ts";

export const LEAD_PHONE_MIN_DIGITS = 10;

export const LeadRequestBodySchema = z.object({
  fullName: z.string().trim().min(2, "Укажите имя и фамилию").max(200, "Имя не должно быть длиннее 200 символов"),
  email: createEmailSchema(200),
  phone: createPhoneSchema({ minDigits: LEAD_PHONE_MIN_DIGITS }),
  company: z.string().trim().min(2, "Укажите название компании").max(200, "Компания не должна быть длиннее 200 символов"),
  companySize: z
    .string()
    .trim()
    .max(50, "Размер компании не должен быть длиннее 50 символов")
    .optional()
    .transform((v) => (v && v.length ? v : undefined)),
  message: z
    .string()
    .trim()
    .max(2000, "Сообщение не должно быть длиннее 2000 символов")
    .optional()
    .transform((v) => (v && v.length ? v : undefined)),
  requestedPlan: z.enum(["starter", "professional", "enterprise"], { error: "Выберите корректный тариф" }).optional().default("enterprise"),
});
