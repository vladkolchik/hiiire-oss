import { MessageSquareText } from "lucide-react";

import { FeedbackForm } from "./feedback-form";

export default function FeedbackPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
          <MessageSquareText className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-2">
          <h1 className="break-words text-3xl font-bold tracking-tight">Обратная связь</h1>
          <p className="max-w-2xl break-words text-sm leading-6 text-muted-foreground">
            Выберите, что хотите передать команде hiiire. Мы внимательно прислушиваемся к обратной связи и стремимся
            сделать удобный сервис для вашей работы.
          </p>
        </div>
      </div>

      <FeedbackForm />
    </div>
  );
}
