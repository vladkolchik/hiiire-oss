"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Cable, Calendar, FileText } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    icon: Cable,
    title: "Интеграция с HH.ru",
    description: "Автоматический импорт откликов и резюме прямо из вашего аккаунта HH.ru. Экономьте часы ручной работы.",
  },
  {
    icon: Brain,
    title: "AI анализ резюме",
    description: "Искусственный интеллект оценивает кандидатов по 100-балльной шкале, выделяя сильные и слабые стороны.",
  },
  {
    icon: Calendar,
    title: "Умный календарь",
    description: "Планируйте собеседования в удобном календаре с автоматическими напоминаниями и интеграцией с Google Calendar.",
  },
  {
    icon: FileText,
    title: "Советы по вакансиям",
    description: "AI анализирует ваши вакансии и предлагает улучшения для привлечения большего количества качественных кандидатов.",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function Features() {
  return (
    <section id="features" className="py-12 sm:py-16 md:py-20 lg:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center mb-8 sm:mb-12 md:mb-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
            Всё необходимое для эффективного рекрутинга
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:mt-4 sm:text-lg md:px-8">
            Мощные инструменты для автоматизации подбора персонала
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {features.map((feature, index) => (
            <motion.div key={index} variants={item}>
              <Card className="h-full border-2 transition-colors hover:border-primary/50">
                <CardHeader className="pb-3 sm:pb-4">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 sm:mb-4 sm:h-12 sm:w-12">
                    <feature.icon className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
                  </div>
                  <CardTitle className="text-lg sm:text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm sm:text-base leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

