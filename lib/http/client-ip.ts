import "server-only";

import type { NextRequest } from "next/server";

function firstHeaderValue(value: string | null) {
  if (!value) return null;
  return value.split(",")[0]?.trim() || null;
}

export function getClientIp(req: NextRequest) {
  return (
    firstHeaderValue(req.headers.get("cf-connecting-ip")) ??
    firstHeaderValue(req.headers.get("x-real-ip")) ??
    firstHeaderValue(req.headers.get("x-forwarded-for")) ??
    "unknown"
  );
}
