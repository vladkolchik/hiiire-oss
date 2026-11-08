"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Users, Calendar } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export function Hero() {
  return (
    <section className="relative pt-24 pb-12 sm:pt-32 sm:pb-16 md:pt-40 md:pb-20 lg:pb-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm mb-4 sm:mb-6">
              <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Умный подбор персонала с AI</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
          >
            Находите идеальных кандидатов{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              в 10 раз быстрее
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-4 text-base text-muted-foreground sm:mt-6 sm:text-lg md:text-xl lg:px-12"
          >
            Автоматизируйте подбор персонала с помощью AI. Интеграция с HH.ru,
            анализ резюме, умный календарь собеседований - всё в одном месте.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex flex-col items-center gap-3 sm:mt-10"
          >
            <Button size="lg" asChild className="gap-2 h-12 px-8 text-base">
              <Link href="/signup">
                Попробовать бесплатно — 7 дней
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              Без привязки карты · 50 AI-запросов включено
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-12 grid grid-cols-1 gap-6 sm:mt-16 sm:grid-cols-3 sm:gap-8"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 sm:h-14 sm:w-14">
                <Users className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
              </div>
              <div className="text-2xl font-bold sm:text-3xl">100+</div>
              <div className="text-xs text-muted-foreground sm:text-sm">Компаний используют</div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 sm:h-14 sm:w-14">
                <Sparkles className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
              </div>
              <div className="text-2xl font-bold sm:text-3xl">10K+</div>
              <div className="text-xs text-muted-foreground sm:text-sm">Кандидатов проанализировано</div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 sm:h-14 sm:w-14">
                <Calendar className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
              </div>
              <div className="text-2xl font-bold sm:text-3xl">5K+</div>
              <div className="text-xs text-muted-foreground sm:text-sm">Собеседований проведено</div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

