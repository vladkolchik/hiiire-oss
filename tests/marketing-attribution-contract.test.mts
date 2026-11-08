import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function read(path: string) {
  assert.ok(existsSync(path), `${path} should exist`);
  return readFileSync(path, "utf8");
}

test("marketing attribution client captures UTM and is mounted with analytics", () => {
  const attribution = read("lib/marketing/attribution.ts");
  const capture = read("components/analytics/marketing-attribution-capture.tsx");
  const provider = read("components/analytics/posthog-provider.tsx");

  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid"]) {
    assert.match(attribution, new RegExp(key));
  }
  assert.match(attribution, /readMarketingAttribution/);
  assert.match(attribution, /buildMarketingVisitPayload/);
  assert.match(capture, /api\/marketing\/attribution\/visit/);
  assert.match(capture, /sessionStorage/);
  assert.match(provider, /MarketingAttributionCapture/);
  assert.match(provider, /<MarketingAttributionCapture \/>[\s\S]*\{posthogKey \?/);
  assert.doesNotMatch(provider, /if\s*\(!posthogKey\)\s*\{\s*return <>\{children\}<\/>/);
});

test("marketing attribution storage failures stay best-effort", async () => {
  const moduleUrl = pathToFileURL(path.resolve("lib/marketing/attribution.ts")).href;
  const { buildMarketingVisitPayload, readMarketingAttribution } = await import(`${moduleUrl}?storage-failure=${Date.now()}`);
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousCrypto = globalThis.crypto;
  const throwingStorage = {
    getItem() {
      throw new DOMException("blocked", "SecurityError");
    },
    setItem() {
      throw new DOMException("blocked", "SecurityError");
    },
  };

  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => "00000000-0000-4000-8000-000000000123" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "https://example.test/signup?utm_source=newsletter&utm_campaign=may" },
      localStorage: throwingStorage,
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { referrer: "https://referrer.test/" },
  });

  try {
    assert.equal(readMarketingAttribution(), undefined);
    const payload = buildMarketingVisitPayload();
    assert.equal(payload?.visitor_id, "00000000-0000-4000-8000-000000000123");
    assert.equal(payload?.first_touch.utm_source, "newsletter");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: previousCrypto });
  }
});

test("marketing attribution fallback visitor id stays compatible with server UUID contract", async () => {
  const attributionModuleUrl = pathToFileURL(path.resolve("lib/marketing/attribution.ts")).href;
  const validationModuleUrl = pathToFileURL(path.resolve("lib/validation/marketing-attribution.ts")).href;
  const { buildMarketingVisitPayload } = await import(`${attributionModuleUrl}?uuid-fallback=${Date.now()}`);
  const { MarketingAttributionPayloadSchema } = await import(`${validationModuleUrl}?uuid-fallback=${Date.now()}`);
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousCrypto = globalThis.crypto;
  const storage = new Map<string, string>();

  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "https://example.test/signup?utm_source=newsletter" },
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { referrer: "" },
  });

  try {
    const payload = buildMarketingVisitPayload();
    assert.ok(payload);
    assert.doesNotThrow(() => MarketingAttributionPayloadSchema.parse(payload));
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: previousCrypto });
  }
});

test("marketing attribution validation accepts captured_at timestamps with timezone offsets", async () => {
  const validationModuleUrl = pathToFileURL(path.resolve("lib/validation/marketing-attribution.ts")).href;
  const { MarketingAttributionPayloadSchema } = await import(`${validationModuleUrl}?offset=${Date.now()}`);
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

  assert.doesNotThrow(() =>
    MarketingAttributionPayloadSchema.parse({
      visitor_id: "00000000-0000-4000-8000-000000000123",
      landing_path: "/signup",
      referrer: null,
      first_touch: emptyTouch,
      last_touch: emptyTouch,
      captured_at: "2026-05-30T18:18:12+00:00",
    })
  );
});

test("marketing attribution keeps the first non-direct campaign after a direct visit", async () => {
  const moduleUrl = pathToFileURL(path.resolve("lib/marketing/attribution.ts")).href;
  const { buildMarketingVisitPayload } = await import(`${moduleUrl}?first-non-direct=${Date.now()}`);
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousCrypto = globalThis.crypto;
  const storage = new Map<string, string>();
  const fakeStorage = {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  };
  const fakeWindow = {
    location: { href: "https://example.test/" },
    localStorage: fakeStorage,
  };

  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => "00000000-0000-4000-8000-000000000124" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { referrer: "" },
  });

  try {
    const directPayload = buildMarketingVisitPayload();
    assert.equal(directPayload?.first_touch.utm_source, null);

    fakeWindow.location.href = "https://example.test/signup?utm_source=google&utm_medium=cpc&utm_campaign=brand";
    const campaignPayload = buildMarketingVisitPayload();
    assert.equal(campaignPayload?.first_touch.utm_source, "google");
    assert.equal(campaignPayload?.first_touch.utm_medium, "cpc");
    assert.equal(campaignPayload?.last_touch.utm_campaign, "brand");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: previousCrypto });
  }
});

test("marketing attribution only captures acquisition routes", async () => {
  const moduleUrl = pathToFileURL(path.resolve("lib/marketing/route-eligibility.ts")).href;
  const { isMarketingAttributionRoute } = await import(`${moduleUrl}?route-eligibility=${Date.now()}`);

  for (const route of ["/", "/signup", "/request-access", "/about", "/blog/hiring"]) {
    assert.equal(isMarketingAttributionRoute(route), true, `${route} should capture acquisition attribution`);
  }

  for (const route of [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/dashboard",
    "/dashboard/settings",
    "/admin",
    "/admin/marketing",
    "/api/marketing/attribution/visit",
    "/auth/callback",
    "/auth/confirm",
  ]) {
    assert.equal(isMarketingAttributionRoute(route), false, `${route} should not create a marketing visit`);
  }
});

test("signup persists marketing attribution without exposing raw technical errors", () => {
  const signupPage = read("app/(auth)/signup/page.tsx");
  const authHook = read("hooks/use-auth.tsx");
  const validation = read("lib/validation/signup.ts");
  const signupRoute = read("app/api/auth/signup/route.ts");
  const businessEvents = read("lib/analytics/business-events.ts");

  assert.match(signupPage, /readMarketingAttribution/);
  assert.match(signupPage, /marketingAttribution:\s*readMarketingAttribution\(\)/);
  assert.match(authHook, /marketingAttribution\?:\s*MarketingAttributionPayload/);
  assert.match(authHook, /marketingAttribution:\s*data\.marketingAttribution/);
  assert.match(validation, /MarketingAttributionPayloadSchema/);
  assert.match(signupRoute, /recordMarketingSignup/);
  assert.match(signupRoute, /marketingAttribution:\s*parsed\.data\.marketingAttribution/);
  assert.match(signupRoute, /scheduleSignupOwnerNotification/);
  assert.doesNotMatch(signupRoute, /await\s+scheduleSignupOwnerNotification/);
  const marketingServer = read("lib/marketing/server.ts");
  assert.doesNotMatch(marketingServer, /p_seen_at:\s*payload\.captured_at/);
  assert.match(marketingServer, /const receivedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(marketingServer, /p_seen_at:\s*receivedAt/);
  assert.match(marketingServer, /recordMarketingVisit\(input\.marketingAttribution,\s*\{\s*recordEvent:\s*false\s*\}\)/);
  for (const prop of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    assert.match(businessEvents, new RegExp(`"${prop}"`));
  }
  for (const prop of ["gclid", "fbclid", "msclkid"]) {
    assert.doesNotMatch(businessEvents, new RegExp(`"${prop}"`));
  }
});

test("anonymous marketing visit endpoint limits cheap checks before parsing JSON", () => {
  const route = read("app/api/marketing/attribution/visit/route.ts");
  const contentLengthIndex = route.indexOf("content-length");
  const rateLimitIndex = route.indexOf("checkFixedWindowRateLimit");
  const jsonParseIndex = route.indexOf("req.json()");

  assert.ok(contentLengthIndex >= 0, "route should check content-length before parsing JSON");
  assert.ok(rateLimitIndex >= 0, "route should rate limit anonymous writes");
  assert.ok(jsonParseIndex >= 0, "route should parse JSON");
  assert.ok(contentLengthIndex < jsonParseIndex, "content-length check should run before JSON parse");
  assert.ok(rateLimitIndex < jsonParseIndex, "rate limit should run before JSON parse");
  assert.match(route, /status:\s*413/);
  assert.doesNotMatch(route, /PAYLOAD_TOO_LARGE/);
});

test("admin marketing page shows source funnel from visitors to revenue", () => {
  const sidebar = read("components/admin/admin-sidebar.tsx");
  const page = read("app/(admin)/admin/(protected)/marketing/page.tsx");
  const capture = read("components/analytics/marketing-attribution-capture.tsx");
  const routeEligibility = read("lib/marketing/route-eligibility.ts");

  assert.match(sidebar, /\/admin\/marketing/);
  assert.match(sidebar, /Маркетинг/);
  assert.match(page, /\.rpc\("get_marketing_admin_report"/);
  assert.match(page, /p_recent_offset/);
  assert.match(page, /buildMarketingHref\(days, nextPage\)/);
  assert.match(page, /Назад/);
  assert.match(page, /Вперёд/);
  assert.doesNotMatch(page, /\.from\("marketing_visitors"\)/);
  assert.doesNotMatch(page, /\.from\("marketing_conversions"\)/);
  assert.doesNotMatch(page, /\.from\("payments"\)/);
  for (const label of ["Визиты", "Регистрации", "Компании", "Оплаты", "Выручка"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /utm_source/);
  assert.match(page, /utm_medium/);
  assert.match(page, /utm_campaign/);
  assert.doesNotMatch(page, /миграции marketing attribution/);
  assert.match(capture, /isMarketingAttributionRoute/);
  assert.match(routeEligibility, /\/admin/);
  assert.match(routeEligibility, /\/dashboard/);
});

test("admin marketing page shows concrete registered users and companies", () => {
  const page = read("app/(admin)/admin/(protected)/marketing/page.tsx");
  const businessEvents = read("lib/analytics/business-events.ts");

  assert.match(page, /recentConversions/);
  assert.match(page, /Кто пришёл/);
  assert.match(page, /Пользователь/);
  assert.match(page, /Компания/);
  assert.doesNotMatch(businessEvents, /\|\s*"email"|\|\s*"name"|\|\s*"company_name"/);
});

test("Supabase migration defines private marketing attribution tables and RPC", () => {
  const migration = `${read("supabase/sql/marketing_attribution_v1.sql")}\n${read("supabase/sql/marketing_attribution_admin_report_v2.sql")}\n${read("supabase/sql/marketing_attribution_admin_report_v3.sql")}\n${read("supabase/sql/marketing_attribution_admin_report_v4.sql")}\n${read("supabase/sql/marketing_attribution_admin_report_v5.sql")}\n${read("supabase/sql/marketing_attribution_admin_report_v6.sql")}`;

  assert.match(migration, /create table if not exists public\.marketing_visitors/);
  assert.match(migration, /create table if not exists public\.marketing_visit_events/);
  assert.match(migration, /create table if not exists public\.marketing_conversions/);
  assert.match(migration, /alter table public\.marketing_visitors enable row level security/);
  assert.match(migration, /alter table public\.marketing_visit_events enable row level security/);
  assert.match(migration, /alter table public\.marketing_conversions enable row level security/);
  assert.match(migration, /create or replace function public\.record_marketing_visit/);
  assert.match(migration, /insert into public\.marketing_visit_events/);
  assert.match(migration, /create or replace function public\.get_marketing_admin_report/);
  assert.match(migration, /p_start_at timestamptz/);
  assert.match(migration, /p_source_limit integer default 200/);
  assert.match(migration, /p_recent_offset integer default 0/);
  assert.match(migration, /offset greatest\(0, coalesce\(p_recent_offset, 0\)\)/);
  assert.match(migration, /when c\.company_id is null then 'unattributed'/);
  assert.match(migration, /source_ranked/);
  assert.match(migration, /source_other/);
  assert.match(migration, /p_record_event boolean default true/);
  assert.match(migration, /if p_record_event then/);
  assert.match(migration, /count\(distinct visitor_id\)/);
  assert.match(migration, /v_existing_first_is_direct/);
  assert.match(migration, /credit_topup_payments/);
  assert.match(migration, /all_completed_payments/);
  assert.match(migration, /revoke all on function public\.record_marketing_visit/);
  assert.match(migration, /revoke all on function public\.get_marketing_admin_report/);
  assert.match(migration, /get_marketing_admin_report\(timestamptz, integer, integer, integer\)/);
  assert.match(migration, /visitor_id uuid/);
  assert.match(migration, /company_id uuid/);
});
