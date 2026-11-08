import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/landing/navigation";
import { Footer } from "@/components/landing/footer";
import { Mail, MessageCircle, Building2, ArrowLeft } from "lucide-react";
import { getLegalOperator, ogrnLabel } from "@/lib/legal/operator";

// Реквизиты читаются из runtime env, поэтому страница не пререндерится на build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Контакты — hiiire",
  description: "Контактные данные и реквизиты сервиса hiiire. Связаться с командой hiiire.",
};

export default function ContactPage() {
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

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl mb-8">
            Контакты
          </h1>

          <section className="space-y-6 mb-12">
            <h2 className="text-xl font-semibold sm:text-2xl">
              Свяжитесь с нами
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                href="mailto:inbox@hiiire.com"
                className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Электронная почта</p>
                  <p className="text-sm text-muted-foreground">
                    inbox@hiiire.com
                  </p>
                </div>
              </a>
              <a
                href="https://t.me/vladkolchik"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <MessageCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Telegram</p>
                  <p className="text-sm text-muted-foreground">
                    @vladkolchik
                  </p>
                </div>
              </a>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-xl font-semibold sm:text-2xl">
                Реквизиты
              </h2>
            </div>
            <div className="rounded-lg border p-6 space-y-3 text-sm sm:text-base">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                {operator ? (
                  <>
                    <span className="text-muted-foreground">Наименование:</span>
                    <span className="min-w-0 break-words">{operator.name}</span>

                    <span className="text-muted-foreground">ИНН:</span>
                    <span>{operator.inn}</span>

                    <span className="text-muted-foreground">{ogrnLabel(operator)}:</span>
                    <span>{operator.ogrn}</span>

                    {operator.registrationDate ? (
                      <>
                        <span className="text-muted-foreground">
                          Дата регистрации:
                        </span>
                        <span>{operator.registrationDate}</span>
                      </>
                    ) : null}
                  </>
                ) : null}

                <span className="text-muted-foreground">E-mail:</span>
                <span>
                  <a
                    href="mailto:inbox@hiiire.com"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    inbox@hiiire.com
                  </a>
                </span>

                <span className="text-muted-foreground">Сайт:</span>
                <span>
                  <a
                    href="https://hiiire.com"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    https://hiiire.com
                  </a>
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
