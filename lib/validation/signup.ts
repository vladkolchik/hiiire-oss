import { z } from "zod";

import { createEmailSchema } from "./email.ts";
import { MarketingAttributionPayloadSchema } from "./marketing-attribution.ts";
import { createPasswordSchema } from "./password.ts";
import { createPhoneSchema } from "./phone.ts";

export const SignupBodySchema = z.object({
  email: createEmailSchema(320),
  password: createPasswordSchema(),
  name: z.string().trim().min(1, "Введите имя").max(200, "Имя не должно быть длиннее 200 символов"),
  phone: createPhoneSchema(),
  company: z.string().trim().min(1, "Введите название компании").max(200, "Компания не должна быть длиннее 200 символов"),
  intendedPlan: z.enum(["starter", "professional"], { error: "Выберите корректный тариф" }).optional(),
  marketingAttribution: MarketingAttributionPayloadSchema.optional().catch(undefined),
});
