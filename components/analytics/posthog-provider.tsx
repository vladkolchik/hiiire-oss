"use client";

import { Suspense, type ReactNode, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

import { MarketingAttributionCapture } from "@/components/analytics/marketing-attribution-capture";
import { sanitizePostHogCaptureResult } from "@/lib/analytics/posthog-sanitize";
import { buildPostHogCurrentUrl } from "@/lib/analytics/posthog-url";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

if (typeof window !== "undefined" && posthogKey && !posthog.__loaded) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: "2026-01-30",
    capture_pageview: false,
    before_send: sanitizePostHogCaptureResult,
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!posthogKey || !posthog.__loaded || !pathname) {
      return;
    }

    const currentUrl = buildPostHogCurrentUrl(window.location.origin, pathname, searchParams.toString());

    posthog.capture("$pageview", { $current_url: currentUrl });
  }, [pathname, searchParams]);

  return null;
}

function AnalyticsUiEvents() {
  useEffect(() => {
    if (!posthogKey || !posthog.__loaded) return;

    const events = [
      "analytics_drilldown_opened",
      "analytics_saved_view_applied",
    ] as const;
    const unsubscribe = events.map((event) => {
      const handler = (customEvent: Event) => {
        const detail = customEvent instanceof CustomEvent && customEvent.detail && typeof customEvent.detail === "object" ? customEvent.detail : {};
        posthog.capture(event, { event_source: "browser", feature: "analytics_v1", ...detail });
      };
      window.addEventListener(event, handler);
      return () => window.removeEventListener(event, handler);
    });

    return () => {
      for (const off of unsubscribe) off();
    };
  }, []);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <MarketingAttributionCapture />
        {posthogKey ? <PostHogPageView /> : null}
      </Suspense>
      {posthogKey ? (
        <PHProvider client={posthog}>
          <AnalyticsUiEvents />
          {children}
        </PHProvider>
      ) : (
        children
      )}
    </>
  );
}
