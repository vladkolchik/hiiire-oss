import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileText,
  Images,
  Layers3,
  LockKeyhole,
  Scissors,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Footer } from "@/components/landing/footer";
import { Navigation } from "@/components/landing/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCanonicalUrl } from "@/lib/content/seo";

const PDF_TOOLS_URL = "https://pdf.hiiire.com";

export const metadata: Metadata = {
  title: "PDF-инструменты для HR — редактировать, объединять и сжимать PDF | hiiire",
  description:
    "Бесплатные PDF-инструменты для HR: объединяйте резюме, сжимайте файлы, заполняйте формы, подписывайте и готовьте документы прямо в браузере.",
  alternates: {
    canonical: getCanonicalUrl("/pdf-tools"),
  },
  openGraph: {
    title: "PDF-инструменты для HR",
    description:
      "Редактируйте резюме, офферы, анкеты и кадровые PDF-файлы прямо в браузере. Без аккаунта hiiire.",
    url: getCanonicalUrl("/pdf-tools"),
    siteName: "hiiire",
    type: "website",
  },
};

const useCases = [
  "Собрать резюме, портфолио и сопроводительные файлы в один документ.",
  "Подготовить оффер или анкету кандидата перед отправкой.",
  "Сжать тяжелый PDF для email, мессенджера или внутреннего согласования.",
  "Разделить большой документ и оставить только нужные страницы.",
  "Добавить подпись, комментарий или отметку перед передачей файла дальше.",
];

const capabilities = [
  { icon: Layers3, title: "Объединить PDF", description: "Соберите несколько файлов в один документ для согласования." },
  { icon: Scissors, title: "Разделить страницы", description: "Оставьте только нужные страницы резюме, анкеты или оффера." },
  { icon: FileText, title: "Редактировать и комментировать", description: "Добавляйте пометки, текст, выделения и простые правки." },
  { icon: FileCheck2, title: "Заполнить и подписать", description: "Заполняйте формы и добавляйте подпись без установки программ." },
  { icon: Sparkles, title: "Сжать файл", description: "Уменьшайте размер PDF перед отправкой кандидату или команде." },
  { icon: Images, title: "Конвертировать форматы", description: "Преобразуйте изображения и поддерживаемые документы в PDF, если это доступно в редакторе." },
  { icon: LockKeyhole, title: "Защитить данные", description: "Используйте доступные инструменты удаления и защиты чувствительной информации." },
];

const faq = [
  {
    question: "Это бесплатно?",
    answer: "Да. PDF-инструменты доступны бесплатно и открываются без тарифа hiiire.",
  },
  {
    question: "Файлы загружаются в hiiire?",
    answer: "Нет. Инструмент работает в браузере и не сохраняет PDF-файлы в CRM hiiire.",
  },
  {
    question: "Нужен аккаунт hiiire?",
    answer: "Нет. Страница и PDF-инструменты открыты без входа в аккаунт.",
  },
  {
    question: "Можно использовать для резюме, офферов и HR-форм?",
    answer: "Да. Инструмент подходит для резюме, анкет, офферов, портфолио и других документов подбора.",
  },
  {
    question: "Где открывается редактор?",
    answer: "Редактор открывается на отдельном поддомене hiiire: pdf.hiiire.com.",
  },
];

export default function PdfToolsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="flex-1 pt-14 sm:pt-16">
        <section className="border-b bg-muted/30 py-12 sm:py-16 md:py-20 lg:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <Badge variant="secondary" className="mb-4 text-xs sm:text-sm">
                Бесплатный инструмент для документов
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
                PDF-инструменты для HR
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Редактируйте, объединяйте, разделяйте, сжимайте и подписывайте PDF-документы для подбора персонала.
                Резюме, офферы, анкеты и кадровые документы можно подготовить прямо в браузере.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild className="h-11 w-full sm:w-auto">
                  <a href={PDF_TOOLS_URL} target="_blank" rel="noopener noreferrer">
                    Открыть PDF-инструменты
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
                  <Link href="/#pricing">Посмотреть hiiire</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 md:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:items-start">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Для ежедневных HR-документов</h2>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                  PDF часто появляется между кандидатом, рекрутером, руководителем и бухгалтерией. hiiire даёт быстрый
                  инструмент для таких файлов без лишних шагов.
                </p>
              </div>
              <ul className="grid min-w-0 gap-3">
                {useCases.map((useCase) => (
                  <li key={useCase} className="flex min-w-0 items-start gap-3 rounded-lg border bg-background p-4">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span className="break-words text-sm leading-relaxed sm:text-base">{useCase}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="bg-muted/30 py-12 sm:py-16 md:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Что можно делать с PDF</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Набор инструментов закрывает частые задачи: от подготовки резюме до финального файла для согласования.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="min-w-0 rounded-lg border bg-background p-5 shadow-sm">
                    <div className="mb-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="break-words text-base font-semibold">{item.title}</h3>
                    <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 md:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 rounded-lg border bg-background p-6 sm:p-8 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">Файлы не сохраняются в hiiire</h2>
                <p className="mt-3 max-w-3xl break-words text-base leading-relaxed text-muted-foreground">
                  PDF-инструменты работают отдельно от CRM. hiiire не добавляет ваши документы в базу кандидатов, историю
                  вакансий или внутренние файлы компании.
                </p>
              </div>
              <Button asChild className="h-11 w-full lg:w-auto">
                <a href={PDF_TOOLS_URL} target="_blank" rel="noopener noreferrer">
                  Перейти к инструментам
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-muted/30 py-12 sm:py-16 md:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Вопросы и ответы</h2>
              <div className="mt-6 divide-y rounded-lg border bg-background">
                {faq.map((item) => (
                  <div key={item.question} className="p-5">
                    <h3 className="break-words text-base font-semibold">{item.question}</h3>
                    <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
