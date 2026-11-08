import type { FeedbackSection, FeedbackType } from "@/lib/feedback/constants";
import { readFeedbackApiErrorMessage } from "@/lib/feedback/validation";

export async function submitFeedback(input: {
  type: FeedbackType;
  sections: FeedbackSection[];
  message: string;
  sourceUrl?: string | null;
}): Promise<void> {
  const message = input.message.trim();
  if (!message) throw new Error("Напишите сообщение");
  if (!input.sections.length) throw new Error("Выберите хотя бы один раздел");

  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: input.type,
      sections: input.sections,
      message,
      sourceUrl: input.sourceUrl ?? null,
    }),
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readFeedbackApiErrorMessage(json, "Не удалось отправить сообщение. Попробуйте ещё раз."));
  }
}
