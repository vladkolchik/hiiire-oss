"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";

const steps = [
  {
    number: "01",
    title: "Подключите HH.ru",
    description: "Свяжите свой аккаунт HH.ru за пару кликов. Все отклики и резюме будут автоматически синхронизироваться.",
    details: "Используем безопасный OAuth-протокол. Ваши данные защищены и обрабатываются в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».",
  },
  {
    number: "02",
    title: "AI анализирует кандидатов",
    description: "Искусственный интеллект автоматически оценивает каждого кандидата по множеству критериев.",
    details: "Анализируем навыки, опыт, образование, достижения и соответствие вакансии. Каждый кандидат получает детальную оценку от 0 до 100 баллов.",
  },
  {
    number: "03",
    title: "Просматривайте рейтинги",
    description: "Видите всех кандидатов с AI оценками, отсортированными по релевантности к вакансии.",
    details: "Удобные карточки кандидатов с ключевой информацией, фильтры по оценкам и статусам, быстрый доступ к резюме.",
  },
  {
    number: "04",
    title: "Назначайте собеседования",
    description: "Планируйте встречи в удобном календаре с автоматическими уведомлениями.",
    details: "Интеграция с Google Calendar, автоматические напоминания кандидатам и интервьюерам, заметки и оценки после собеседований.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-12 sm:py-16 md:py-20 lg:py-24 bg-muted/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center mb-8 sm:mb-12 md:mb-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
            Как это работает
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:mt-4 sm:text-lg md:px-8">
            Начните находить лучших кандидатов за 4 простых шага
          </p>
        </div>

        <div className="mx-auto max-w-3xl">
          <Accordion type="single" collapsible className="space-y-3 sm:space-y-4" defaultValue="item-0">
            {steps.map((step, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-none">
                <Card>
                  <AccordionTrigger className="px-4 py-3 sm:px-6 sm:py-4 hover:no-underline">
                    <div className="flex items-start gap-3 text-left sm:items-center sm:gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary sm:h-12 sm:w-12 sm:text-base">
                        {step.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base sm:text-lg">{step.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1 sm:text-sm">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-3 sm:px-6 sm:pb-4">
                    <p className="text-sm text-muted-foreground ml-0 sm:ml-16 leading-relaxed">
                      {step.details}
                    </p>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
