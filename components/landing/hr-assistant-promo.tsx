"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Bot, CheckCircle2, MessageSquareText, Sparkles, UserRoundCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const assistantTasks = [
  "Подсказывает, кого звать дальше",
  "Готовит заметки и ответы по кандидатам",
  "Находит нужные резюме и статусы в CRM",
];

export function HrAssistantPromo() {
  return (
    <section id="hr-assistant" className="bg-muted/50 py-12 sm:py-16 md:py-20 lg:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="min-w-0 max-w-2xl"
          >
            <Badge variant="secondary" className="mb-4 text-xs sm:text-sm">
              HR-ассистент
            </Badge>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
              Ваш личный HR-ассистент
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Делегируйте скучную рутину вашему ИИ-агенту. Он помогает быстро разобраться в кандидатах, собеседованиях,
              и держать процесс найма в фокусе без ручного поиска по CRM. Все через привычный интерфейс чата.
            </p>

            <ul className="mt-6 space-y-3">
              {assistantTasks.map((task) => (
                <li key={task} className="flex items-start gap-3 text-sm leading-relaxed sm:text-base">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span>{task}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                className="h-auto min-h-11 w-full min-w-0 max-w-full whitespace-normal px-3 py-2 text-center leading-snug sm:h-11 sm:w-auto sm:whitespace-nowrap sm:px-4"
              >
                <Link href="/signup?plan=professional">Попробовать HR-ассистента</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-11 w-full min-w-0 max-w-full whitespace-normal px-3 py-2 text-center leading-snug sm:h-11 sm:w-auto sm:whitespace-nowrap sm:px-4"
              >
                <a href="#pricing">Сравнить тарифы</a>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="min-w-0 max-w-full rounded-xl border bg-background p-4 shadow-sm sm:p-5"
            aria-label="Пример диалога с HR-ассистентом"
          >
            <div className="flex items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">HR-ассистент hiiire</p>
                  <p className="truncate text-xs text-muted-foreground">Контекст вакансий и кандидатов уже под рукой</p>
                </div>
              </div>
              <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            </div>

            <div className="space-y-4 py-5">
              <div className="ml-auto max-w-[88%] break-words rounded-lg bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
                Кого из новых кандидатов стоит посмотреть первым?
              </div>
              <div className="max-w-[92%] break-words rounded-lg border bg-muted/40 px-4 py-3 text-sm leading-relaxed">
                Я бы начал с Анны и Дмитрия: у обоих есть релевантный опыт, свежие отклики и совпадение по ключевым
                требованиям вакансии.
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <UserRoundCheck className="h-4 w-4 text-primary" />
                  Приоритет
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Помогает выбрать следующий осмысленный шаг по кандидатам.
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <MessageSquareText className="h-4 w-4 text-primary" />
                  Черновики
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Готовит аккуратный текст для заметок, статусов и коммуникации.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
