import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/landing/navigation";
import { Footer } from "@/components/landing/footer";
import { ArrowLeft } from "lucide-react";
import { formatLegalOperatorLine, getLegalOperator } from "@/lib/legal/operator";

// Реквизиты читаются из runtime env, поэтому страница не пререндерится на build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — hiiire",
  description:
    "Политика обработки персональных данных сервиса hiiire. Информация о сборе, хранении и использовании ваших данных.",
};

export default function PrivacyPage() {
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
            <h1>Политика конфиденциальности</h1>
            <p className="lead">
              Политика обработки персональных данных пользователей сервиса
              hiiire.
            </p>
            <p className="text-sm text-muted-foreground">
              Редакция от 19 февраля 2026 года
            </p>

            <h2>1. Общие положения</h2>
            <p>
              Настоящая Политика обработки персональных данных (далее &mdash;
              &laquo;Политика&raquo;) разработана в соответствии с Федеральным
              законом от 27.07.2006 &#8470;&nbsp;152-ФЗ &laquo;О персональных
              данных&raquo; и определяет порядок обработки персональных данных
              пользователей сервиса hiiire (далее &mdash;
              &laquo;Сервис&raquo;).
            </p>
            <p>
              Оператор персональных данных:{" "}
              {operator ? formatLegalOperatorLine(operator) : "владелец Сервиса"}.
            </p>

            <h2>2. Какие данные мы собираем</h2>
            <p>
              При регистрации и использовании Сервиса могут обрабатываться
              следующие категории персональных данных:
            </p>
            <ul>
              <li>ФИО;</li>
              <li>адрес электронной почты;</li>
              <li>номер телефона (при наличии);</li>
              <li>наименование организации и должность;</li>
              <li>
                данные, предоставляемые пользователем при использовании Сервиса
                (вакансии, описания, комментарии);
              </li>
              <li>
                технические данные (IP-адрес, тип браузера, cookies, данные о
                действиях в Сервисе).
              </li>
            </ul>

            <h2>3. Цели обработки</h2>
            <ul>
              <li>предоставление доступа к функционалу Сервиса;</li>
              <li>
                идентификация пользователя и обеспечение безопасности аккаунта;
              </li>
              <li>обработка платежей и выставление чеков;</li>
              <li>техническая поддержка и коммуникация;</li>
              <li>улучшение качества Сервиса и аналитика;</li>
              <li>
                исполнение обязательств по{" "}
                <Link href="/terms" className="underline underline-offset-4">
                  Публичной оферте
                </Link>
                .
              </li>
            </ul>

            <h2>4. Хранение данных</h2>
            <p>
              Основные базы данных с персональными данными пользователей
              размещаются на серверах, расположенных на территории Российской
              Федерации, в соответствии с требованиями Федерального закона
              &#8470;&nbsp;152-ФЗ.
            </p>
            <p>
              Персональные данные хранятся не дольше, чем это необходимо для
              целей их обработки, если иной срок не предусмотрен
              законодательством.
            </p>

            <h2>5. Передача данных третьим лицам</h2>
            <p>
              Персональные данные не передаются третьим лицам, за исключением
              случаев:
            </p>
            <ul>
              <li>
                передача партнерам-эквайерам для обработки платежей;
              </li>
              <li>
                передача хостинг-провайдерам для обеспечения работы Сервиса;
              </li>
              <li>
                случаев, предусмотренных законодательством Российской Федерации.
              </li>
            </ul>
            <p>
              Трансграничная передача персональных данных допускается только при
              наличии законных оснований и при соблюдении требований статьи 12
              Федерального закона &#8470;&nbsp;152-ФЗ.
            </p>

            <h2>6. Права пользователя</h2>
            <p>Пользователь имеет право:</p>
            <ul>
              <li>
                получить информацию об обработке своих персональных данных;
              </li>
              <li>
                требовать уточнения, блокирования или уничтожения данных;
              </li>
              <li>отозвать согласие на обработку персональных данных;</li>
              <li>обратиться в уполномоченный орган по защите прав субъектов
                персональных данных.</li>
            </ul>

            <h2>7. Cookies</h2>
            <p>
              Сервис использует cookies для обеспечения корректной работы,
              авторизации и аналитики. Продолжая использовать Сервис, вы даете
              согласие на использование cookies.
            </p>

            <h2>8. Контактная информация</h2>
            <p>
              По вопросам обработки персональных данных обращайтесь:
            </p>
            <div className="not-prose rounded-lg border p-6 space-y-1 text-sm sm:text-base">
              {operator ? (
                <>
                  <p className="break-words">
                    <strong>Оператор:</strong> {operator.name}
                  </p>
                  <p>
                    <strong>ИНН:</strong> {operator.inn}
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
              <p>
                <strong>Telegram:</strong>{" "}
                <a
                  href="https://t.me/vladkolchik"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  @vladkolchik
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
