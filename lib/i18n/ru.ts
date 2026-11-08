export type RuPluralForms = [one: string, few: string, many: string];

export function ruPlural(count: number, forms: RuPluralForms): string {
  const normalized = Math.abs(Math.trunc(count));
  const mod100 = normalized % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];

  const mod10 = normalized % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export function formatCountRu(count: number, forms: RuPluralForms): string {
  return `${count} ${ruPlural(count, forms)}`;
}
