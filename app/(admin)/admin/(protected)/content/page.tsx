import { ContentCmsClient } from "@/components/admin/content-cms-client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const checklist = [
  "Первый экран должен сразу отвечать на главный вопрос читателя: что это, зачем нужно и какой следующий шаг.",
  "Сравнения оформляйте таблицами с короткими строками и понятными колонками.",
  "Если таблица нужна, проверьте локально, что она читается на мобильном экране.",
  "FAQ должен быть видимым в конце материала, а ответы не должны противоречить основному тексту.",
  "Источники добавляйте там, где есть внешний факт, цифра или методика; не ссылайтесь на закрытые данные.",
  "Про AI пишите как про помощника для отбора, а не как про финальное решение вместо рекрутера.",
  "Данные hiiire можно использовать только в обезличенном и агрегированном виде.",
  "Связанные материалы подбираются вручную в relatedContent: 2-4 ссылки достаточно.",
  "Откройте страницу локально и убедитесь, что текст читается без обрывов и лишних повторов.",
  "После правок посмотрите diff и отправьте изменения через PR.",
];

export default function AdminContentPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Контент</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Здесь можно подготовить статьи для блога и базы знаний hiiire. Пишите коротко, проверяйте пользу
          для читателя и не добавляйте персональные данные кандидатов, клиентов или вакансий.
        </p>
      </div>

      <Alert>
        <AlertTitle>Публикация в v1</AlertTitle>
        <AlertDescription>
          Редактор сохраняет материалы в локальной ветке. На сайт они попадают только после проверки и PR,
          прямой публикации на боевой сайт здесь нет.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Памятка автору</CardTitle>
          <CardDescription>Короткий чеклист перед тем, как отправить материал на проверку.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="author-checklist">
              <AccordionTrigger>Открыть чеклист автора</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {checklist.map((item) => (
                    <li key={item} className="break-words">
                      {item}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <ContentCmsClient />
    </div>
  );
}
