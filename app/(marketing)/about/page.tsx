import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/landing/navigation";
import { Footer } from "@/components/landing/footer";
import { ArrowLeft } from "lucide-react";
import { getLegalOperator, ogrnLabel } from "@/lib/legal/operator";

// Реквизиты читаются из runtime env, поэтому страница не пререндерится на build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "О нас — hiiire",
  description:
    "hiiire — сервис автоматизации подбора персонала с помощью AI. Интеграция с HH.ru, анализ резюме, умный календарь собеседований.",
};

export default function AboutPage() {
  const operator = getLegalOperator();

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="flex-1 pt-14 sm:pt-16">
        <div className="container mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            На главную
          </Link>

          <article className="prose max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-a:text-foreground prose-code:text-foreground prose-lead:text-foreground">
            <h1>О сервисе hiiire</h1>
            <p className="lead">
              hiiire &mdash; это онлайн-сервис для автоматизации подбора
              персонала с использованием искусственного интеллекта.
            </p>
            <p>
              Мы помогаем рекрутерам и HR-специалистам экономить время на
              рутинных задачах: анализ резюме, скоринг кандидатов, планирование
              собеседований и ведение базы соискателей.
            </p>

            <h2>Что мы делаем</h2>
            <ul>
              <li>
                <strong>AI-анализ резюме</strong> &mdash; автоматическая оценка
                соответствия кандидата требованиям вакансии.
              </li>
              <li>
                <strong>Интеграция с HH.ru</strong> &mdash; импорт откликов и
                резюме напрямую с крупнейшей площадки.
              </li>
              <li>
                <strong>CRM для рекрутинга</strong> &mdash; удобное ведение
                вакансий, кандидатов и этапов подбора.
              </li>
              <li>
                <strong>Внутренние порталы откликов</strong> &mdash; размещайте
                вакансии на собственных страницах и принимайте отклики напрямую.
              </li>
            </ul>

            <h2>{operator ? "Реквизиты" : "Контакты"}</h2>
            <div className="not-prose rounded-lg border p-6 space-y-1 text-sm sm:text-base">
              {operator ? (
                <>
                  <p className="break-words">
                    <strong>Наименование:</strong> {operator.name}
                  </p>
                  <p>
                    <strong>ИНН:</strong> {operator.inn}
                  </p>
                  <p>
                    <strong>{ogrnLabel(operator)}:</strong> {operator.ogrn}
                  </p>
                </>
              ) : null}
              <p>
                <strong>E-mail:</strong>{" "}
                <a
                  href="mailto:inbox@hiiire.com"
                  className="underline underline-offset-4"
                >
                  inbox@hiiire.com
                </a>
              </p>
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
