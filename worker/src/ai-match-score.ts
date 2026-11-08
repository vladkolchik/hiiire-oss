import type { AiAnalysis } from "./ai-analysis";
import type { CandidateDesiredSalaryForAi, VacancySalaryForAi } from "./ai-prompt";

type EducationMatchMetadata = {
  includedInMatch?: boolean;
  criterionState?: "required" | "optional" | "not_required";
  criterionEvidence?: string[];
};

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const SUPPORTED_SALARY_CURRENCIES = new Set(["RUB", "USD", "EUR", "KZT"]);
const WORD_START = String.raw`(?<![\p{L}\p{N}])`;
const WORD_END = String.raw`(?![\p{L}\p{N}])`;
const ENGLISH_NON_MONTHLY_PERIOD_PATTERN = new RegExp(
  `${WORD_START}(?:hour|hours|hourly|shift|shifts|day|days|daily|week|weeks|weekly|year|years|yearly|annual|annually)${WORD_END}`,
  "iu"
);
const RUSSIAN_PERIOD_PREPOSITION = String.raw`(?:в|за|на|по)`;
const RUSSIAN_PERIOD_NOUN = String.raw`(?:час(?:а|ов|у|ом|е)?|д(?:ень|ня|ню|нем|нём|не)|недел(?:я|и|ю|ей|е|ям|ями|ях)|год(?:а|ов|у|ом|е)?|смен(?:а|ы|у|ой|е|ам|ами|ах)?)`;
const RUSSIAN_NON_MONTHLY_PERIOD_PATTERN = new RegExp(
  `${WORD_START}(?:(?:${RUSSIAN_PERIOD_PREPOSITION})\\s+${RUSSIAN_PERIOD_NOUN}|час(?:овая|овой|овую|овое|овые|овых|овым|овыми)|дневн(?:ая|ой|ую|ое|ые|ых|ым|ыми)|недел(?:я|и|ю|ей|е|ям|ями|ях)|недельн(?:ая|ой|ую|ое|ые|ых|ым|ыми)|год(?:овая|овой|овую|овое|овые|овых|овым|овыми)|смен(?:ная|ной|ную|ное|ные|ных|ным|ными))${WORD_END}`,
  "iu"
);

export type SalaryMatchAdjustmentComparison =
  | { comparable: false; mismatch: false; reason: string }
  | { comparable: true; mismatch: boolean; candidateAmount: number; vacancyMax: number; currency: string };

export function computeMatchPercentage(analysis: AiAnalysis): number {
  const weights = {
    skills: 0.35,
    experience: 0.35,
    education: 0.1,
    achievements: 0.1,
    cultural_fit: 0.1,
  } as const;

  const education = analysis.categories.education as typeof analysis.categories.education & EducationMatchMetadata;
  const hasEducationEvidence =
    Array.isArray(education.criterionEvidence) && education.criterionEvidence.some((item) => item.trim().length > 0);
  const includeEducation =
    education.criterionState === "required" && education.includedInMatch === true && hasEducationEvidence;

  const entries = [
    [weights.skills, analysis.categories.skills.score],
    [weights.experience, analysis.categories.experience.score],
    ...(includeEducation ? ([[weights.education, analysis.categories.education.score]] as const) : []),
    [weights.achievements, analysis.categories.achievements.score],
    [weights.cultural_fit, analysis.categories.cultural_fit.score],
  ] as const;

  const totalWeight = entries.reduce((sum, [weight]) => sum + weight, 0);
  const weightedScore = entries.reduce((sum, [weight, score]) => sum + weight * score, 0);
  const raw = weightedScore / totalWeight;

  return clampInt(Math.round(raw), 0, 100);
}

export function compareSalaryForMatchAdjustment(
  candidateDesiredSalary?: CandidateDesiredSalaryForAi,
  vacancySalary?: VacancySalaryForAi
): SalaryMatchAdjustmentComparison {
  const candidateAmount = candidateDesiredSalary?.amount;
  const vacancyMax = vacancySalary?.max;
  if (!isPositiveFiniteNumber(candidateAmount) || !isPositiveFiniteNumber(vacancyMax)) {
    return { comparable: false, mismatch: false, reason: "missing_amount_or_max" };
  }

  const candidateCurrency = normalizeSalaryCurrency(candidateDesiredSalary?.currency);
  const vacancyCurrency = normalizeSalaryCurrency(vacancySalary?.currency);
  if (!candidateCurrency || !vacancyCurrency) {
    return { comparable: false, mismatch: false, reason: "missing_or_unsupported_currency" };
  }
  if (candidateCurrency !== vacancyCurrency) {
    return { comparable: false, mismatch: false, reason: "different_currency" };
  }

  if (vacancySalary?.period !== "month") {
    return { comparable: false, mismatch: false, reason: "vacancy_period_not_month" };
  }
  if (candidateTextHasNonMonthlyPeriod(candidateDesiredSalary?.text)) {
    return { comparable: false, mismatch: false, reason: "candidate_period_incomparable" };
  }

  const vacancyTax = normalizeSalaryTax(vacancySalary?.tax);
  if (!vacancyTax) {
    return { comparable: false, mismatch: false, reason: "missing_vacancy_tax" };
  }

  const candidateTax = detectCandidateSalaryTax(candidateDesiredSalary?.text);
  if (candidateTax !== vacancyTax) {
    return { comparable: false, mismatch: false, reason: "candidate_tax_missing_or_different" };
  }

  return {
    comparable: true,
    mismatch: candidateAmount > vacancyMax,
    candidateAmount,
    vacancyMax,
    currency: candidateCurrency,
  };
}

export function adjustMatchPercentageForSalary(
  baseMatchPercentage: number,
  candidateDesiredSalary?: CandidateDesiredSalaryForAi,
  vacancySalary?: VacancySalaryForAi
): number {
  const base = clampInt(Math.round(baseMatchPercentage), 0, 100);
  const comparison = compareSalaryForMatchAdjustment(candidateDesiredSalary, vacancySalary);

  if (!comparison.comparable || !comparison.mismatch) return base;

  return clampInt(Math.min(base - 15, 70), 0, 100);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeSalaryCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return SUPPORTED_SALARY_CURRENCIES.has(currency) ? currency : null;
}

function normalizeSalaryTax(value: unknown): "gross" | "net" | null {
  return value === "gross" || value === "net" ? value : null;
}

function detectCandidateSalaryTax(text: string | null | undefined): "gross" | "net" | null {
  if (!text) return null;
  const normalized = text.toLowerCase();
  const hasGross = /\bgross\b|гросс|до\s+вычета|без\s+вычета|до\s+налог|без\s+ндфл/.test(normalized);
  const hasNet = /\bnet\b|на\s+руки|чистыми|после\s+вычета|за\s+вычетом|после\s+налог/.test(normalized);

  if (hasGross === hasNet) return null;
  return hasGross ? "gross" : "net";
}

function candidateTextHasNonMonthlyPeriod(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();

  return ENGLISH_NON_MONTHLY_PERIOD_PATTERN.test(normalized) || RUSSIAN_NON_MONTHLY_PERIOD_PATTERN.test(normalized);
}
