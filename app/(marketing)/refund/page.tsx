import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/landing/navigation";
import { Footer } from "@/components/landing/footer";
import { ArrowLeft } from "lucide-react";
import { getLegalOperator, ogrnLabel } from "@/lib/legal/operator";

// Реквизиты читаются из runtime env, поэтому страница не пререндерится на build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Возврат и отказ от услуг — hiiire",
  description:
    "Условия возврата денежных средств и отказа от услуг сервиса hiiire. Порядок действий и контактная информация.",
};

export default function RefundPage() {
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
            <h1>Возврат и отказ от услуг</h1>
            <p className="lead">
              Условия возврата денежных средств и процедура отказа от услуг
              сервиса hiiire регулируются{" "}
              <Link href="/terms" className="underline underline-offset-4">
                Публичной офертой
              </Link>{" "}
              (раздел 8) и действующим законодательством Российской Федерации.
            </p>

            <h2>Право на отказ</h2>
            <p>
              Заказчик вправе отказаться от Договора в одностороннем порядке в
              случаях и порядке, предусмотренных законодательством РФ.
            </p>
            <p>
              Если Заказчик является потребителем (физическое лицо,
              приобретающее услуги для личных нужд), применяется Закон РФ
              &laquo;О защите прав потребителей&raquo;, включая статью 32:
              потребитель вправе отказаться от договора в любое время при условии
              оплаты Исполнителю фактически понесенных расходов.
            </p>
            <p>
              Для отношений, не подпадающих под Закон РФ &laquo;О защите прав
              потребителей&raquo;, применяется статья 782 ГК РФ.
            </p>

            <h2>Отмена подписки</h2>
            <p>
              Заказчик вправе отключить автопродление подписки в любое время до
              даты следующего списания через настройки Сервиса. В этом случае
              доступ сохраняется до окончания уже оплаченного периода.
            </p>

            <h2>Порядок возврата денежных средств</h2>
            <p>При возврате денежных средств учитываются:</p>
            <ul>
              <li>период фактически предоставленного доступа;</li>
              <li>объем фактически использованных AI-кредитов;</li>
              <li>
                фактически понесенные расходы Исполнителя, связанные с
                исполнением Договора.
              </li>
            </ul>
            <p>
              Возврат осуществляется тем же способом оплаты, которым была
              произведена оплата, если иное не согласовано сторонами и не
              противоречит требованиям закона.
            </p>

            <h2>Как подать заявку на возврат</h2>
            <p>
              Для оформления возврата свяжитесь с нами любым удобным способом:
            </p>
            <ul>
              <li>
                E-mail:{" "}
                <a
                  href="mailto:inbox@hiiire.com"
                  className="underline underline-offset-4"
                >
                  inbox@hiiire.com
                </a>
              </li>
              <li>
                Telegram:{" "}
                <a
                  href="https://t.me/vladkolchik"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  @vladkolchik
                </a>
              </li>
            </ul>
            <p>
              В обращении укажите e-mail, на который зарегистрирован аккаунт, и
              причину запроса на возврат.
            </p>

            {operator ? (
              <>
                <h2>Реквизиты</h2>
                <div className="not-prose rounded-lg border p-6 space-y-1 text-sm sm:text-base">
                  <p className="break-words">
                    <strong>Наименование:</strong> {operator.name}
                  </p>
                  <p>
                    <strong>ИНН:</strong> {operator.inn}
                  </p>
                  <p>
                    <strong>{ogrnLabel(operator)}:</strong> {operator.ogrn}
                  </p>
                </div>
              </>
            ) : null}

            <p className="text-sm text-muted-foreground mt-6">
              Полные условия предоставления услуг изложены в{" "}
              <Link href="/terms" className="underline underline-offset-4">
                Публичной оферте
              </Link>
              .
            </p>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
