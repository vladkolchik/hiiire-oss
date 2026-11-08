import { NextResponse, type NextRequest } from "next/server";

import { recordMarketingVisit } from "@/lib/marketing/server";
import { getClientIp } from "@/lib/http/client-ip";
import { checkFixedWindowRateLimit } from "@/lib/security/fixed-window-rate-limit";
import { MarketingAttributionPayloadSchema } from "@/lib/validation/marketing-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_BY_IP = 240;
const MAX_BODY_BYTES = 10_000;

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Не удалось сохранить источник перехода." },
      { status: 413 },
    );
  }

  const limit = checkFixedWindowRateLimit({
    namespace: "marketing-visit-ip",
    key: getClientIp(req),
    limit: RATE_LIMIT_BY_IP,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMIT", message: "Слишком много событий. Попробуйте позже." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = MarketingAttributionPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Не удалось сохранить источник перехода." },
      { status: 400 },
    );
  }

  try {
    await recordMarketingVisit(parsed.data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "SAVE_FAILED", message: "Не удалось сохранить источник перехода." },
      { status: 502 },
    );
  }
}
