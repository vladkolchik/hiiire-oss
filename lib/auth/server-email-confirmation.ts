import { hasPendingEmailConfirmation, type SupabaseEmailConfirmationUserLike } from "./email-confirmation.ts";

type SupabaseAuthUserLike = SupabaseEmailConfirmationUserLike & {
  id: string;
};

export type ConfirmedServerUserResult<TUser extends SupabaseAuthUserLike = SupabaseAuthUserLike> =
  | { ok: true; user: TUser }
  | { ok: false; reason: "unauthorized" | "pending_email" };

export async function getConfirmedServerUser<TUser extends SupabaseAuthUserLike = SupabaseAuthUserLike>(
  supabase: {
    auth: {
      getUser(): Promise<{
        data: {
          user: TUser | null | undefined;
        };
        error: unknown;
      }>;
    };
  }
): Promise<ConfirmedServerUserResult<TUser>> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { ok: false, reason: "unauthorized" };
  }

  if (hasPendingEmailConfirmation(data.user)) {
    return { ok: false, reason: "pending_email" };
  }

  return { ok: true, user: data.user };
}
