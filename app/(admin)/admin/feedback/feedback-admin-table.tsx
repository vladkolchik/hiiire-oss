"use client";

import * as React from "react";
import { useActionState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { updateFeedbackStatusAction, type FeedbackAdminActionState } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_ADMIN_CLASS_OPTIONS,
  FEEDBACK_SECTION_OPTIONS,
  FEEDBACK_STATUS_OPTIONS,
  FEEDBACK_TYPE_OPTIONS,
  type FeedbackAdminClass,
  type FeedbackStatus,
} from "@/lib/feedback/constants";

export type FeedbackAdminRow = {
  id: string;
  company_id: string;
  user_id: string;
  author_name: string | null;
  author_email: string;
  author_role: "admin" | "hr" | "recruiter";
  type: "idea" | "missing_feature" | "usability" | "question" | "other";
  sections: string[];
  message: string;
  status: FeedbackStatus;
  admin_class: FeedbackAdminClass | null;
  admin_note: string | null;
  external_url: string | null;
  source_url: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type Props = {
  rows: FeedbackAdminRow[];
  companyNameById: Record<string, string>;
};

type RowFormProps = {
  row: FeedbackAdminRow;
  companyName: string | null;
  action: (payload: FormData) => void;
  pending: boolean;
};

const NONE_ADMIN_CLASS = "__none";

const typeLabelByValue = Object.fromEntries(FEEDBACK_TYPE_OPTIONS.map((option) => [option.value, option.label]));
const sectionLabelByValue = Object.fromEntries(FEEDBACK_SECTION_OPTIONS.map((option) => [option.value, option.label]));
const statusLabelByValue = Object.fromEntries(FEEDBACK_STATUS_OPTIONS.map((option) => [option.value, option.label]));
const adminClassLabelByValue = Object.fromEntries(FEEDBACK_ADMIN_CLASS_OPTIONS.map((option) => [option.value, option.label]));

function statusBadge(status: FeedbackStatus) {
  if (status === "new") return <Badge variant="outline">Новый</Badge>;
  if (status === "in_progress") return <Badge className="bg-blue-600 hover:bg-blue-600">В работе</Badge>;
  if (status === "reviewed") return <Badge className="bg-violet-600 hover:bg-violet-600">Разобран</Badge>;
  if (status === "closed") return <Badge className="bg-green-600 hover:bg-green-600">Закрыт</Badge>;
  return <Badge variant="secondary">Отложен</Badge>;
}

function roleLabel(role: FeedbackAdminRow["author_role"]) {
  if (role === "admin") return "Администратор";
  if (role === "hr") return "HR";
  return "Рекрутер";
}

function sectionLabels(sections: string[]) {
  if (!sections.length) return "—";
  return sections.map((section) => sectionLabelByValue[section] ?? section).join(", ");
}

function safeFeedbackSourceHref(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function FeedbackAdminRowForm({ row, companyName, action, pending }: RowFormProps) {
  const [status, setStatus] = React.useState<FeedbackStatus>(row.status);
  const [adminClass, setAdminClass] = React.useState<FeedbackAdminClass | typeof NONE_ADMIN_CLASS>(
    row.admin_class ?? NONE_ADMIN_CLASS
  );
  const sourceHref = safeFeedbackSourceHref(row.source_url);

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        <div className="flex flex-col gap-1">
          <span>Дата: {new Date(row.created_at).toLocaleString("ru-RU")}</span>
          {row.reviewed_at ? <span>Проверено: {new Date(row.reviewed_at).toLocaleString("ru-RU")}</span> : null}
        </div>
      </TableCell>
      <TableCell className="min-w-[180px] max-w-[240px]">
        <div className="min-w-0 space-y-1">
          <div className="truncate font-medium">{companyName ?? "Компания не найдена"}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">{row.company_id}</div>
        </div>
      </TableCell>
      <TableCell className="min-w-[220px] max-w-[280px]">
        <div className="min-w-0 space-y-1">
          <div className="truncate font-medium">{row.author_name ?? row.author_email}</div>
          <div className="truncate text-xs text-muted-foreground">{row.author_email}</div>
          <div className="text-xs text-muted-foreground">{roleLabel(row.author_role)}</div>
        </div>
      </TableCell>
      <TableCell className="min-w-[170px]">
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">Тип</span>
            <div>{typeLabelByValue[row.type] ?? row.type}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Разделы</span>
            <div className="max-w-[220px] break-words">{sectionLabels(row.sections)}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="min-w-[260px] max-w-[360px]">
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">Сообщение</span>
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words">{row.message}</p>
          </div>
          {sourceHref ? (
            <a
              href={sourceHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate text-xs text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Источник</span>
            </a>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="min-w-[360px]">
        <form action={action} className="space-y-3">
          <Input type="hidden" name="feedbackId" value={row.id} />
          <Input type="hidden" name="status" value={status} />
          <Input type="hidden" name="adminClass" value={adminClass} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Статус</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as FeedbackStatus)} disabled={pending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Класс</Label>
              <Select value={adminClass} onValueChange={(value) => setAdminClass(value as FeedbackAdminClass | typeof NONE_ADMIN_CLASS)} disabled={pending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_ADMIN_CLASS}>Без класса</SelectItem>
                  {FEEDBACK_ADMIN_CLASS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`note-${row.id}`} className="text-xs text-muted-foreground">
              Заметка
            </Label>
            <Textarea
              id={`note-${row.id}`}
              name="adminNote"
              defaultValue={row.admin_note ?? ""}
              maxLength={5000}
              disabled={pending}
              className="min-h-[72px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`external-url-${row.id}`} className="text-xs text-muted-foreground">
              Внешняя ссылка
            </Label>
            <Input
              id={`external-url-${row.id}`}
              name="externalUrl"
              type="url"
              defaultValue={row.external_url ?? ""}
              maxLength={2048}
              placeholder="https://..."
              disabled={pending}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-xs text-muted-foreground">
              {row.admin_class ? adminClassLabelByValue[row.admin_class] ?? row.admin_class : "Класс не выбран"}
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Сохранить
            </Button>
          </div>
        </form>
      </TableCell>
    </TableRow>
  );
}

export function FeedbackAdminTable({ rows, companyNameById }: Props) {
  const [state, action, pending] = useActionState<FeedbackAdminActionState, FormData>(updateFeedbackStatusAction, {
    status: "idle",
  });

  React.useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Обращения</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Компания</TableHead>
                <TableHead>Автор</TableHead>
                <TableHead>Тип и разделы</TableHead>
                <TableHead>Сообщение</TableHead>
                <TableHead className="min-w-[360px]">Статус, класс, заметка, внешняя ссылка</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <FeedbackAdminRowForm
                    key={row.id}
                    row={row}
                    companyName={companyNameById[row.company_id] ?? null}
                    action={action}
                    pending={pending}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    Обращений пока нет.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
