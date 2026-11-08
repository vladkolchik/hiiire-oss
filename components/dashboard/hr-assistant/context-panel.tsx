import { Badge } from "@/components/ui/badge";

export function ContextPanel() {
  return (
    <aside className="hidden min-h-0 min-w-0 overflow-y-auto border-l bg-background p-4 lg:flex lg:w-80 lg:shrink-0 lg:flex-col lg:gap-5">
      <section className="min-w-0 space-y-2">
        <h2 className="break-words text-sm font-semibold">Контекст</h2>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Badge className="max-w-full truncate" variant="secondary">
            Рабочее пространство
          </Badge>
          <Badge className="max-w-full truncate" variant="secondary">
            Текущий чат
          </Badge>
        </div>
      </section>

      <section className="min-w-0 space-y-2">
        <h2 className="break-words text-sm font-semibold">Режим допуска</h2>
        <p className="break-words text-sm leading-6 text-muted-foreground">
          Ассистент может отвечать и готовить черновики сразу. Рискованные
          действия требуют подтверждения перед применением.
        </p>
      </section>
    </aside>
  );
}
