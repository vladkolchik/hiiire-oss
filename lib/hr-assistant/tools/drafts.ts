export type AssistantDraftKind = "candidate_message" | "rejection" | "invitation" | "vacancy_description" | "interview_plan";

export function buildDraftInstruction(kind: AssistantDraftKind): string {
  switch (kind) {
    case "candidate_message":
      return "Подготовь короткое, вежливое сообщение кандидату. Не утверждай, что сообщение отправлено.";
    case "rejection":
      return "Подготовь уважительный отказ кандидату без технических деталей и внутренних оценок.";
    case "invitation":
      return "Подготовь приглашение на интервью с понятным следующим шагом. Не утверждай, что приглашение отправлено.";
    case "vacancy_description":
      return "Подготовь черновик описания вакансии, который рекрутер сможет отредактировать. Не меняй вакансию в CRM.";
    case "interview_plan":
      return "Подготовь план интервью по кандидату и вакансии. Не создавай встречу в календаре.";
  }
}
