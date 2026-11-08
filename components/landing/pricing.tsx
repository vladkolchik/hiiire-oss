"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Starter",
    description: "Для небольших команд",
    price: "4 990₽",
    period: "/месяц",
    features: [
      "Безлимит рекрутеров, вакансий и кандидатов",
      "500 AI-запросов в месяц",
      "Интеграция с HH.ru",
      "Telegram и Email уведомления",
      "Календарь собеседований и Google Calendar (скоро)",
      "AI советы по вакансиям",
      "Аналитика и отчёты",
      "HR-ассистент",
    ],
    cta: "Попробовать бесплатно",
    href: "/signup?plan=starter",
    popular: false,
  },
  {
    name: "Professional",
    description: "Для растущих компаний",
    price: "9 990₽",
    period: "/месяц",
    features: [
      "Безлимит рекрутеров, вакансий и кандидатов",
      "2 000 AI-запросов в месяц",
      "Интеграция с HH.ru",
      "Telegram и Email уведомления",
      "Календарь собеседований и Google Calendar (скоро)",
      "AI советы по вакансиям",
      "Аналитика и отчёты",
      "HR-ассистент",
      "Приоритетная поддержка",
    ],
    cta: "Попробовать бесплатно",
    href: "/signup?plan=professional",
    popular: true,
  },
  {
    name: "Enterprise",
    anchorId: "enterprise",
    description: "Для крупных организаций",
    price: "Индивидуально",
    period: "",
    features: [
      "Всё из Professional",
      "Индивидуальные лимиты AI-запросов со скидкой",
      "Выделенный менеджер",
      "Обучение команды",
    ],
    cta: "Связаться с нами",
    href: "/request-access?plan=enterprise",
    popular: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-12 sm:py-16 md:py-20 lg:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center mb-8 sm:mb-12 md:mb-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
            Прозрачные тарифы
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:mt-4 sm:text-lg md:px-8">
            7 дней бесплатно — без привязки карты. Потом выберите план для вашей команды.
          </p>
        </div>

        <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              id={plan.anchorId}
              className={`relative flex flex-col ${
                plan.popular ? "border-primary shadow-lg md:scale-105" : ""
              } ${plan.anchorId ? "scroll-mt-24 sm:scroll-mt-28" : ""}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-0 right-0 flex justify-center sm:-top-4">
                  <Badge className="px-2.5 py-0.5 text-xs sm:px-3 sm:py-1 sm:text-sm">Популярный</Badge>
                </div>
              )}
              <CardHeader className="pb-6 sm:pb-8">
                <CardTitle className="text-xl sm:text-2xl">{plan.name}</CardTitle>
                <CardDescription className="text-sm sm:text-base">{plan.description}</CardDescription>
                <div className="mt-3 sm:mt-4">
                  <span className="text-3xl font-bold sm:text-4xl">{plan.price}</span>
                  {plan.period && (
                    <span className="text-sm text-muted-foreground sm:text-base">{plan.period}</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2.5 sm:space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-2">
                      <Check className="h-4 w-4 shrink-0 text-primary mt-0.5 sm:h-5 sm:w-5" />
                      <span className="text-xs sm:text-sm leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="pt-4 sm:pt-6">
                <Button
                  className="w-full h-10 sm:h-11 text-sm sm:text-base"
                  variant={plan.popular ? "default" : "outline"}
                  asChild
                >
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Demo section */}
        <div className="mt-12 sm:mt-16 mx-auto max-w-2xl text-center">
          <p className="text-sm text-muted-foreground sm:text-base">
            Хотите посмотреть продукт вживую?{" "}
            <Link
              href="/request-access?demo=true"
              className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              Запишитесь на 30-минутное демо
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
