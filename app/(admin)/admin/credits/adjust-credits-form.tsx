"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { adjustCreditsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type CompanyOption = { id: string; name: string };

export function AdjustCreditsForm({ companies }: { companies: CompanyOption[] }) {
  const [state, action, pending] = useActionState(adjustCreditsAction, { status: "idle" as const });
  const [reason, setReason] = React.useState<"grant" | "manual_adjustment" | "refund">("grant");

  React.useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">Начислить / списать credits</CardTitle>
        <CardDescription>Записывает запись в ledger и автоматически обновляет баланс.</CardDescription>
      </CardHeader>
      <form
        action={(formData) => {
          formData.set("reason", reason);
          return action(formData);
        }}
      >
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Компания</Label>
            <Select onValueChange={(v) => (document.getElementById("companyId") as HTMLInputElement).value = v} disabled={pending}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите компанию" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input id="companyId" name="companyId" type="hidden" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="delta">Delta</Label>
            <Input id="delta" name="delta" type="number" step={1} placeholder="например: 100 или -20" required disabled={pending} />
            <p className="text-xs text-muted-foreground">Положительное = начисление, отрицательное = списание.</p>
          </div>

          <div className="space-y-2">
            <Label>Причина</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as "grant" | "manual_adjustment" | "refund")} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grant">grant</SelectItem>
                <SelectItem value="manual_adjustment">manual_adjustment</SelectItem>
                <SelectItem value="refund">refund</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Комментарий (опционально)</Label>
            <Textarea id="notes" name="notes" placeholder="почему начислили/списали" disabled={pending} />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Применить
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

