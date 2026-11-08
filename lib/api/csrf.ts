import { NextResponse, type NextRequest } from "next/server.js";

import { getRequestOrigin } from "../http/request-origin-core.ts";

type Ok = { ok: true };
type Err = { ok: false; response: NextResponse };

function forbidden(): Err {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "FORBIDDEN", message: "Обновите страницу и попробуйте ещё раз." },
      { status: 403 }
    ),
  };
}

export function requireSameOriginRequest(req: NextRequest): Ok | Err {
  const origin = req.headers.get("origin");
  if (!origin) return forbidden();

  try {
    const originUrl = new URL(origin);
    const expectedOrigin = new URL(getRequestOrigin(req)).origin;
    if (originUrl.origin !== expectedOrigin) return forbidden();
  } catch {
    return forbidden();
  }

  return { ok: true };
}
