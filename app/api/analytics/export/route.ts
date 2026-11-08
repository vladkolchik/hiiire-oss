import { NextResponse, type NextRequest } from "next/server";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import {
  buildAnalyticsCsvDataset,
  listAvailableCsvDatasets,
  type AnalyticsCsvResult,
} from "@/lib/analytics/csv";
import {
  isAnalyticsPeriodOrderValid,
  normalizeAnalyticsFilters,
} from "@/lib/analytics/filters";
import type { AnalyticsCsvDataset, AnalyticsDashboard, AnalyticsFilters } from "@/lib/analytics/types";
import { buildAnalyticsXlsxBuffer } from "@/lib/analytics/xlsx";
import { requireCompanyContext, type CompanyContext } from "@/lib/access/company-guards";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadAnalyticsDashboard } from "@/lib/analytics/server";

export const runtime = "nodejs";

type ExportFormat = "xlsx" | "csv";
type ApiIssue = { path: Array<string | number>; message: string };

type AuditInput = {
  admin: unknown;
  ctx: CompanyContext;
  reportType: string;
  format: ExportFormat;
  filters: AnalyticsFilters;
  sheets: string[];
  rowCounts: Record<string, number>;
};

const FORMAT_HINT = "format=xlsx|csv";
const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
const ADMIN_ONLY_CSV_DATASETS = new Set<AnalyticsCsvDataset>(["recruiters", "ai-audit"]);
const CSV_DATASETS = new Set<AnalyticsCsvDataset>([
  "candidates",
  "pipeline-events",
  "rejection-reasons",
  "sources",
  "ai-scores",
  "sla-breaches",
  "recruiters",
  "ai-audit",
]);

function jsonError(error: string, status: number, message: string, issues: ApiIssue[] = []) {
  return NextResponse.json({ error, message, issues }, { status });
}

function validateFormat(value: string | null): ExportFormat | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "xlsx" || normalized === "csv" ? normalized : null;
}

function validateCsvDataset(value: string | null): AnalyticsCsvDataset | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && CSV_DATASETS.has(normalized as AnalyticsCsvDataset)
    ? (normalized as AnalyticsCsvDataset)
    : null;
}

function filenameFor(format: ExportFormat, generatedAt: string, dataset?: AnalyticsCsvDataset) {
  const date = generatedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const subject = dataset ? `analytics-${dataset}` : "analytics-dashboard";
  return `hiiire-${subject}-${date}.${format}`;
}

function downloadHeaders(contentType: string, filename: string) {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
}

function xlsxSheetsAndRowCounts(dashboard: AnalyticsDashboard) {
  const rows = [
    ["Summary", 1],
    ["Vacancies", dashboard.vacancies.length],
    ["Candidates", dashboard.exportRows.candidates.length],
    ["Pipeline events", dashboard.exportRows.pipelineEvents.length],
    ["Rejection reasons", dashboard.exportRows.rejectionReasons.length],
  ] as Array<[string, number]>;

  if (dashboard.exportRows.slaBreaches.length > 0) {
    rows.push(["SLA breaches", dashboard.exportRows.slaBreaches.length]);
  }

  rows.push(["Sources", dashboard.sources.length]);

  if (dashboard.role === "admin") {
    rows.push(["Recruiters", dashboard.team.length]);
  }

  rows.push(["AI scores", dashboard.exportRows.aiScores.length]);

  if (dashboard.role === "admin") {
    rows.push(["AI audit", dashboard.exportRows.aiAudit.length]);
  }

  return {
    sheets: rows.map(([name]) => name),
    rowCounts: Object.fromEntries(rows),
  };
}

function csvSheetsAndRowCounts(result: AnalyticsCsvResult) {
  return {
    sheets: [result.dataset],
    rowCounts: { [result.dataset]: result.rowCount },
  };
}

async function insertExportAudit({ admin, ctx, reportType, format, filters, sheets, rowCounts }: AuditInput) {
  const { error } = await (admin as any).from("analytics_export_events").insert({
    company_id: ctx.companyId,
    user_id: ctx.userId,
    role: ctx.role,
    report_type: reportType,
    format,
    filters,
    sheets,
    row_counts: rowCounts,
  });

  if (error) throw new Error("EXPORT_AUDIT_FAILED");
}

async function captureExportEvent(input: {
  event: "analytics_export_requested" | "analytics_export_completed" | "analytics_export_failed";
  ctx: CompanyContext;
  format: ExportFormat;
  reportType: string;
  failed?: boolean;
}) {
  await captureBusinessEvent({
    event: input.event,
    userId: input.ctx.userId,
    companyId: input.ctx.companyId,
    role: input.ctx.role,
    properties: {
      mode: input.format,
      source: input.reportType,
      failed: input.failed ?? false,
    },
  });
}

function companyContextError(status: number) {
  if (status === 401) {
    return jsonError("UNAUTHORIZED", 401, "Войдите в аккаунт, чтобы выгрузить аналитику.");
  }
  return jsonError("FORBIDDEN", status, "Выгрузка недоступна для текущего аккаунта.");
}

export async function GET(req: NextRequest) {
  let eventContext: { ctx: CompanyContext; format: ExportFormat; reportType: string } | null = null;

  try {
    const searchParams = req.nextUrl.searchParams;
    const format = validateFormat(searchParams.get("format"));
    if (!format) {
      return jsonError("INVALID_QUERY", 400, `Выберите формат выгрузки: ${FORMAT_HINT}.`, [
        { path: ["format"], message: "Выберите формат выгрузки: XLSX или CSV." },
      ]);
    }

    const dataset =
      format === "csv" ? validateCsvDataset(searchParams.get("dataset")) : null;
    if (format === "csv" && !dataset) {
      return jsonError("INVALID_QUERY", 400, "Выберите CSV-датасет для выгрузки.", [
        { path: ["dataset"], message: "Выберите CSV-датасет из списка." },
      ]);
    }

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxResult = await requireCompanyContext(supabase);
    if (!ctxResult.ok) return companyContextError(ctxResult.response.status);
    const ctx = ctxResult.data;

    if (dataset && ADMIN_ONLY_CSV_DATASETS.has(dataset) && ctx.role !== "admin") {
      return jsonError("FORBIDDEN", 403, "Этот датасет доступен только администратору.");
    }

    const filters = normalizeAnalyticsFilters(searchParams, { role: ctx.role });
    if (!isAnalyticsPeriodOrderValid(filters.periodStart, filters.periodEnd)) {
      return jsonError("INVALID_FILTERS", 400, "Проверьте период: дата начала должна быть раньше даты окончания.");
    }

    const reportType = dataset ? `analytics_${dataset}` : "analytics_dashboard";
    eventContext = { ctx, format, reportType };

    await captureExportEvent({ event: "analytics_export_requested", ctx, format, reportType });

    const dashboard = await loadAnalyticsDashboard({
      supabase,
      admin,
      ctx,
      filters,
      output: "raw",
    });

    if (format === "xlsx") {
      const { sheets, rowCounts } = xlsxSheetsAndRowCounts(dashboard);
      const buffer = await buildAnalyticsXlsxBuffer(dashboard);
      await insertExportAudit({ admin, ctx, reportType, format, filters, sheets, rowCounts });
      await captureExportEvent({ event: "analytics_export_completed", ctx, format, reportType });

      const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      return new Response(body, {
        status: 200,
        headers: downloadHeaders(XLSX_CONTENT_TYPE, filenameFor(format, dashboard.generatedAt)),
      });
    }

    const csvDataset = dataset as AnalyticsCsvDataset;
    const availableDatasets = listAvailableCsvDatasets(dashboard);
    if (!availableDatasets.includes(csvDataset)) {
      return jsonError("INVALID_QUERY", 400, "Этот CSV-датасет недоступен для выбранных фильтров.", [
        { path: ["dataset"], message: "Выберите доступный датасет." },
      ]);
    }

    const csv = buildAnalyticsCsvDataset(dashboard, csvDataset);
    const { sheets, rowCounts } = csvSheetsAndRowCounts(csv);
    await insertExportAudit({ admin, ctx, reportType, format, filters, sheets, rowCounts });
    await captureExportEvent({ event: "analytics_export_completed", ctx, format, reportType });

    return new Response(csv.csv, {
      status: 200,
      headers: downloadHeaders(CSV_CONTENT_TYPE, filenameFor(format, dashboard.generatedAt, csvDataset)),
    });
  } catch {
    if (eventContext) {
      await captureExportEvent({
        event: "analytics_export_failed",
        ctx: eventContext.ctx,
        format: eventContext.format,
        reportType: eventContext.reportType,
        failed: true,
      });
    }

    return jsonError("INTERNAL_ERROR", 500, "Не удалось подготовить выгрузку. Попробуйте ещё раз.");
  }
}
