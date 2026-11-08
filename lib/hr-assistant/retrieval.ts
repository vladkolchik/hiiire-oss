import "server-only";

import type { CompanyContext } from "@/lib/access/company-guards";
import { formatCandidateStatusLabel } from "@/lib/candidates/status-labels";
import { formatVacancyStatusLabel } from "@/lib/vacancies/status-labels";

import { getAccessibleCandidateForAssistant, listAccessibleCandidatesForAssistant } from "./tools/candidate-read";
import { getAccessibleVacancyForAssistant, listAccessibleVacanciesForAssistant } from "./tools/vacancy-read";

type RetrievedVacancy = {
  href?: string;
  title: string;
  status: string;
  statusLabel?: string;
  location?: string | null;
};

type RetrievedCandidate = {
  href?: string;
  name: string;
  status: string;
  statusLabel?: string;
  vacancyId: string;
  vacancyTitle?: string | null;
  desiredSalaryText?: string | null;
};

function getCandidateStatusLabel(candidate: RetrievedCandidate): string {
  return candidate.statusLabel ?? formatCandidateStatusLabel(candidate.status);
}

function getVacancyStatusLabel(vacancy: RetrievedVacancy): string {
  return vacancy.statusLabel ?? formatVacancyStatusLabel(vacancy.status);
}

function formatHrefFact(href: string | undefined): string {
  return href ? `; ссылка: ${href}` : "";
}

function getCandidateVacancyTitle(candidate: RetrievedCandidate): string {
  return candidate.vacancyTitle?.trim() || "не указана";
}

function formatCandidateDesiredSalaryFact(candidate: RetrievedCandidate): string {
  const desiredSalary = candidate.desiredSalaryText?.trim();
  return desiredSalary ? `; желаемая зарплата: ${desiredSalary}` : "";
}

export async function retrieveHrAssistantContext(
  admin: any,
  ctx: CompanyContext,
  input: { query: string; threadScopeType?: string | null; threadScopeId?: string | null }
) {
  const docs = retrieveProductHelp(input.query);
  const facts: string[] = [];

  if (input.threadScopeType === "vacancy" && input.threadScopeId) {
    const vacancyResult = await getAccessibleVacancyForAssistant(admin, ctx, input.threadScopeId);
    if (vacancyResult.ok) {
      const vacancy = vacancyResult.item as RetrievedVacancy;
      facts.push(`Вакансия: ${vacancy.title}; статус: ${getVacancyStatusLabel(vacancy)}; локация: ${vacancy.location ?? "не указана"}${formatHrefFact(vacancy.href)}.`);
    }
  } else if (input.threadScopeType === "candidate" && input.threadScopeId) {
    const candidateResult = await getAccessibleCandidateForAssistant(admin, ctx, { candidateId: input.threadScopeId });
    if (candidateResult.ok) {
      const candidate = candidateResult.item as RetrievedCandidate;
      facts.push(
        `Кандидат: ${candidate.name}; статус: ${getCandidateStatusLabel(candidate)}; вакансия: ${getCandidateVacancyTitle(candidate)}${formatCandidateDesiredSalaryFact(
          candidate
        )}${formatHrefFact(candidate.href)}.`
      );
    }
  } else {
    const [vacancyList, candidateList] = await Promise.all([
      listAccessibleVacanciesForAssistant(admin, ctx, { limit: 5, includeAggregations: true }),
      listAccessibleCandidatesForAssistant(admin, ctx, { limit: 5, includeAggregations: true }),
    ]);

    if (vacancyList.ok) {
      facts.push(...(vacancyList.items as RetrievedVacancy[]).map((vacancy) => `Вакансия: ${vacancy.title}; статус: ${getVacancyStatusLabel(vacancy)}${formatHrefFact(vacancy.href)}.`));

      const vacancyStatusSummary = Object.entries(vacancyList.aggregations?.statusCounts ?? {})
        .map(([status, count]) => `${formatVacancyStatusLabel(status)}: ${count}`)
        .join(", ");
      if (vacancyStatusSummary) {
        facts.push(`Статусы доступных вакансий: ${vacancyStatusSummary}.`);
      }
    }
    if (candidateList.ok) {
      facts.push(
        ...(candidateList.items as RetrievedCandidate[]).map(
          (candidate) =>
            `Кандидат: ${candidate.name}; статус: ${getCandidateStatusLabel(candidate)}; вакансия: ${getCandidateVacancyTitle(candidate)}${formatCandidateDesiredSalaryFact(
              candidate
            )}${formatHrefFact(candidate.href)}.`
        )
      );
      facts.push(
        `Доступные кандидаты: показано ${candidateList.items.length} из ${candidateList.pageInfo.total ?? "неизвестно"}; есть еще: ${
          candidateList.pageInfo.hasMore ? "да" : "нет"
        }.`
      );

      const statusSummary = Object.entries(candidateList.aggregations?.statusCounts ?? {})
        .map(([status, count]) => `${formatCandidateStatusLabel(status)}: ${count}`)
        .join(", ");
      if (statusSummary) {
        facts.push(`Статусы доступных кандидатов: ${statusSummary}.`);
      }
    }
  }

  return { docs, facts };
}

function retrieveProductHelp(query: string): string[] {
  const normalized = query.toLowerCase();
  const chunks = [
    {
      keys: ["вакан", "создать", "описание"],
      text: "hiiire: вакансии создаются в разделе Вакансии. Описание, требования и обязанности можно подготовить как черновик.",
    },
    {
      keys: ["кандидат", "статус", "отказ"],
      text: "hiiire: карточка кандидата хранит статус, комментарий, резюме и AI-анализ. Изменение статуса через ассистента требует подтверждения.",
    },
    {
      keys: ["интерв", "календар"],
      text: "hiiire: ассистент v1 может читать доступные интервью и готовить план. Создание и перенос встреч пока выполняются через календарный интерфейс.",
    },
    {
      keys: ["hh", "почт", "сообщ"],
      text: "hiiire: внешние отправки и HH-действия пока не выполняются ассистентом. Ассистент может подготовить черновик текста.",
    },
  ];

  return chunks
    .filter((chunk) => chunk.keys.some((key) => normalized.includes(key)))
    .map((chunk) => chunk.text)
    .slice(0, 4);
}
