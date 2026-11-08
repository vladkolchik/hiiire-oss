import { CreateUserForm } from "../../users/create-user-form";
import { DeleteUserButton } from "../../users/delete-user-button";
import { RoleCell } from "../../users/role-cell";
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

type CompanyRow = { id: string; name: string };

type ProfileRow = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "hr" | "recruiter";
  company_id: string | null;
  created_at: string;
};

function buildUsersHref(page: number, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

export default async function AdminUsersPage({
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

  const { data: companies } = await supabaseAdmin.from("companies").select("id,name").order("created_at", { ascending: false });
  const companyNameById = new Map<string, string>(((companies ?? []) as CompanyRow[]).map((c) => [c.id, c.name]));

  let profilesQuery = supabaseAdmin
    .from("profiles")
    .select("id,email,name,role,company_id,created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (q) {
    if (isUuid(q)) {
      profilesQuery = profilesQuery.or(`name.ilike.%${q}%,id.eq.${q}`);
    } else {
      profilesQuery = profilesQuery.ilike("name", `%${q}%`);
    }
  }

  const { data: profiles, error, count } = await profilesQuery.range(from, to);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Пользователи</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive">Ошибка загрузки: {error.message}</CardContent>
      </Card>
    );
  }

  const totalProfiles = typeof count === "number" ? count : 0;
  const totalPages = getTotalPages(totalProfiles, PAGE_SIZE);
  const prevHref = buildUsersHref(page - 1, q);
  const nextHref = buildUsersHref(page + 1, q);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Пользователи</h1>
        <p className="text-muted-foreground">Профили пользователей, роли и привязка к компаниям.</p>
      </div>

      <CreateUserForm companies={((companies ?? []) as CompanyRow[]) ?? []} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Список пользователей</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Поиск по имени или точному user id (UUID)"
              className="sm:max-w-md"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Найти
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/users">Сброс</Link>
              </Button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Компания</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Создан</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profiles as ProfileRow[] | null)?.length ? (
                  (profiles as ProfileRow[]).map((p) => {
                    const companyName = p.company_id ? companyNameById.get(p.company_id) : null;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="min-w-[260px]">
                          <div className="flex flex-col">
                            <span className="font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground">{p.email}</span>
                            <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          {companyName ? (
                            <div className="flex flex-col">
                              <span className="text-sm">{companyName}</span>
                              <span className="font-mono text-xs text-muted-foreground">{p.company_id}</span>
                            </div>
                          ) : (
                            <Badge variant="secondary">no company</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <RoleCell userId={p.id} value={p.role} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {new Date(p.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <DeleteUserButton userId={p.id} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Пользователей пока нет.
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
              <span className="font-medium text-foreground">{totalProfiles}</span>
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
