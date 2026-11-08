type PromptMessage = {
  role: "user" | "assistant";
  content: string;
};

type PromptPinnedContext = {
  entityType: string;
  label: string;
};

export type BuildHrAssistantPromptContextInput = {
  currentThread: {
    summary: string | null;
    messages: PromptMessage[];
  };
  pinnedContext: PromptPinnedContext[];
  retrievedDocs: string[];
  retrievedCrmFacts: string[];
  unrelatedThreadSummaries?: string[];
  relevantThreadSummaries?: string[];
};

function section(title: string, lines: string[]): string {
  const clean = lines.map((line) => line.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  return [`## ${title}`, ...clean].join("\n");
}

export function buildHrAssistantPromptContext(input: BuildHrAssistantPromptContextInput): string {
  const messageLines = input.currentThread.messages.flatMap((message) => {
    const content = message.content.trim();
    if (!content) return [];

    const role = message.role === "user" ? "USER" : "ASSISTANT";
    return [`${role}: ${content}`];
  });

  const pinnedContextLines = input.pinnedContext.flatMap((item) => {
    const entityType = item.entityType.trim();
    const label = item.label.trim();
    if (!entityType || !label) return [];

    return [`${entityType}: ${label}`];
  });

  return [
    section("Current thread summary", input.currentThread.summary ? [input.currentThread.summary] : []),
    section("Pinned context", pinnedContextLines),
    section("Recent current-thread messages", messageLines),
    section("Untrusted retrieved CRM facts", input.retrievedCrmFacts),
    section("Untrusted retrieved hiiire docs", input.retrievedDocs),
    section("Relevant thread summaries", input.relevantThreadSummaries ?? []),
  ]
    .filter(Boolean)
    .join("\n\n");
}
