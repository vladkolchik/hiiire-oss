import { hasPendingEmailConfirmation, type SupabaseEmailConfirmationUserLike } from "../auth/email-confirmation.ts";

type LandingHeaderAuthUser = SupabaseEmailConfirmationUserLike & {
  email?: string | null;
};

type LandingHeaderAuthResponse = {
  data?: {
    user?: LandingHeaderAuthUser | null;
  } | null;
  error?: unknown;
};

export type LandingHeaderAuthView =
  | {
      kind: "guest";
      loginHref: "/login";
      signupHref: "/signup";
    }
  | {
      kind: "authenticated";
      email: string;
      dashboardHref: "/dashboard";
    };

export function getLandingHeaderAuthView(authenticatedUserEmail: string | null): LandingHeaderAuthView {
  if (!authenticatedUserEmail) {
    return {
      kind: "guest",
      loginHref: "/login",
      signupHref: "/signup",
    };
  }

  return {
    kind: "authenticated",
    email: authenticatedUserEmail,
    dashboardHref: "/dashboard",
  };
}

function getLandingHeaderAuthenticatedEmailFromResponse(response: LandingHeaderAuthResponse): string | null {
  if (response.error || !response.data?.user || hasPendingEmailConfirmation(response.data.user)) {
    return null;
  }

  return response.data.user.email ?? null;
}

export async function resolveLandingHeaderAuthenticatedEmail(
  loadAuthUser: () => Promise<LandingHeaderAuthResponse>
): Promise<string | null> {
  try {
    return getLandingHeaderAuthenticatedEmailFromResponse(await loadAuthUser());
  } catch {
    return null;
  }
}
