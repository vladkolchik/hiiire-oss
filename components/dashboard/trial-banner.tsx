"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

type PlanInfo = {
  currentPlan: string;
  trialDaysLeft: number | null;
  trialState: "hidden" | "active" | "expiring" | "expired";
  intendedPlan: string | null;
};

type BannerState =
  | { kind: "hidden" }
  | { kind: "trial_active"; daysLeft: number; intendedPlan: string | null }
  | { kind: "trial_expiring"; daysLeft: number; intendedPlan: string | null }
  | { kind: "trial_expired"; intendedPlan: string | null };

function computeBannerState(plan: PlanInfo): BannerState {
  if (plan.currentPlan !== "trial" || plan.trialState === "hidden") return { kind: "hidden" };

  if (plan.trialState === "expired") {
    return { kind: "trial_expired", intendedPlan: plan.intendedPlan };
  }
  if (typeof plan.trialDaysLeft !== "number") return { kind: "hidden" };

  if (plan.trialState === "expiring") {
    return { kind: "trial_expiring", daysLeft: plan.trialDaysLeft, intendedPlan: plan.intendedPlan };
  }
  return { kind: "trial_active", daysLeft: plan.trialDaysLeft, intendedPlan: plan.intendedPlan };
}

function upgradeHref(intendedPlan: string | null): string {
  if (intendedPlan === "professional") return "/dashboard/settings?tab=plan&plan=professional";
  if (intendedPlan === "enterprise") return "/dashboard/settings?tab=plan&plan=enterprise";
  return "/dashboard/settings?tab=plan";
}

export function TrialBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<BannerState>({ kind: "hidden" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;

    let mounted = true;

    const load = async () => {
      try {
        const res = await fetch("/api/billing/plan", { method: "GET", cache: "no-store" });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data || !mounted) return;

        const next = computeBannerState(data as PlanInfo);
        if (mounted) setState(next);
      } catch {
        // Silently fail — banner is non-critical
      }
    };

    void load();
    return () => { mounted = false; };
  }, [user]);

  if (dismissed || state.kind === "hidden") return null;

  const href = upgradeHref(
    state.kind === "trial_active" || state.kind === "trial_expiring" || state.kind === "trial_expired"
      ? state.intendedPlan
      : null
  );

  if (state.kind === "trial_expired") {
    return (
      <div className="flex items-center gap-3 border-b bg-foreground px-4 py-2.5 text-background">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="flex-1 text-sm">
          Пробный период истёк.{" "}
          <Link href={href} className="font-semibold underline underline-offset-4 hover:no-underline">
            Выберите тариф
          </Link>{" "}
          чтобы продолжить работу.
        </p>
      </div>
    );
  }

  if (state.kind === "trial_expiring") {
    return (
      <div className="flex items-center gap-3 border-b bg-foreground px-4 py-2.5 text-background">
        <Clock className="h-4 w-4 shrink-0" />
        <p className="flex-1 text-sm">
          До конца пробного периода{" "}
          <span className="font-semibold">
            {state.daysLeft} {state.daysLeft === 1 ? "день" : "дня"}
          </span>
          .{" "}
          <Link href={href} className="font-semibold underline underline-offset-4 hover:no-underline">
            Подключить тариф
          </Link>
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-background hover:bg-background/20 hover:text-background"
          onClick={() => setDismissed(true)}
          aria-label="Закрыть"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // trial_active
  return (
    <div className="flex items-center gap-3 border-b bg-muted px-4 py-2 text-muted-foreground">
      <p className="flex-1 text-sm">
        Пробный период: осталось{" "}
        <span className="font-medium text-foreground">
          {state.daysLeft} {state.daysLeft === 1 ? "день" : state.daysLeft < 5 ? "дня" : "дней"}
        </span>
        .{" "}
        <Link href={href} className="text-foreground underline underline-offset-4 hover:no-underline">
          Выбрать тариф
        </Link>
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 hover:bg-muted-foreground/20"
        onClick={() => setDismissed(true)}
        aria-label="Закрыть"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
