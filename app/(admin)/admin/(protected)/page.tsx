import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPlatformSummary } from "@/lib/admin/platform-summary";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";

export default async function AdminHomePage() {
  // guard + display user; protected layout already guards, but keeping this cheap defense-in-depth
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return null;

  const summary = await loadPlatformSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Админка</h1>
        <p className="text-muted-foreground">Ключевые показатели продукта и быстрые действия.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Компании</CardDescription>
            <CardTitle className="text-3xl">{summary.companies}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Всего зарегистрировано</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Пользователи</CardDescription>
            <CardTitle className="text-3xl">{summary.users}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Всего профилей</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Вакансии</CardDescription>
            <CardTitle className="text-3xl">{summary.vacancies}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Создано в системе</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Кандидаты</CardDescription>
            <CardTitle className="text-3xl">{summary.candidates}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">В пайплайне</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Запросы к ИИ</CardDescription>
            <CardTitle className="text-3xl">{summary.aiRequests}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Всего запусков</CardContent>
        </Card>
      </div>
    </div>
  );
}

