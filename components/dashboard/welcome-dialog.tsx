"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function WelcomeDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

  function formatTrialDays(days: number): string {
    return `${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}`;
  }

  useEffect(() => {
    if (!user) return;

    let mounted = true;

    const check = async () => {
      try {
        const res = await fetch("/api/onboarding/welcome", { method: "GET", cache: "no-store" });
        const data = await res.json().catch(() => null);

        if (!res.ok || !mounted || !data || typeof data !== "object") return;

        // Show dialog only if onboarding_completed is explicitly false (not null)
        if ((data as { onboardingCompleted?: unknown }).onboardingCompleted === false) {
          const trialDays = (data as { trialDaysLeft?: unknown }).trialDaysLeft;
          setTrialDaysLeft(typeof trialDays === "number" ? trialDays : null);
          setOpen(true);
        }
      } catch {
        // Non-critical, silently ignore
      }
    };

    void check();
    return () => { mounted = false; };
  }, [user]);

  const handleDismiss = async () => {
    setOpen(false);
    if (!user) return;
    try {
      await fetch("/api/onboarding/welcome", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
    } catch {
      // Non-critical
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) void handleDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Добро пожаловать в hiiire</DialogTitle>
          <DialogDescription className="text-sm">
            {trialDaysLeft !== null && trialDaysLeft > 0
              ? `У вас ${formatTrialDays(trialDaysLeft)} бесплатного доступа — 50 кредитов уже зачислены на счёт.`
              : trialDaysLeft === 0
                ? "Пробный период истёк. Вы можете выбрать тариф в настройках, данные останутся на месте."
                : "Аккаунт готов к работе. Настройки тарифа и кредитов доступны в разделе «Тариф»."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm text-muted-foreground">
          <p>Что можно сделать прямо сейчас:</p>
          <ul className="space-y-1.5 pl-4 list-disc">
            <li>Создайте первую вакансию</li>
            <li>Загрузите резюме и получите AI-анализ</li>
            <li>Подключите HH.ru в настройках</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 pt-2 md:flex-row">
          <Button
            className="h-auto w-full min-w-0 whitespace-normal py-2 text-center md:flex-1"
            onClick={handleDismiss}
            asChild
          >
            <Link href="/dashboard">Начать самостоятельно</Link>
          </Button>
          <Button
            variant="outline"
            className="h-auto w-full min-w-0 whitespace-normal py-2 text-center md:flex-1"
            asChild
            onClick={() => void handleDismiss()}
          >
            <Link href="/request-access?demo=true" target="_blank" rel="noopener noreferrer">
              Записаться на демо — 30 мин
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
