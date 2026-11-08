export const EMPLOYMENT_FORM_VALUES = ["tk", "gph", "self-employed", "ip", "other"] as const;

export type EmploymentForm = (typeof EMPLOYMENT_FORM_VALUES)[number];

export const EMPLOYMENT_FORM_LABELS: Record<EmploymentForm, string> = {
  tk: "ТК РФ",
  gph: "ГПХ",
  "self-employed": "Самозанятость",
  ip: "ИП",
  other: "Другое",
};

export const EMPLOYMENT_FORM_OPTIONS = EMPLOYMENT_FORM_VALUES.map((value) => ({
  value,
  label: EMPLOYMENT_FORM_LABELS[value],
}));

const EMPLOYMENT_FORM_ORDER = new Map(EMPLOYMENT_FORM_VALUES.map((value, index) => [value, index]));

export function isEmploymentForm(value: unknown): value is EmploymentForm {
  return typeof value === "string" && EMPLOYMENT_FORM_VALUES.includes(value as EmploymentForm);
}

export function normalizeEmploymentForms(
  values: readonly (EmploymentForm | null | undefined)[] | null | undefined,
): EmploymentForm[] {
  const unique = new Set<EmploymentForm>();

  for (const value of values ?? []) {
    if (isEmploymentForm(value)) unique.add(value);
  }

  return Array.from(unique).sort((left, right) => {
    return (EMPLOYMENT_FORM_ORDER.get(left) ?? 0) - (EMPLOYMENT_FORM_ORDER.get(right) ?? 0);
  });
}

export function mergeEmploymentForms(
  employmentForms: readonly (EmploymentForm | null | undefined)[] | null | undefined,
  employmentForm?: EmploymentForm | null,
): EmploymentForm[] {
  return normalizeEmploymentForms([...(employmentForms ?? []), employmentForm]);
}

export function formatEmploymentForms(
  employmentForms: readonly (EmploymentForm | null | undefined)[] | null | undefined,
  emptyLabel = "Не указано",
): string {
  const normalized = normalizeEmploymentForms(employmentForms);
  if (normalized.length === 0) return emptyLabel;
  return normalized.map((value) => EMPLOYMENT_FORM_LABELS[value]).join(", ");
}
