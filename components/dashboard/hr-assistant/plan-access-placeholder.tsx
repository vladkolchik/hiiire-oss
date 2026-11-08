import Link from "next/link";
import { Bot, CreditCard, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HR_ASSISTANT_PLAN_REQUIRED_DESCRIPTION,
  HR_ASSISTANT_PLAN_REQUIRED_MESSAGE,
  type HrAssistantPlanAccess,
} from "@/lib/hr-assistant/access";

const planLabel: Record<HrAssistantPlanAccess["currentPlan"], string> = {
  trial: "Trial",
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

export function HrAssistantPlanAccessPlaceholder({ access }: { access: HrAssistantPlanAccess }) {
  const statusLabel = access.billingStatus === "inactive" ? "Тариф не активен" : `Текущий тариф: ${planLabel[access.currentPlan]}`;

  return (
    <div className="flex h-[calc(100dvh_-_7rem)] min-h-[34rem] min-w-0 flex-col gap-4 overflow-hidden md:h-[calc(100dvh_-_6rem)]">
      <div className="min-w-0">
        <h1 className="break-words text-3xl font-bold tracking-tight">HR-ассистент</h1>
        <p className="mt-1 max-w-3xl break-words text-sm text-muted-foreground">
          Помогает работать с вакансиями, кандидатами, интервью и настройками hiiire.
        </p>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-md border bg-background p-4 md:p-8">
        <section className="w-full max-w-2xl rounded-md border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Bot className="size-6" aria-hidden="true" />
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <Badge variant="secondary" className="w-fit">
                  {statusLabel}
                </Badge>
                <div className="space-y-1">
                  <h2 className="break-words text-xl font-semibold tracking-tight">
                    {HR_ASSISTANT_PLAN_REQUIRED_MESSAGE}
                  </h2>
                  <p className="break-words text-sm leading-6 text-muted-foreground">
                    {HR_ASSISTANT_PLAN_REQUIRED_DESCRIPTION}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                <div className="flex min-w-0 gap-2 rounded-md border bg-muted/30 p-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="min-w-0 break-words">Доступ откроется сразу после активации тарифа.</p>
                </div>
                <div className="flex min-w-0 gap-2 rounded-md border bg-muted/30 p-3">
                  <CreditCard className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="min-w-0 break-words">Проверить оплату и подключение можно в настройках тарифа.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild>
                  <Link href="/dashboard/settings?tab=plan">
                    <CreditCard className="size-4" aria-hidden="true" />
                    Перейти к тарифу
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
