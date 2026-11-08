type QueryValue = string | string[] | undefined;

type ParsePageParamOptions = {
  defaultValue?: number;
  min?: number;
  max?: number;
};

function toFirst(value: QueryValue): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : null;
  }
  return typeof value === "string" ? value : null;
}

export function parsePageParam(value: QueryValue, options?: ParsePageParamOptions): number {
  const defaultValue = options?.defaultValue ?? 1;
  const min = options?.min ?? 1;
  const max = options?.max ?? 10_000;

  const raw = toFirst(value);
  if (!raw) return defaultValue;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return defaultValue;

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function normalizeSearch(value: QueryValue, maxLen = 120): string {
  const raw = toFirst(value);
  if (!raw) return "";
  return raw.trim().slice(0, Math.max(1, maxLen));
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.trunc(pageSize)) : 1;
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  return { from, to };
}

export function getTotalPages(total: number, pageSize: number): number {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.trunc(pageSize)) : 1;
  return Math.max(1, Math.ceil(safeTotal / safePageSize));
}

