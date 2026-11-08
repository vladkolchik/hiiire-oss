import { getCandidateProfileParserConfig, type CandidateProfileParserConfig } from "./profile-parser-config.ts";
import {
  DeepSeekProfileClientError,
  parseProfileWithDeepSeek,
  type CandidateProfileContactInput,
  type DeepSeekProfileMeta,
  type DeepSeekProfileFailureReason,
  type DeepSeekProfileFetch,
} from "./deepseek-profile-client.ts";
import {
  extractDesiredSalaryFromText,
  normalizeDesiredSalaryFields,
  type CandidateDesiredSalaryFields,
} from "./desired-salary.ts";
import { sanitizeResumeForLlm, type ResumeSafety } from "../security/resume-prompt-injection.ts";

export type ParsedCandidateContact = {
  type: string;
  value: string;
  label?: string;
};

export type ParsedCandidateProfileMeta = {
  source: "deepseek" | "regex_fallback";
  model: string;
  fallbackReason: DeepSeekProfileFailureReason | null;
  attempts: number;
  tokensInTotal: number | null;
  tokensOutTotal: number | null;
  durationMs: number;
  safety: ResumeSafety;
  sanitizedResumeSha256: string;
};

export type ParsedCandidateProfile = {
  name: string;
  position: string;
  contacts: ParsedCandidateContact[];
  desiredSalary: CandidateDesiredSalaryFields;
  meta: ParsedCandidateProfileMeta;
};

export type CandidateProfileParserTestHooks = {
  normalizeCandidateContactForStorage?: (contact: CandidateProfileContactInput) => ParsedCandidateContact | null;
  extractCandidateBasicsFromText?: (resumeText: string) => { name: string; position: string };
  extractCandidateContactsFromText?: (resumeText: string) => ParsedCandidateContact[];
};

export async function parseCandidateProfileFromResumeText(input: {
  resumeText: string;
  requestId: string;
  deadlineAt?: number;
  config?: CandidateProfileParserConfig;
  fetchImpl?: DeepSeekProfileFetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  testHooks?: CandidateProfileParserTestHooks;
}): Promise<ParsedCandidateProfile> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const resumeText = String(input.resumeText ?? "");
  const sanitized = sanitizeResumeForLlm(resumeText);
  const config = input.config ?? getCandidateProfileParserConfig();
  let deepSeekMeta: DeepSeekProfileMeta | null = null;

  if (typeof input.deadlineAt === "number" && now() >= input.deadlineAt) {
    return await regexFallback({
      resumeText,
      config,
      startedAt,
      now,
      safety: sanitized.safety,
      sanitizedResumeSha256: sanitized.normalizedSha256,
      reason: "deadline_exceeded",
      attempts: 0,
      tokensInTotal: null,
      tokensOutTotal: null,
      testHooks: input.testHooks,
    });
  }

  try {
    const deepSeekResult = await parseProfileWithDeepSeek({
      resumeText: sanitized.sanitizedText,
      requestId: input.requestId,
      config,
      deadlineAt: input.deadlineAt,
      fetchImpl: input.fetchImpl,
      now,
      sleep: input.sleep,
    });
    deepSeekMeta = deepSeekResult.meta;

    const normalize = input.testHooks?.normalizeCandidateContactForStorage ?? (await loadContactNormalizer());
    const contacts = dedupeContacts(
      deepSeekResult.profile.contacts
        .map((contact) => normalize(contact))
        .filter((contact): contact is ParsedCandidateContact => Boolean(contact)),
    );
    const regexDesiredSalary = extractDesiredSalaryFromText(resumeText);
    const aiDesiredSalary = hasDeepSeekDesiredSalary(deepSeekResult.profile)
      ? normalizeDesiredSalaryFields({
          text: deepSeekResult.profile.desiredSalaryText,
          amount: deepSeekResult.profile.desiredSalaryAmount,
          currency: deepSeekResult.profile.desiredSalaryCurrency,
          source: "ai_parser",
        })
      : null;

    return {
      name: clampProfileText(deepSeekResult.profile.name ?? "Кандидат"),
      position: clampProfileText(deepSeekResult.profile.position ?? "Кандидат"),
      contacts,
      desiredSalary: aiDesiredSalary ? aiDesiredSalary : regexDesiredSalary,
      meta: {
        source: "deepseek",
        model: deepSeekResult.meta.model,
        fallbackReason: null,
        attempts: deepSeekResult.meta.attempts,
        tokensInTotal: deepSeekResult.meta.tokensInTotal,
        tokensOutTotal: deepSeekResult.meta.tokensOutTotal,
        durationMs: deepSeekResult.meta.durationMs,
        safety: sanitized.safety,
        sanitizedResumeSha256: sanitized.normalizedSha256,
      },
    };
  } catch (error) {
    const failure = normalizeFailure(error, deepSeekMeta);
    return await regexFallback({
      resumeText,
      config,
      model: failure.model,
      startedAt,
      now,
      safety: sanitized.safety,
      sanitizedResumeSha256: sanitized.normalizedSha256,
      reason: failure.reason,
      attempts: failure.attempts,
      tokensInTotal: failure.tokensInTotal,
      tokensOutTotal: failure.tokensOutTotal,
      testHooks: input.testHooks,
    });
  }
}

async function regexFallback(input: {
  resumeText: string;
  config: CandidateProfileParserConfig;
  model?: string;
  startedAt: number;
  now: () => number;
  safety: ResumeSafety;
  sanitizedResumeSha256: string;
  reason: DeepSeekProfileFailureReason;
  attempts: number;
  tokensInTotal: number | null;
  tokensOutTotal: number | null;
  testHooks?: CandidateProfileParserTestHooks;
}): Promise<ParsedCandidateProfile> {
  const extractBasics = input.testHooks?.extractCandidateBasicsFromText ?? (await loadBasicsExtractor());
  const extractContacts = input.testHooks?.extractCandidateContactsFromText ?? (await loadContactsExtractor());
  const basics = extractBasics(input.resumeText);

  return {
    name: clampProfileText(basics.name || "Кандидат"),
    position: clampProfileText(basics.position || "Кандидат"),
    contacts: dedupeContacts(extractContacts(input.resumeText)),
    desiredSalary: extractDesiredSalaryFromText(input.resumeText),
    meta: {
      source: "regex_fallback",
      model: input.model ?? input.config.model,
      fallbackReason: input.reason,
      attempts: input.attempts,
      tokensInTotal: input.tokensInTotal,
      tokensOutTotal: input.tokensOutTotal,
      durationMs: Math.max(0, input.now() - input.startedAt),
      safety: input.safety,
      sanitizedResumeSha256: input.sanitizedResumeSha256,
    },
  };
}

function hasDeepSeekDesiredSalary(profile: {
  desiredSalaryText?: string | null;
  desiredSalaryAmount?: number | null;
  desiredSalaryCurrency?: string | null;
  desiredSalaryProvided?: boolean;
}): boolean {
  return profile.desiredSalaryProvided === true;
}

function normalizeFailure(error: unknown, deepSeekMeta: DeepSeekProfileMeta | null): {
  reason: DeepSeekProfileFailureReason;
  attempts: number;
  tokensInTotal: number | null;
  tokensOutTotal: number | null;
  model?: string;
} {
  if (error instanceof DeepSeekProfileClientError) {
    return {
      reason: error.reason,
      attempts: error.attempts,
      tokensInTotal: error.tokensInTotal,
      tokensOutTotal: error.tokensOutTotal,
      model: error.model,
    };
  }

  if (deepSeekMeta) {
    return {
      reason: "unexpected_error",
      attempts: deepSeekMeta.attempts,
      tokensInTotal: deepSeekMeta.tokensInTotal,
      tokensOutTotal: deepSeekMeta.tokensOutTotal,
      model: deepSeekMeta.model,
    };
  }

  return {
    reason: "unexpected_error",
    attempts: 0,
    tokensInTotal: null,
    tokensOutTotal: null,
  };
}

async function loadContactNormalizer(): Promise<(contact: CandidateProfileContactInput) => ParsedCandidateContact | null> {
  const mod = (await import("./contact-normalization.ts")) as {
    normalizeCandidateContactForStorage: (contact: CandidateProfileContactInput) => ParsedCandidateContact | null;
  };
  return mod.normalizeCandidateContactForStorage;
}

async function loadBasicsExtractor(): Promise<(resumeText: string) => { name: string; position: string }> {
  const mod = (await import("./extract-candidate-basics.ts")) as {
    extractCandidateBasicsFromText: (resumeText: string) => { name: string; position: string };
  };
  return mod.extractCandidateBasicsFromText;
}

async function loadContactsExtractor(): Promise<(resumeText: string) => ParsedCandidateContact[]> {
  const mod = (await import("../contacts/extract-candidate-contacts.ts")) as {
    extractCandidateContactsFromText: (resumeText: string) => ParsedCandidateContact[];
  };
  return mod.extractCandidateContactsFromText;
}

function clampProfileText(value: string): string {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  return (cleaned || "Кандидат").slice(0, 120);
}

function dedupeContacts(contacts: ParsedCandidateContact[], max = 30): ParsedCandidateContact[] {
  const out: ParsedCandidateContact[] = [];
  const seen = new Set<string>();
  for (const contact of contacts) {
    const type = String(contact.type ?? "").trim();
    const value = String(contact.value ?? "").trim();
    if (!type || !value) continue;
    const label = contact.label ? String(contact.label).trim().slice(0, 120) : undefined;
    const key = `${type.toLowerCase()}\u0000${value}\u0000${label ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label ? { type, value, label } : { type, value });
    if (out.length >= max) break;
  }
  return out;
}
