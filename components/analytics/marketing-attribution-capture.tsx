"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { buildMarketingVisitPayload } from "@/lib/marketing/attribution";
import { isMarketingAttributionRoute } from "@/lib/marketing/route-eligibility";

const SESSION_VISIT_KEY_PREFIX = "hiiire_marketing_visit_sent:";
const inFlightVisitKeys = new Set<string>();

function safeSessionStorageGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionStorageSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Visit dedupe is best-effort when browser storage is unavailable.
  }
}

export function MarketingAttributionCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isMarketingAttributionRoute(pathname)) return;

    const payload = buildMarketingVisitPayload();
    if (!payload) return;

    const sessionKey = `${SESSION_VISIT_KEY_PREFIX}${payload.visitor_id}:${pathname ?? ""}:${searchParams.toString()}`;
    if (safeSessionStorageGet(sessionKey) || inFlightVisitKeys.has(sessionKey)) return;
    inFlightVisitKeys.add(sessionKey);

    void fetch("/api/marketing/attribution/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then((response) => {
        if (response.ok) safeSessionStorageSet(sessionKey, "1");
      })
      .catch(() => undefined)
      .finally(() => {
        inFlightVisitKeys.delete(sessionKey);
      });
  }, [pathname, searchParams]);

  return null;
}
