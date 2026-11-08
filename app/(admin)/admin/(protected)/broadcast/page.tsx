import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

import { BroadcastForm } from "../../broadcast/broadcast-form";

export default async function AdminBroadcastPage() {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return null;

  const admin = getSupabaseAdminClient();
  const [{ count: tgCount }, { count: profilesCount }, { count: emailDisabledCount }] = await Promise.all([
    admin.from("telegram_user_links").select("*", { count: "exact", head: true }),
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("email_notification_settings").select("*", { count: "exact", head: true }).eq("email_enabled", false),
  ]);

  const totalProfiles = typeof profilesCount === "number" ? profilesCount : 0;
  const disabled = typeof emailDisabledCount === "number" ? emailDisabledCount : 0;
  const eligibleEmailsCount = Math.max(0, totalProfiles - disabled);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Рассылка</h1>
        <p className="text-muted-foreground">Сообщения всем пользователям (Telegram и Email).</p>
      </div>

      <BroadcastForm
        connectedCount={typeof tgCount === "number" ? tgCount : 0}
        eligibleEmailsCount={eligibleEmailsCount}
      />

      <Card className="border-border/60 bg-card/60 backdrop-blur">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">Подсказка</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Для webhook-режима бот должен быть настроен через <code>setWebhook</code> с <code>secret_token</code>. Иначе сообщения подключать можно,
          но апдейты не будут доходить до сервера.
        </CardContent>
      </Card>
    </div>
  );
}

