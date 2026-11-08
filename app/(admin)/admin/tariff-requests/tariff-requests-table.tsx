"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { updateEnterpriseLeadStatusAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type LeadStatus = "new" | "contacted" | "qualified" | "rejected";

type Row = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  company: string;
  company_size: string | null;
  message: string | null;
  requested_plan: "starter" | "professional" | "enterprise";
  status: LeadStatus;
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
  decision_note: string | null;
};

type Props = {
  rows: Row[];
  handlerById: Record<string, { name: string | null; email: string | null }>;
};

type ActionState = { status: "idle" } | { status: "success"; message: string } | { status: "error"; message: string };

function statusBadge(status: LeadStatus) {
  if (status === "new") return <Badge variant="outline">Новая</Badge>;
  if (status === "contacted") return <Badge className="bg-blue-600 hover:bg-blue-600">В работе</Badge>;
  if (status === "qualified") return <Badge className="bg-green-600 hover:bg-green-600">Квалифицирована</Badge>;
  return <Badge variant="destructive">Отклонена</Badge>;
}

function handlerLabel(handlerById: Props["handlerById"], handledBy: string | null) {
  if (!handledBy) return "—";
  const handler = handlerById[handledBy];
  if (!handler) return handledBy;
  return handler.name ?? handler.email ?? handledBy;
}

export function TariffRequestsTable({ rows, handlerById }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateEnterpriseLeadStatusAction, { status: "idle" });

  React.useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  const newRows = rows.filter((r) => r.status === "new");
  const inProgressRows = rows.filter((r) => r.status === "contacted");
  const doneRows = rows.filter((r) => r.status === "qualified" || r.status === "rejected");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Новые</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Создано</TableHead>
                  <TableHead>Контакт</TableHead>
                  <TableHead>Компания</TableHead>
                  <TableHead>Сообщение</TableHead>
                  <TableHead className="min-w-[340px]">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {newRows.length ? (
                  newRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell className="min-w-[260px]">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{r.full_name}</span>
                          <span className="text-sm text-muted-foreground">{r.email}</span>
                          <span className="text-sm text-muted-foreground">{r.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{r.company}</span>
                          <span className="text-xs text-muted-foreground">План: Enterprise</span>
                          {r.company_size ? <span className="text-xs text-muted-foreground">Размер: {r.company_size}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px] text-sm text-muted-foreground">
                        {r.message ? <span className="line-clamp-4">{r.message}</span> : "—"}
                      </TableCell>
                      <TableCell className="min-w-[340px]">
                        <form action={action} className="space-y-2">
                          <Input type="hidden" name="leadId" value={r.id} />
                          <Label className="text-xs text-muted-foreground" htmlFor={`note-new-${r.id}`}>
                            Комментарий (опционально)
                          </Label>
                          <Textarea
                            id={`note-new-${r.id}`}
                            name="decisionNote"
                            placeholder="Примечание по обработке"
                            disabled={pending}
                            className="min-h-[64px]"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button type="submit" name="nextStatus" value="contacted" disabled={pending}>
                              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              В работу
                            </Button>
                            <Button type="submit" name="nextStatus" value="qualified" variant="secondary" disabled={pending}>
                              Квалифицировать
                            </Button>
                            <Button type="submit" name="nextStatus" value="rejected" variant="destructive" disabled={pending}>
                              Отклонить
                            </Button>
                          </div>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Новых enterprise-заявок нет.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">В работе</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Создано</TableHead>
                  <TableHead>Контакт</TableHead>
                  <TableHead>Компания</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="min-w-[320px]">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inProgressRows.length ? (
                  inProgressRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell className="min-w-[260px]">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{r.full_name}</span>
                          <span className="text-sm text-muted-foreground">{r.email}</span>
                          <span className="text-sm text-muted-foreground">{r.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{r.company}</span>
                          {r.company_size ? <span className="text-xs text-muted-foreground">Размер: {r.company_size}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          {statusBadge(r.status)}
                          <div className="text-xs text-muted-foreground">
                            Обновил: {handlerLabel(handlerById, r.handled_by)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[320px]">
                        <form action={action} className="space-y-2">
                          <Input type="hidden" name="leadId" value={r.id} />
                          <Label className="text-xs text-muted-foreground" htmlFor={`note-progress-${r.id}`}>
                            Комментарий (опционально)
                          </Label>
                          <Textarea
                            id={`note-progress-${r.id}`}
                            name="decisionNote"
                            placeholder="Итог обработки"
                            disabled={pending}
                            className="min-h-[64px]"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button type="submit" name="nextStatus" value="qualified" variant="secondary" disabled={pending}>
                              Квалифицировать
                            </Button>
                            <Button type="submit" name="nextStatus" value="rejected" variant="destructive" disabled={pending}>
                              Отклонить
                            </Button>
                          </div>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Нет заявок в работе.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Завершённые</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Создано</TableHead>
                  <TableHead>Контакт</TableHead>
                  <TableHead>Компания</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Комментарий</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doneRows.length ? (
                  doneRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell className="min-w-[260px]">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{r.full_name}</span>
                          <span className="text-sm text-muted-foreground">{r.email}</span>
                          <span className="text-sm text-muted-foreground">{r.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{r.company}</span>
                          {r.company_size ? <span className="text-xs text-muted-foreground">Размер: {r.company_size}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="space-y-1 text-sm">
                          {statusBadge(r.status)}
                          <div className="text-xs text-muted-foreground">Обработал: {handlerLabel(handlerById, r.handled_by)}</div>
                          <div className="text-xs text-muted-foreground">
                            Когда: {r.handled_at ? new Date(r.handled_at).toLocaleString("ru-RU") : "—"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px] text-sm text-muted-foreground">
                        {r.decision_note ? <span className="line-clamp-4">{r.decision_note}</span> : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Завершённых заявок пока нет.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
