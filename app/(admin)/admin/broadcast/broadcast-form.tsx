"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { broadcastEmailAction, broadcastTelegramAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function BroadcastForm({ connectedCount, eligibleEmailsCount }: { connectedCount: number; eligibleEmailsCount: number }) {
  const [tgState, tgAction, tgPending] = useActionState(broadcastTelegramAction, { status: "idle" as const });
  const [emailState, emailAction, emailPending] = useActionState(broadcastEmailAction, { status: "idle" as const });
  const [text, setText] = React.useState("📣 Сообщение от hiiire\n\n");
  const [subject, setSubject] = React.useState("Новость от hiiire");
  const [body, setBody] = React.useState("Здравствуйте!\n\n");

  React.useEffect(() => {
    if (tgState.status === "success") toast.success(tgState.message);
    if (tgState.status === "error") toast.error(tgState.message);
  }, [tgState]);

  React.useEffect(() => {
    if (emailState.status === "success") toast.success(emailState.message);
    if (emailState.status === "error") toast.error(emailState.message);
  }, [emailState]);

  return (
    <Tabs defaultValue="telegram" className="space-y-4">
      <TabsList>
        <TabsTrigger value="telegram">Telegram</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
      </TabsList>

      <TabsContent value="telegram">
        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">Рассылка в Telegram</CardTitle>
            <CardDescription>Отправит сообщение всем пользователям, которые подключили бота.</CardDescription>
          </CardHeader>
          <form
            action={(formData) => {
              formData.set("text", text);
              return tgAction(formData);
            }}
          >
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription className="text-sm">
                  Подключено пользователей: <strong>{connectedCount}</strong>. Отправка выполняется best‑effort (часть сообщений может не дойти,
                  например если пользователь заблокировал бота).
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="text">Текст сообщения</Label>
                <Textarea
                  id="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  disabled={tgPending}
                  placeholder="Введите текст рассылки…"
                />
                <div className="text-xs text-muted-foreground">Макс 3500 символов. Форматирование — обычный текст.</div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={tgPending}>
                {tgPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {tgPending ? "Отправляем…" : "Отправить"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </TabsContent>

      <TabsContent value="email">
        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">Рассылка по Email</CardTitle>
            <CardDescription>Отправит письмо всем пользователям, кто не отключил email‑уведомления.</CardDescription>
          </CardHeader>
          <form
            action={(formData) => {
              formData.set("subject", subject);
              formData.set("body", body);
              return emailAction(formData);
            }}
          >
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription className="text-sm">
                  Доступно получателей: <strong>{eligibleEmailsCount}</strong>. Отправка выполняется best‑effort и индивидуально (без раскрытия адресов).
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="subject">Тема</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={emailPending}
                  placeholder="Тема письма…"
                />
                <div className="text-xs text-muted-foreground">Макс 120 символов.</div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">Текст письма</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  disabled={emailPending}
                  placeholder="Введите текст рассылки…"
                />
                <div className="text-xs text-muted-foreground">Макс 10 000 символов. Форматирование — обычный текст (HTML формируется автоматически).</div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={emailPending}>
                {emailPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {emailPending ? "Отправляем…" : "Отправить"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

