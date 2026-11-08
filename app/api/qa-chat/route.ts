import { NextResponse, type NextRequest } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { z } from "zod";

import { getConfirmedServerUser } from "@/lib/auth/server-email-confirmation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getQaSystemInstruction, getRelevantQaSections, type QaDocReference } from "@/lib/qa/knowledge";
import { firstUserFacingIssueMessage, zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";

export const runtime = "nodejs";

const HISTORY_WINDOW = 8;
const GEMINI_MAX_RETRIES = 4;
const GEMINI_RETRY_DELAY_MS = 1500;
const QA_INVALID_BODY_MESSAGE = "Проверьте вопрос и попробуйте ещё раз.";
const QA_SERVICE_ERROR_MESSAGE = "Не удалось получить ответ QA-ассистента. Попробуйте ещё раз.";
const QA_UNAUTHORIZED_MESSAGE = "Войдите в аккаунт, чтобы пользоваться QA-ассистентом.";
const QA_EMAIL_NOT_CONFIRMED_MESSAGE = "Подтвердите email, чтобы пользоваться QA-ассистентом.";

function isRetryableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("fetch failed") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("econnrefused") ||
    lower.includes("network") ||
    lower.includes("socket hang up")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const HistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .trim()
    .min(1, "Сообщение истории не должно быть пустым.")
    .max(4000, "Сообщение истории слишком длинное."),
});

const BodySchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Напишите вопрос для QA-ассистента.")
    .max(2000, "Вопрос не должен быть длиннее 2000 символов."),
  history: z
    .array(HistoryItemSchema)
    .max(60, "История слишком длинная. Обновите страницу и попробуйте ещё раз.")
    .default([]),
});

const AssistantResponseSchema = z.object({
  verdict: z.enum(["expected_behavior", "looks_like_bug", "not_documented"]),
  reasoning: z.string().trim().min(1).max(5000),
  docReferences: z
    .array(
      z.object({
        refId: z.string().trim().min(1).max(32),
      })
    )
    .max(12)
    .default([]),
  expectedBehavior: z.string().trim().max(5000).nullable().optional(),
  recommendation: z.string().trim().max(5000).nullable().optional(),
});

const GeminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    verdict: {
      type: Type.STRING,
      enum: ["expected_behavior", "looks_like_bug", "not_documented"],
    },
    reasoning: { type: Type.STRING },
    docReferences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          refId: { type: Type.STRING },
        },
        required: ["refId"],
      },
    },
    expectedBehavior: { type: Type.STRING, nullable: true },
    recommendation: { type: Type.STRING, nullable: true },
  },
  required: ["verdict", "reasoning", "docReferences"],
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const authRes = await getConfirmedServerUser(supabase);
    if (!authRes.ok) {
      return NextResponse.json(
        {
          error: authRes.reason === "pending_email" ? "EMAIL_NOT_CONFIRMED" : "UNAUTHORIZED",
          message: authRes.reason === "pending_email" ? QA_EMAIL_NOT_CONFIRMED_MESSAGE : QA_UNAUTHORIZED_MESSAGE,
        },
        { status: authRes.reason === "pending_email" ? 403 : 401 }
      );
    }

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      const issues = zodErrorToUserFacingIssues(parsed.error, QA_INVALID_BODY_MESSAGE);
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: firstUserFacingIssueMessage(issues, QA_INVALID_BODY_MESSAGE),
          issues,
        },
        { status: 400 }
      );
    }

    const message = parsed.data.message;
    const historyWindow = parsed.data.history.slice(-HISTORY_WINDOW);
    const retrievalQuery = [
      ...historyWindow.filter((item) => item.role === "user").map((item) => item.content),
      message,
    ].join("\n");

    const { references, contextBlock } = getRelevantQaSections(retrievalQuery, 8);
    const systemInstruction = buildSystemInstruction(getQaSystemInstruction());
    const model = process.env.GEMINI_MODEL_QA || "gemini-3.1-pro-preview";
    const apiKey = process.env.GEMINI_API_KEY;

    const prompt = buildPrompt({ message, historyWindow, contextBlock, references });

    // --- Try Gemini first ---
    let rawText: string | null = null;
    let provider: "gemini" | "deepseek" = "gemini";

    if (apiKey) {
      rawText = await callGemini({ apiKey, model, systemInstruction, prompt });
    } else {
      console.warn("[qa-chat] GEMINI_API_KEY not set, skipping Gemini");
    }

    // --- Fallback to DeepSeek ---
    if (!rawText) {
      provider = "deepseek";
      console.warn("[qa-chat] Falling back to DeepSeek");
      try {
        rawText = await callDeepSeek({ systemInstruction, prompt });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error("[qa-chat] DeepSeek fallback also failed", { message: msg, stack });
        return NextResponse.json({ error: "INTERNAL_ERROR", message: QA_SERVICE_ERROR_MESSAGE }, { status: 500 });
      }
    }

    console.info("[qa-chat] Response from provider", { provider });

    let modelJson: unknown;
    try {
      modelJson = parseModelJson(rawText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error("[qa-chat] error at stage: parse", { message: msg, stack });
      return NextResponse.json({ error: "INTERNAL_ERROR", message: QA_SERVICE_ERROR_MESSAGE }, { status: 500 });
    }

    let structured;
    try {
      structured = AssistantResponseSchema.parse(modelJson);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error("[qa-chat] error at stage: validation", { message: msg, stack });
      return NextResponse.json({ error: "INTERNAL_ERROR", message: QA_SERVICE_ERROR_MESSAGE }, { status: 500 });
    }

    const docReferences = resolveReferences(structured.docReferences, references);

    return NextResponse.json(
      {
        verdict: structured.verdict,
        reasoning: structured.reasoning,
        docReferences,
        expectedBehavior: structured.expectedBehavior ?? null,
        recommendation: structured.recommendation ?? null,
      },
      { status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[qa-chat] INTERNAL_ERROR", { message: msg, stack });
    return NextResponse.json({ error: "INTERNAL_ERROR", message: QA_SERVICE_ERROR_MESSAGE }, { status: 500 });
  }
}

function buildSystemInstruction(baseInstruction: string): string {
  return [
    baseInstruction,
    "",
    "Технические правила ответа:",
    "- Отвечай строго в JSON по схеме.",
    "- Для docReferences используй только refId из переданных секций.",
    "- Если нужного подтверждения в документации нет, вердикт должен быть not_documented.",
  ].join("\n");
}

function buildPrompt(input: {
  message: string;
  historyWindow: Array<{ role: "user" | "assistant"; content: string }>;
  contextBlock: string;
  references: QaDocReference[];
}): string {
  const historyText =
    input.historyWindow.length > 0
      ? input.historyWindow
          .map((item, index) => `${index + 1}. ${item.role === "user" ? "USER" : "ASSISTANT"}: ${item.content}`)
          .join("\n")
      : "Пусто";

  const refsLine =
    input.references.length > 0
      ? input.references.map((ref) => ref.refId).join(", ")
      : "Нет доступных refId (документация не найдена)";

  return [
    "Задача: определить, является ли наблюдаемое поведение багом, expected behavior, или не описано в документации.",
    "",
    "История диалога (последние сообщения):",
    historyText,
    "",
    "Текущий вопрос тестировщика:",
    input.message,
    "",
    "Доступные refId для ссылок:",
    refsLine,
    "",
    "Релевантные секции документации:",
    input.contextBlock || "Секции не найдены.",
    "",
    "Верни только JSON. Никакого Markdown.",
  ].join("\n");
}

function parseModelJson(rawText: string): unknown {
  if (!rawText) return {};
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? rawText.slice(start, end + 1) : rawText;
  return JSON.parse(candidate);
}

function resolveReferences(
  modelRefs: Array<{ refId: string }>,
  availableRefs: QaDocReference[]
): QaDocReference[] {
  const lookup = new Map<string, QaDocReference>();
  for (const ref of availableRefs) lookup.set(ref.refId, ref);

  const resolved: QaDocReference[] = [];
  for (const item of modelRefs) {
    const match = lookup.get(item.refId);
    if (!match) continue;
    if (resolved.some((existing) => existing.refId === match.refId)) continue;
    resolved.push(match);
  }

  return resolved;
}

async function callGemini(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
}): Promise<string | null> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });

  let response;
  for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: params.model,
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: GeminiResponseSchema,
          systemInstruction: params.systemInstruction,
        },
        contents: [{ role: "user", parts: [{ text: params.prompt }] }],
      });
      break;
    } catch (err) {
      if (!isRetryableGeminiError(err) || attempt === GEMINI_MAX_RETRIES) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error("[qa-chat] Gemini failed, will try DeepSeek fallback", {
          message: msg,
          stack,
          attempt,
          retryable: isRetryableGeminiError(err),
        });
        return null;
      }
      const delay = GEMINI_RETRY_DELAY_MS * attempt;
      console.warn("[qa-chat] Gemini request failed, retrying", {
        attempt,
        maxRetries: GEMINI_MAX_RETRIES,
        delayMs: delay,
        message: err instanceof Error ? err.message : String(err),
      });
      await sleep(delay);
    }
  }

  const rawText = (response?.text ?? "").trim();
  if (!rawText) {
    console.warn("[qa-chat] Gemini returned empty response, will try DeepSeek fallback", {
      hasCandidates: !!response?.candidates?.length,
    });
    return null;
  }

  return rawText;
}

async function callDeepSeek(params: {
  systemInstruction: string;
  prompt: string;
}): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const baseURL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const maxTokens = Number(process.env.DEEPSEEK_MAX_TOKENS || 4096);

  const client = new OpenAI({ apiKey, baseURL });

  const deepSeekSystem = [
    params.systemInstruction,
    "",
    "Return your answer strictly as valid JSON (no Markdown, no extra text).",
    "The user asks you to output json in the exact shape below.",
    "",
    "EXAMPLE JSON OUTPUT:",
    "{",
    '  "verdict": "expected_behavior",',
    '  "reasoning": "...",',
    '  "docReferences": [{"refId": "J001"}],',
    '  "expectedBehavior": "...",',
    '  "recommendation": "..."',
    "}",
  ].join("\n");

  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: deepSeekSystem },
      { role: "user", content: params.prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.trunc(maxTokens) : 4096,
  });

  const rawText = (resp.choices?.[0]?.message?.content ?? "").trim();
  if (!rawText) {
    throw new Error("DeepSeek returned empty content");
  }

  return rawText;
}
