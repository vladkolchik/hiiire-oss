import type { CompanyContext } from "@/lib/access/company-guards";

export type HrAssistantToolErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid_input"
  | "not_supported"
  | "rate_limited"
  | "temporary_failure"
  | "internal_error";

export type HrAssistantToolScopeType = "workspace" | "vacancy" | "candidate" | "interview" | "support";

export type HrAssistantToolScope = {
  workspaceId: string;
  role: CompanyContext["role"];
  ownerRestricted: boolean;
  scopeType: HrAssistantToolScopeType;
  scopeId: string | null;
};

export type HrAssistantPageInfo = {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  total: number | null;
  totalExact: boolean;
  scannedCount?: number;
};

export type HrAssistantToolSort = {
  key: string;
  direction: "asc" | "desc";
};

export type HrAssistantToolFilterLabels = Record<string, unknown>;

export type HrAssistantToolListSuccess<TItem, TAggregations = Record<string, never>> = {
  ok: true;
  toolRunId: string;
  items: TItem[];
  pageInfo: HrAssistantPageInfo;
  appliedFilters: Record<string, unknown>;
  appliedFilterLabels?: HrAssistantToolFilterLabels;
  availableFilters?: Record<string, unknown>;
  availableFilterLabels?: HrAssistantToolFilterLabels;
  sort?: HrAssistantToolSort;
  sortLabel?: string;
  scope: HrAssistantToolScope;
  scopeLabel?: string;
  aggregations?: TAggregations;
};

export type HrAssistantToolItemSuccess<TItem> = {
  ok: true;
  toolRunId: string;
  item: TItem;
  appliedFilters: Record<string, unknown>;
  appliedFilterLabels?: HrAssistantToolFilterLabels;
  scope: HrAssistantToolScope;
  scopeLabel?: string;
};

export type HrAssistantToolListSuccessInput<TItem, TAggregations = Record<string, never>> = Omit<
  HrAssistantToolListSuccess<TItem, TAggregations>,
  "ok"
>;

export type HrAssistantToolItemSuccessInput<TItem> = Omit<HrAssistantToolItemSuccess<TItem>, "ok">;

export type HrAssistantToolFailure = {
  ok: false;
  toolRunId?: string;
  error: {
    code: HrAssistantToolErrorCode;
    message: string;
    retryable: boolean;
  };
};

export type HrAssistantCursorPayload = {
  entity: "candidates" | "vacancies" | "interviews";
  filtersHash: string;
  sort: HrAssistantToolSort;
  last: Record<string, string | number | null>;
};

export function toHrAssistantScope(
  ctx: CompanyContext,
  input: { scopeType: HrAssistantToolScopeType; scopeId?: string | null }
): HrAssistantToolScope {
  return {
    workspaceId: ctx.companyId,
    role: ctx.role,
    ownerRestricted: ctx.role !== "admin",
    scopeType: input.scopeType,
    scopeId: input.scopeId ?? null,
  };
}

export function toolListSuccess<TItem, TAggregations = Record<string, never>>(
  input: HrAssistantToolListSuccessInput<TItem, TAggregations>
): HrAssistantToolListSuccess<TItem, TAggregations> {
  return { ok: true, ...input };
}

export function toolItemSuccess<TItem>(input: HrAssistantToolItemSuccessInput<TItem>): HrAssistantToolItemSuccess<TItem> {
  return { ok: true, ...input };
}

export function toolFailure(
  code: HrAssistantToolErrorCode,
  message: string,
  retryable: boolean,
  toolRunId?: string
): HrAssistantToolFailure {
  return {
    ok: false,
    ...(toolRunId ? { toolRunId } : {}),
    error: { code, message, retryable },
  };
}

export function clampToolLimit(value: number | undefined, bounds: { defaultLimit: number; maxLimit: number }): number {
  if (!Number.isFinite(value)) return bounds.defaultLimit;
  return Math.min(bounds.maxLimit, Math.max(1, Math.trunc(value ?? bounds.defaultLimit)));
}

export function stableJson(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function filtersHash(filters: Record<string, unknown>, sort: HrAssistantToolSort): string {
  return stableJson({ filters, sort });
}

export function createCursor(payload: HrAssistantCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): HrAssistantCursorPayload {
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as HrAssistantCursorPayload;
  if (!parsed || typeof parsed !== "object" || !parsed.entity || !parsed.filtersHash || !parsed.sort || !parsed.last) {
    throw new Error("INVALID_CURSOR");
  }
  return parsed;
}
