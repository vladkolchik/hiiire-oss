"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BellRing, Building2, Clock, ShieldCheck, Workflow } from "lucide-react";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const pillars = [
  {
    icon: Building2,
    title: "Собираем внутренние отклики в одном месте",
    description:
      "Отклики из корпоративного портала, intranet-форм и почты попадают в единый список.",
  },
  {
    icon: Workflow,
    title: "Понятный процесс и ответственность",
    description:
      "Настраиваем этапы, статусы и ответственных. Всегда видно: кто смотрит резюме, что уже сделано и что нужно дальше.",
  },
  {
    icon: BellRing,
    title: "Не пропустим ни одного кандидата",
    description:
      "Если отклик долго без ответа — система напомнит и подсветит просрочку. Это защищает HR-бренд и повышает доверие внутри компании.",
  },
];

export function InternalPortals() {
  return (
    <section id="internal-portals" className="py-12 sm:py-16 md:py-20 lg:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center mb-8 sm:mb-12 md:mb-16">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-3 sm:mb-4">
            <Badge variant="secondary" className="text-xs sm:text-sm">
              Для крупных компаний
            </Badge>
            <Badge variant="outline" className="text-xs sm:text-sm">
              Настраиваем под ваши процессы
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
            Внутренние отклики — тоже поток кандидатов
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:mt-4 sm:text-lg md:px-8">
            Автоматизируем рассмотрение резюме, которые приходят из корпоративных ресурсов и внутренних порталов — чтобы
            сотрудники быстро получали ответ, а HR и нанимающие менеджеры работали в одном понятном процессе.
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid gap-4 sm:gap-6 lg:grid-cols-3"
        >
          {pillars.map((p) => (
            <motion.div key={p.title} variants={item}>
              <Card className="h-full border-2 transition-colors hover:border-primary/50">
                <CardHeader className="pb-3 sm:pb-4">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 sm:mb-4 sm:h-12 sm:w-12">
                    <p.icon className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
                  </div>
                  <CardTitle className="text-lg sm:text-xl">{p.title}</CardTitle>
                  <CardDescription className="text-sm sm:text-base leading-relaxed">{p.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0" />
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          variants={item}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="mt-6 sm:mt-8"
        >
          <Card className="overflow-hidden border-2 bg-gradient-to-br from-primary/5 via-background to-background">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-12 sm:w-12">
                    <Clock className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-semibold leading-relaxed">
                      Большой поток кандидатов из разных источников больше не проблема
                    </p>
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      Мы делаем процесс управляемым: сроки по этапам, ответственные, напоминания и прозрачные статусы.
                      Если нужно — ограничиваем доступ и фиксируем историю изменений.
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <span>Согласуем с вашей ИБ и политиками доступа</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button asChild className="h-11 w-full sm:w-auto">
                    <Link href="/request-access">Обсудить интеграцию</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
                    <a href="#enterprise">Посмотреть Enterprise</a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
