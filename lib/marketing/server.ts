import type { MarketingAttributionPayload } from "@/lib/validation/marketing-attribution";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type MarketingTouch = MarketingAttributionPayload["first_touch"];

type MarketingEventProperties = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
};

function touchColumns(prefix: "first" | "last", touch: MarketingTouch) {
  return {
    [`${prefix}_utm_source`]: touch.utm_source,
    [`${prefix}_utm_medium`]: touch.utm_medium,
    [`${prefix}_utm_campaign`]: touch.utm_campaign,
    [`${prefix}_utm_term`]: touch.utm_term,
    [`${prefix}_utm_content`]: touch.utm_content,
    [`${prefix}_gclid`]: touch.gclid,
    [`${prefix}_fbclid`]: touch.fbclid,
    [`${prefix}_msclkid`]: touch.msclkid,
  };
}

export function marketingEventPropertiesFromPayload(payload: MarketingAttributionPayload | null | undefined): MarketingEventProperties {
  if (!payload) return {};
  return {
    utm_source: payload.first_touch.utm_source,
    utm_medium: payload.first_touch.utm_medium,
    utm_campaign: payload.first_touch.utm_campaign,
    utm_term: payload.first_touch.utm_term,
    utm_content: payload.first_touch.utm_content,
  };
}

export async function recordMarketingVisit(payload: MarketingAttributionPayload, options: { recordEvent?: boolean } = {}) {
  const admin = getSupabaseAdminClient() as any;
  const receivedAt = new Date().toISOString();
  const { error } = await admin.rpc("record_marketing_visit", {
    p_visitor_id: payload.visitor_id,
    p_landing_path: payload.landing_path,
    p_referrer: payload.referrer,
    p_first_utm_source: payload.first_touch.utm_source,
    p_first_utm_medium: payload.first_touch.utm_medium,
    p_first_utm_campaign: payload.first_touch.utm_campaign,
    p_first_utm_term: payload.first_touch.utm_term,
    p_first_utm_content: payload.first_touch.utm_content,
    p_first_gclid: payload.first_touch.gclid,
    p_first_fbclid: payload.first_touch.fbclid,
    p_first_msclkid: payload.first_touch.msclkid,
    p_last_utm_source: payload.last_touch.utm_source,
    p_last_utm_medium: payload.last_touch.utm_medium,
    p_last_utm_campaign: payload.last_touch.utm_campaign,
    p_last_utm_term: payload.last_touch.utm_term,
    p_last_utm_content: payload.last_touch.utm_content,
    p_last_gclid: payload.last_touch.gclid,
    p_last_fbclid: payload.last_touch.fbclid,
    p_last_msclkid: payload.last_touch.msclkid,
    p_seen_at: receivedAt,
    p_record_event: options.recordEvent ?? true,
  });
  if (error) throw error;
}

export async function recordMarketingSignup(input: {
  userId: string;
  companyId: string | null;
  marketingAttribution?: MarketingAttributionPayload;
}) {
  if (!input.marketingAttribution) return;

  try {
    const admin = getSupabaseAdminClient() as any;
    await recordMarketingVisit(input.marketingAttribution, { recordEvent: false });
    const { error } = await admin.from("marketing_conversions").upsert(
      {
        user_id: input.userId,
        company_id: input.companyId,
        visitor_id: input.marketingAttribution.visitor_id,
        landing_path: input.marketingAttribution.landing_path,
        referrer: input.marketingAttribution.referrer,
        ...touchColumns("first", input.marketingAttribution.first_touch),
        ...touchColumns("last", input.marketingAttribution.last_touch),
        signed_up_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
  } catch {
    // Marketing attribution must never block signup.
  }
}

export async function loadCompanyMarketingEventProperties(companyId: string): Promise<MarketingEventProperties> {
  try {
    const admin = getSupabaseAdminClient() as any;
    const { data } = await admin
      .from("marketing_conversions")
      .select("first_utm_source,first_utm_medium,first_utm_campaign,first_utm_term,first_utm_content")
      .eq("company_id", companyId)
      .order("signed_up_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!data) return {};
    return {
      utm_source: data.first_utm_source ?? null,
      utm_medium: data.first_utm_medium ?? null,
      utm_campaign: data.first_utm_campaign ?? null,
      utm_term: data.first_utm_term ?? null,
      utm_content: data.first_utm_content ?? null,
    };
  } catch {
    return {};
  }
}
