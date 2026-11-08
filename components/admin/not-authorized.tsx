import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AdminNotAuthorized() {
  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <Alert variant="destructive">
        <AlertTitle>Нет доступа</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Этот аккаунт не является platform admin.</p>
          <p className="text-sm text-muted-foreground">
            Чтобы выдать доступ, добавьте пользователя в таблицу <code>platform_admins</code> в Supabase
            (SQL Editor) или через сервисный воркфлоу.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

