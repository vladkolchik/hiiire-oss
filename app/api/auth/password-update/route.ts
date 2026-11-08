import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireSameOriginRequest } from "@/lib/api/csrf";
import {
  clearPasswordResetContext,
  clearPasswordResetRecoveryMarker,
  readPasswordResetRecoveryMarker,
} from "@/lib/auth/password-reset-context.server";
import { getPasswordUpdateErrorMessage } from "@/lib/auth/user-facing-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPasswordValidationMessage } from "@/lib/validation/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PasswordUpdateBodySchema = z.object({
  password: z.string().max(72, "Пароль слишком длинный"),
});

export async function POST(req: NextRequest) {
  try {
    const csrf = requireSameOriginRequest(req);
    if (!csrf.ok) return csrf.response;

    const recoveryMarker = readPasswordResetRecoveryMarker(req);
    if (!recoveryMarker) {
      return NextResponse.json(
        { error: "RESET_CONTEXT_UNVERIFIED", message: "Откройте ссылку восстановления из письма ещё раз." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = PasswordUpdateBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", message: "Проверьте новый пароль." }, { status: 400 });
    }

    const passwordMessage = getPasswordValidationMessage(parsed.data.password);
    if (passwordMessage) {
      return NextResponse.json({ error: "INVALID_BODY", message: passwordMessage }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !data.user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Ссылка восстановления недействительна или истекла." },
        { status: 401 }
      );
    }

    if (data.user.email?.trim().toLowerCase() !== recoveryMarker.email) {
      return NextResponse.json(
        { error: "RESET_CONTEXT_MISMATCH", message: "Запросите новую ссылку восстановления пароля." },
        { status: 403 }
      );
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      return NextResponse.json(
        { error: "PASSWORD_UPDATE_FAILED", message: getPasswordUpdateErrorMessage(error) },
        { status: 400 }
      );
    }

    const res = NextResponse.json({ ok: true }, { status: 200 });
    clearPasswordResetContext(res, req);
    clearPasswordResetRecoveryMarker(res, req);
    return res;
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось обновить пароль" }, { status: 500 });
  }
}
