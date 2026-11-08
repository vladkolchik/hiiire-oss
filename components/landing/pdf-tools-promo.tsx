import Link from "next/link";
import { ArrowRight, FileCheck2, FileText, Layers3, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PDF_TOOLS_URL = "https://pdf.hiiire.com";

const tools = [
  {
    icon: Layers3,
    title: "Собрать документы",
    description: "Объединяйте резюме, анкеты и приложения в один аккуратный PDF.",
  },
  {
    icon: FileText,
    title: "Подготовить файл",
    description: "Разделяйте, поворачивайте, сжимайте и упорядочивайте страницы перед отправкой.",
  },
  {
    icon: FileCheck2,
    title: "Заполнить и подписать",
    description: "Работайте с формами, комментариями и подписью прямо в браузере.",
  },
];

export function PdfToolsPromo() {
  return (
    <section id="pdf-tools" className="border-t bg-muted/30 py-12 sm:py-16 md:py-20 lg:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1fr)] lg:items-center">
          <div className="min-w-0 max-w-2xl">
            <Badge variant="secondary" className="mb-4 text-xs sm:text-sm">
              Бесплатные PDF-инструменты
            </Badge>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
              Работайте с PDF-документами быстрее
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Редактируйте резюме, офферы, анкеты и кадровые PDF-файлы прямо в браузере. Инструмент открыт без аккаунта
              hiiire и не сохраняет документы в CRM.
            </p>

            <div className="mt-8 flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                className="h-auto min-h-11 w-full min-w-0 max-w-full whitespace-normal px-3 py-2 text-center leading-snug sm:h-11 sm:w-auto sm:whitespace-nowrap sm:px-4"
              >
                <a href={PDF_TOOLS_URL} target="_blank" rel="noopener noreferrer">
                  Открыть PDF-инструменты
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-11 w-full min-w-0 max-w-full whitespace-normal px-3 py-2 text-center leading-snug sm:h-11 sm:w-auto sm:whitespace-nowrap sm:px-4"
              >
                <Link href="/pdf-tools">Подробнее</Link>
              </Button>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <div key={tool.title} className="min-w-0 rounded-lg border bg-background p-4 shadow-sm">
                  <div className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="break-words text-sm font-semibold sm:text-base">{tool.title}</h3>
                  <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
                </div>
              );
            })}
            <div className="min-w-0 rounded-lg border border-dashed bg-background p-4">
              <div className="mb-2 flex min-w-0 items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                <span className="break-words">Документы остаются у вас</span>
              </div>
              <p className="break-words text-sm leading-relaxed text-muted-foreground">
                PDF-файлы обрабатываются в браузере и не попадают в базу hiiire.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
