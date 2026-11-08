/**
 * Реквизиты оператора сервиса (ИП / юрлицо), которые показываются на публичных
 * юридических страницах: оферта, политика конфиденциальности, возвраты, контакты.
 *
 * Значения не хранятся в репозитории и задаются через server-side env:
 *   LEGAL_OPERATOR_NAME              — например «ИП Иванов Иван Иванович»
 *   LEGAL_OPERATOR_INN               — ИНН
 *   LEGAL_OPERATOR_OGRN              — ОГРН / ОГРНИП
 *   LEGAL_OPERATOR_REGISTRATION_DATE — дата регистрации (необязательно)
 *
 * Страницы, которые используют эти данные, должны рендериться динамически
 * (`export const dynamic = "force-dynamic"`), иначе значения запекутся на этапе
 * `next build`, где runtime env обычно недоступен (см. Dockerfile.web).
 */

export type LegalOperator = {
  name: string;
  inn: string;
  ogrn: string;
  registrationDate: string | null;
};

const REQUIRED_ENV = ["LEGAL_OPERATOR_NAME", "LEGAL_OPERATOR_INN", "LEGAL_OPERATOR_OGRN"] as const;

let missingWarningLogged = false;

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getLegalOperator(): LegalOperator | null {
  const name = readEnv("LEGAL_OPERATOR_NAME");
  const inn = readEnv("LEGAL_OPERATOR_INN");
  const ogrn = readEnv("LEGAL_OPERATOR_OGRN");

  if (!name || !inn || !ogrn) {
    if (process.env.NODE_ENV === "production" && !missingWarningLogged) {
      missingWarningLogged = true;
      const missing = REQUIRED_ENV.filter((key) => !readEnv(key));
      console.error(
        `[legal] Operator requisites are not configured (${missing.join(", ")}); legal pages render without them.`,
      );
    }
    return null;
  }

  return {
    name,
    inn,
    ogrn,
    registrationDate: readEnv("LEGAL_OPERATOR_REGISTRATION_DATE"),
  };
}

/** «<наименование>, ИНН <ИНН>, ОГРНИП <ОГРНИП>» */
export function formatLegalOperatorLine(operator: LegalOperator): string {
  return `${operator.name}, ИНН ${operator.inn}, ${ogrnLabel(operator)} ${operator.ogrn}`;
}

/** ОГРНИП у ИП — 15 цифр, ОГРН у юрлица — 13. */
export function ogrnLabel(operator: LegalOperator): "ОГРН" | "ОГРНИП" {
  return operator.ogrn.replace(/\D/g, "").length === 15 ? "ОГРНИП" : "ОГРН";
}
