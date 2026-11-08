import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { AiQueueCharts, MetricsCharts, type DailyPoint, type HourlyQueuePoint } from "../../metrics/charts";

type QueueSnapshot = {
  queued: number;
  processing: number;
  done_24h: number;
  failed_24h: number;
  stuck_processing: number;
  oldest_queued_age_seconds: number;
  alive_workers: number;
  total_concurrency: number;
  avg_process_seconds: number;
  est_drain_minutes: number | null;
  p50_queue_wait_seconds: number | null;
  p95_queue_wait_seconds: number | null;
  p50_process_seconds: number | null;
  p95_process_seconds: number | null;
};

type QueueWorkerRow = {
  worker_id: string;
  last_seen_at: string;
  concurrency: number;
  provider: string | null;
  version: string | null;
  active_jobs: number;
};

function fmtSeconds(s: number | null | undefined) {
  if (!s || !Number.isFinite(s) || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}с`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}м`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}ч ${mm}м`;
}

function fmtAgeSeconds(s: number | null | undefined) {
  if (!s || !Number.isFinite(s) || s <= 0) return "—";
  return fmtSeconds(s);
}

function dayKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function lastNDays(n: number) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  return { start, end };
}

export default async function AdminMetricsPage() {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return null;

  const supabaseAdmin = getSupabaseAdminClient();

  const { start } = lastNDays(30);
  const startIso = start.toISOString();

  const [profilesRes, analysesRes, candidatesRes, vacanciesRes, balancesRes, queueRes] = await Promise.all([
    supabaseAdmin.from("profiles").select("created_at").gte("created_at", startIso),
    supabaseAdmin.from("ai_analyses").select("analyzed_at").gte("analyzed_at", startIso),
    supabaseAdmin.from("candidates").select("created_at").gte("created_at", startIso),
    supabaseAdmin.from("vacancies").select("created_at").gte("created_at", startIso),
    supabaseAdmin.from("company_credits").select("balance"),
    supabaseAdmin.rpc("get_ai_queue_metrics", { p_hours: 168 }),
  ]);

  const dataByDay = new Map<string, DailyPoint>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    dataByDay.set(key, { day: key, signups: 0, analyses: 0, candidates: 0, vacancies: 0 });
  }

  for (const row of profilesRes.data ?? []) {
    const k = dayKey(new Date((row as { created_at: string }).created_at));
    const v = dataByDay.get(k);
    if (v) v.signups += 1;
  }
  for (const row of analysesRes.data ?? []) {
    const k = dayKey(new Date((row as { analyzed_at: string }).analyzed_at));
    const v = dataByDay.get(k);
    if (v) v.analyses += 1;
  }
  for (const row of candidatesRes.data ?? []) {
    const k = dayKey(new Date((row as { created_at: string }).created_at));
    const v = dataByDay.get(k);
    if (v) v.candidates += 1;
  }
  for (const row of vacanciesRes.data ?? []) {
    const k = dayKey(new Date((row as { created_at: string }).created_at));
    const v = dataByDay.get(k);
    if (v) v.vacancies += 1;
  }

  const series = Array.from(dataByDay.values()).sort((a, b) => a.day.localeCompare(b.day));

  const totalCreditsOutstanding = (balancesRes.data ?? []).reduce((sum, r) => sum + (r.balance ?? 0), 0);
  const avgCreditsPerCompany =
    balancesRes.data?.length ? Math.round((totalCreditsOutstanding / balancesRes.data.length) * 10) / 10 : 0;

  const queuePayload = (queueRes.data ?? null) as unknown as
    | { snapshot?: QueueSnapshot; hourly?: HourlyQueuePoint[]; workers?: QueueWorkerRow[] }
    | null;
  const queueSnapshot = queuePayload?.snapshot ?? null;
  const queueHourly = Array.isArray(queuePayload?.hourly) ? (queuePayload?.hourly as HourlyQueuePoint[]) : [];
  const workers = Array.isArray(queuePayload?.workers) ? (queuePayload?.workers as QueueWorkerRow[]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Аналитика</h1>
        <p className="text-muted-foreground">Показатели продукта: для калибровки тарифов и понятного статуса роста.</p>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">AI Queue & Workers</h2>
          <p className="text-muted-foreground text-sm">
            Очередь задач и состояние воркеров. Данные агрегируются из `jobs_ai` и heartbeat’ов воркеров.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Queue (queued / processing)</CardDescription>
              <CardTitle className="text-3xl font-mono">
                {queueSnapshot ? `${queueSnapshot.queued} / ${queueSnapshot.processing}` : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Старейшая queued: {fmtAgeSeconds(queueSnapshot?.oldest_queued_age_seconds)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Done / Failed (24h)</CardDescription>
              <CardTitle className="text-3xl font-mono">
                {queueSnapshot ? `${queueSnapshot.done_24h} / ${queueSnapshot.failed_24h}` : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Stuck processing (TTL): {queueSnapshot?.stuck_processing ?? "—"}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Workers (alive / concurrency)</CardDescription>
              <CardTitle className="text-3xl font-mono">
                {queueSnapshot ? `${queueSnapshot.alive_workers} / ${queueSnapshot.total_concurrency}` : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Est drain: {queueSnapshot?.est_drain_minutes != null ? `${queueSnapshot.est_drain_minutes}м` : "—"}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Latency (p95 queue / process)</CardDescription>
              <CardTitle className="text-3xl font-mono">
                {queueSnapshot ? `${fmtSeconds(queueSnapshot.p95_queue_wait_seconds)} / ${fmtSeconds(queueSnapshot.p95_process_seconds)}` : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              p50: {fmtSeconds(queueSnapshot?.p50_queue_wait_seconds)} / {fmtSeconds(queueSnapshot?.p50_process_seconds)}
            </CardContent>
          </Card>
        </div>

        {queueHourly.length > 0 ? (
          <AiQueueCharts data={queueHourly} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AI очередь (по часам)</CardTitle>
              <CardDescription>Пока нет данных за выбранное окно.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Запустите воркеры и создайте несколько AI задач.</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Воркеры</CardTitle>
            <CardDescription>Heartbeat за последние 24 часа (живые — last_seen за 2 минуты).</CardDescription>
          </CardHeader>
          <CardContent>
            {workers.length === 0 ? (
              <div className="text-sm text-muted-foreground">Воркеры не видны. Проверьте деплой воркера и доступ к Supabase.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 text-left font-medium">worker_id</th>
                      <th className="py-2 text-left font-medium">last_seen</th>
                      <th className="py-2 text-right font-medium">conc</th>
                      <th className="py-2 text-right font-medium">active</th>
                      <th className="py-2 text-left font-medium">provider</th>
                      <th className="py-2 text-left font-medium">version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workers.slice(0, 50).map((w) => (
                      <tr key={w.worker_id} className="border-b last:border-0">
                        <td className="py-2 font-mono text-xs">{w.worker_id}</td>
                        <td className="py-2">{new Date(w.last_seen_at).toLocaleString("ru-RU")}</td>
                        <td className="py-2 text-right font-mono">{w.concurrency}</td>
                        <td className="py-2 text-right font-mono">{w.active_jobs}</td>
                        <td className="py-2">{w.provider ?? "—"}</td>
                        <td className="py-2">{w.version ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Credits outstanding</CardDescription>
            <CardTitle className="text-3xl font-mono">{totalCreditsOutstanding}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Сумма балансов всех компаний</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg credits / company</CardDescription>
            <CardTitle className="text-3xl font-mono">{avgCreditsPerCompany}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Средний баланс (грубый индикатор)</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Signups (30d)</CardDescription>
            <CardTitle className="text-3xl font-mono">{profilesRes.data?.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Регистрации за 30 дней</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>AI analyses (30d)</CardDescription>
            <CardTitle className="text-3xl font-mono">{analysesRes.data?.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Запуски анализа за 30 дней</CardContent>
        </Card>
      </div>

      <MetricsCharts data={series} />
    </div>
  );
}

