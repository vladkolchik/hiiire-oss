"use client";

import * as React from "react";
import posthog from "posthog-js";
import type { User as AppUser } from "@/types";
import type { MarketingAttributionPayload } from "@/lib/marketing/attribution";

export type RegisterResult =
  | { status: "authenticated" }
  | { status: "email_confirmation_required"; email: string; reason: "new_signup" | "existing_unconfirmed" };

export type AuthFlowErrorCode = "EMAIL_NOT_CONFIRMED" | "INVALID_CREDENTIALS" | "UNKNOWN_AUTH_ERROR";

export class AuthFlowError extends Error {
  public readonly code: AuthFlowErrorCode;
  public readonly email?: string;

  constructor(code: AuthFlowErrorCode, message: string, email?: string) {
    super(message);
    this.name = "AuthFlowError";
    this.code = code;
    this.email = email;
  }
}

export function isAuthFlowError(error: unknown): error is AuthFlowError {
  return error instanceof AuthFlowError;
}

type AuthContextType = {
  user: AppUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    phone: string;
    company: string;
    intendedPlan?: "starter" | "professional";
    marketingAttribution?: MarketingAttributionPayload;
  }) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

type AuthSessionApiResponse = {
  user: (Omit<AppUser, "createdAt"> & { createdAt: string }) | null;
};

async function fetchAuthSession(): Promise<AppUser | null> {
  const response = await fetch("/api/auth/session", { method: "GET", cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as AuthSessionApiResponse | null;
  if (!response.ok || !payload || !("user" in payload)) {
    throw new Error("Не удалось загрузить сессию");
  }
  if (!payload.user) return null;

  return {
    ...payload.user,
    createdAt: new Date(payload.user.createdAt),
  };
}

type SignupApiResponse =
  | RegisterResult
  | {
      error: string;
      message?: string;
    };

function isSignupApiError(payload: SignupApiResponse | null): payload is Extract<SignupApiResponse, { error: string }> {
  return Boolean(payload && "error" in payload);
}

function isSignupApiSuccess(payload: SignupApiResponse | null): payload is RegisterResult {
  return Boolean(payload && "status" in payload);
}

type PostHogPlanProperties = {
  plan: string | null;
  billing_status: string | null;
};

async function loadPostHogPlanProperties(): Promise<PostHogPlanProperties> {
  try {
    const response = await fetch("/api/billing/plan", { cache: "no-store" });
    if (!response.ok) return { plan: null, billing_status: null };

    const payload = (await response.json().catch(() => null)) as {
      currentPlan?: unknown;
      billingStatus?: unknown;
    } | null;

    return {
      plan: typeof payload?.currentPlan === "string" ? payload.currentPlan : null,
      billing_status: typeof payload?.billingStatus === "string" ? payload.billingStatus : null,
    };
  } catch {
    return { plan: null, billing_status: null };
  }
}

function resetPostHogBestEffort() {
  try {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY && posthog.__loaded) {
      posthog.reset();
    }
  } catch {
    // Analytics must not break auth state.
  }
}

async function identifyPostHogUser(user: AppUser) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !posthog.__loaded) {
    return;
  }

  const planProperties = await loadPostHogPlanProperties();

  try {
    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
      role: user.role,
      company_id: user.companyId,
      plan: planProperties.plan,
      billing_status: planProperties.billing_status,
    });

    if (user.companyId) {
      posthog.group("company", user.companyId, {
        name: user.company,
        plan: planProperties.plan,
        billing_status: planProperties.billing_status,
      });
    }
  } catch {
    // Analytics must not break auth state.
  }
}

async function capturePostHogLoginCompleted(user: AppUser) {
  try {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !posthog.__loaded) {
      return;
    }

    const planProperties = await loadPostHogPlanProperties();

    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
      role: user.role,
      company_id: user.companyId,
      plan: planProperties.plan,
      billing_status: planProperties.billing_status,
    });

    if (user.companyId) {
      posthog.group("company", user.companyId, {
        name: user.company,
        plan: planProperties.plan,
        billing_status: planProperties.billing_status,
      });
    }

    posthog.capture("login_completed", {
      user_id: user.id,
      company_id: user.companyId,
      role: user.role,
      plan: planProperties.plan,
      billing_status: planProperties.billing_status,
    });
  } catch {
    // Analytics must not break login.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const lastPostHogUserIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const appUser = await fetchAuthSession();
        if (mounted) setUser(appUser);
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void init();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (isLoading) return;

    if (!user) {
      if (lastPostHogUserIdRef.current) {
        resetPostHogBestEffort();
      }
      lastPostHogUserIdRef.current = null;
      return;
    }

    if (lastPostHogUserIdRef.current === user.id) {
      return;
    }

    lastPostHogUserIdRef.current = user.id;
    void identifyPostHogUser(user);
  }, [isLoading, user]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      let response: Response;
      try {
        response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        throw new AuthFlowError("UNKNOWN_AUTH_ERROR", "Не удалось войти. Попробуйте ещё раз.");
      }

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        email?: string;
      } | null;

      if (!response.ok) {
        if (payload?.error === "EMAIL_NOT_CONFIRMED") {
          throw new AuthFlowError(
            "EMAIL_NOT_CONFIRMED",
            payload.message ?? "Подтвердите email, чтобы войти",
            payload.email ?? email
          );
        }
        if (payload?.error === "INVALID_CREDENTIALS") {
          throw new AuthFlowError("INVALID_CREDENTIALS", "Неверный email или пароль");
        }
        throw new AuthFlowError("UNKNOWN_AUTH_ERROR", payload?.message ?? "Не удалось войти. Попробуйте ещё раз.");
      }

      let appUser: AppUser | null = null;
      try {
        appUser = await fetchAuthSession();
      } catch {
        throw new AuthFlowError("UNKNOWN_AUTH_ERROR", "Не удалось войти. Попробуйте ещё раз.");
      }
      if (!appUser) throw new AuthFlowError("UNKNOWN_AUTH_ERROR", "Не удалось войти. Попробуйте ещё раз.");
      setUser(appUser);
      void capturePostHogLoginCompleted(appUser);
    },
    []
  );

  const register = React.useCallback(
    async (data: {
      email: string;
      password: string;
      name: string;
      phone: string;
      company: string;
      intendedPlan?: "starter" | "professional";
      marketingAttribution?: MarketingAttributionPayload;
    }): Promise<RegisterResult> => {
      let response: Response;
      try {
        response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.email,
            password: data.password,
            name: data.name,
            phone: data.phone,
            company: data.company,
            intendedPlan: data.intendedPlan ?? "starter",
            marketingAttribution: data.marketingAttribution,
          }),
        });
      } catch {
        throw new Error("Регистрация временно недоступна. Попробуйте позже.");
      }

      const payload = (await response.json().catch(() => null)) as SignupApiResponse | null;

      if (!response.ok) {
        if (isSignupApiError(payload) && payload.error === "TRIAL_ALREADY_USED_FOR_EMAIL") {
          throw new Error("Пробный период для этого email уже использован. Войдите в аккаунт и выберите тариф.");
        }
        if (isSignupApiError(payload) && payload.error === "EMAIL_ALREADY_REGISTERED") {
          throw new Error("Этот email уже зарегистрирован. Войдите в аккаунт или восстановите пароль.");
        }
        throw new Error(isSignupApiError(payload) ? payload.message ?? "Не удалось зарегистрироваться" : "Не удалось зарегистрироваться");
      }

      if (!isSignupApiSuccess(payload)) {
        throw new Error("Не удалось зарегистрироваться");
      }

      if (payload.status === "email_confirmation_required") {
        setUser(null);
        return payload;
      }

      if (payload.status !== "authenticated") {
        throw new Error("Не удалось зарегистрироваться");
      }

      const appUser = await fetchAuthSession().catch(() => null);
      setUser(
        appUser ?? {
          id: data.email,
          email: data.email,
          name: data.name,
          phone: data.phone,
          company: data.company,
          role: "admin",
          avatar: undefined,
          createdAt: new Date(),
        }
      );

      return { status: "authenticated" };
    },
    []
  );

  const logout = React.useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      const appUser = await fetchAuthSession();
      setUser(appUser);
    } catch {
      // Keep current user as-is on refresh errors.
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
