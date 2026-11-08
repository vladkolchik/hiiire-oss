import { z } from "zod";

const nullableTrackingString = z.string().trim().max(200, "Значение метки слишком длинное.").nullable();

export const MarketingTouchSchema = z.object({
  utm_source: nullableTrackingString,
  utm_medium: nullableTrackingString,
  utm_campaign: nullableTrackingString,
  utm_term: nullableTrackingString,
  utm_content: nullableTrackingString,
  gclid: nullableTrackingString,
  fbclid: nullableTrackingString,
  msclkid: nullableTrackingString,
});

export const MarketingAttributionPayloadSchema = z.object({
  visitor_id: z.string().uuid("Не удалось распознать посетителя."),
  landing_path: z.string().trim().max(500, "Адрес страницы слишком длинный.").nullable(),
  referrer: z.string().trim().max(500, "Адрес источника слишком длинный.").nullable(),
  first_touch: MarketingTouchSchema,
  last_touch: MarketingTouchSchema,
  captured_at: z.string().datetime({ message: "Некорректная дата события.", offset: true }),
});

export type MarketingAttributionPayload = z.infer<typeof MarketingAttributionPayloadSchema>;
