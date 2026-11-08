"use client";

import * as React from "react";
import { useActionState } from "react";
import { Copy, Loader2, Plus } from "lucide-react";

import { createCompanyWithAdminAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

function generatePassword(length = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

export function CreateCompanyForm() {
  const [state, action, pending] = useActionState(createCompanyWithAdminAction, { status: "idle" as const });
  const [password, setPassword] = React.useState(() => (typeof window !== "undefined" ? generatePassword() : ""));

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
    if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Пароль скопирован");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">Создать компанию + admin</CardTitle>
        <CardDescription>Создаём нового пользователя, который становится admin своей компании.</CardDescription>
      </CardHeader>
      <form
        action={(formData) => {
          formData.set("password", password);
          return action(formData);
        }}
      >
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {state.status === "success" ? (
            <div className="sm:col-span-2">
              <Alert>
                <AlertDescription className="space-y-1">
                  <div>Готово. IDs:</div>
                  <div className="font-mono text-xs">company_id: {state.companyId}</div>
                  <div className="font-mono text-xs">user_id: {state.userId}</div>
                </AlertDescription>
              </Alert>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="companyName">Компания</Label>
            <Input id="companyName" name="companyName" placeholder="Tech Innovations" required disabled={pending} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminName">Имя админа</Label>
            <Input id="adminName" name="adminName" placeholder="Анна Иванова" disabled={pending} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminEmail">Email админа</Label>
            <Input id="adminEmail" name="adminEmail" type="email" placeholder="anna@company.com" required disabled={pending} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="initialCredits">Initial credits (опционально)</Label>
            <Input id="initialCredits" name="initialCredits" type="number" min={0} step={1} placeholder="0" disabled={pending} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Временный пароль</Label>
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} />
              <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())} disabled={pending}>
                <Plus className="mr-2 h-4 w-4" />
                Новый
              </Button>
              <Button type="button" variant="outline" onClick={copyPassword} disabled={pending}>
                <Copy className="mr-2 h-4 w-4" />
                Копировать
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Пароль генерируется в браузере и отправляется только на сервер при отправке формы. Мы его не сохраняем.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Создать
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
