import { CreateCompanyForm } from "../../companies/create-company-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getRange, getTotalPages, isUuid, normalizeSearch, parsePageParam } from "@/lib/admin/list-query";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

type CompanyRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string | null;
  ownerProfile?: { name: string | null; email: string | null } | null;
};

type CompanyCreditsRow = { company_id: string; balance: number };

function buildCompaniesHref(page: number, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/companies?${query}` : "/admin/companies";
}

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return null;

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const q = normalizeSearch(resolvedSearchParams.q);
  const page = parsePageParam(resolvedSearchParams.page, { defaultValue: 1, min: 1, max: 10_000 });

  const supabaseAdmin = getSupabaseAdminClient();
  const { from, to } = getRange(page, PAGE_SIZE);

  let companiesQuery = supabaseAdmin
    .from("companies")
    // NOTE: We intentionally do NOT use a PostgREST join here.
    // In some environments Supabase-generated TS types don't recognize the relation name and break `next build`.
    .select("id,name,created_at,created_by", { count: "exact" })
    .order("created_at", { ascending: false });

  if (q) {
    if (isUuid(q)) {
      companiesQuery = companiesQuery.or(`name.ilike.%${q}%,id.eq.${q}`);
    } else {
      companiesQuery = companiesQuery.ilike("name", `%${q}%`);
    }
  }

  const { data: companies, error, count } = await companiesQuery.range(from, to);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Компании</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive">Ошибка загрузки: {error.message}</CardContent>
      </Card>
    );
  }

  const pageCompanyIds = (companies ?? []).map((c) => c.id);
  const { data: creditsRows } = pageCompanyIds.length
    ? await supabaseAdmin.from("company_credits").select("company_id,balance").in("company_id", pageCompanyIds)
    : { data: [] as CompanyCreditsRow[] };
  const creditsByCompany = new Map<string, number>(
    ((creditsRows ?? []) as CompanyCreditsRow[]).map((r) => [r.company_id, r.balance])
  );

  const createdByIds = Array.from(new Set((companies ?? []).map((c) => c.created_by).filter(Boolean))) as string[];
  const { data: ownerProfiles } =
    createdByIds.length > 0
      ? await supabaseAdmin.from("profiles").select("id,name,email").in("id", createdByIds)
      : { data: [] as Array<{ id: string; name: string | null; email: string | null }> };

  const ownerById = new Map<string, { name: string | null; email: string | null }>(
    (ownerProfiles ?? []).map((p) => [p.id, { name: p.name, email: p.email }])
  );

  const rows: CompanyRow[] = (companies ?? []).map((c) => ({
    ...(c as Omit<CompanyRow, "ownerProfile">),
    ownerProfile: c.created_by ? ownerById.get(c.created_by) ?? null : null,
  }));
  const totalCompanies = typeof count === "number" ? count : 0;
  const totalPages = getTotalPages(totalCompanies, PAGE_SIZE);
  const prevHref = buildCompaniesHref(page - 1, q);
  const nextHref = buildCompaniesHref(page + 1, q);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Компании</h1>
        <p className="text-muted-foreground">Создание компаний и обзор зарегистрированных аккаунтов.</p>
      </div>

      <CreateCompanyForm />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Список компаний</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Поиск по названию или точному company id (UUID)"
              className="sm:max-w-md"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Найти
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/companies">Сброс</Link>
              </Button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Компания</TableHead>
                  <TableHead>Создана</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((c) => {
                    const balance = creditsByCompany.get(c.id) ?? 0;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="min-w-[260px]">
                          <div className="flex flex-col">
                            <span className="font-medium">{c.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {new Date(c.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          {c.created_by ? (
                            <div className="flex flex-col">
                              <span className="text-sm">{c.ownerProfile?.name ?? "—"}</span>
                              <span className="text-xs text-muted-foreground">{c.ownerProfile?.email ?? c.created_by}</span>
                            </div>
                          ) : (
                            <Badge variant="secondary">system</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{balance}</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      Пока нет компаний.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Страница <span className="font-medium text-foreground">{page}</span> из{" "}
              <span className="font-medium text-foreground">{totalPages}</span>. Всего:{" "}
              <span className="font-medium text-foreground">{totalCompanies}</span>
            </div>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={prevHref}>Назад</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Назад
                </Button>
              )}
              {page < totalPages ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={nextHref}>Вперёд</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Вперёд
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
