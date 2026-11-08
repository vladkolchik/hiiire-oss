export type UnsupportedAssistantAction = "send_email" | "hh_publish" | "hh_message" | "candidate_facing_chat";

export function getUnsupportedActionMessage(action: UnsupportedAssistantAction): string {
  switch (action) {
    case "send_email":
      return "HR-ассистент пока может подготовить письмо, но не отправляет внешние сообщения.";
    case "hh_publish":
      return "Публикация в HH.ru пока недоступна из HR-ассистента. Я могу подготовить черновик.";
    case "hh_message":
      return "Сообщения в HH.ru пока недоступны из HR-ассистента. Я могу подготовить текст.";
    case "candidate_facing_chat":
      return "Ассистент для кандидатов запланирован позже. Сейчас я работаю внутри CRM.";
  }
}
