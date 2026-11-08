export type CandidateProfileParserEnv = Partial<Record<string, string | undefined>>;

export type CandidateProfileParserConfig = {
  apiKey: string | null;
  baseURL: string;
  model: string;
  maxTokens: number;
  requestTimeoutMs: number;
  totalTimeoutMs: number;
  concurrencyLimit: number;
  queueTimeoutMs: number;
};

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_MAX_TOKENS = 3000;
const DEFAULT_REQUEST_TIMEOUT_MS = 6000;
const DEFAULT_TOTAL_TIMEOUT_MS = 12000;
const DEFAULT_CONCURRENCY_LIMIT = 1000;
const DEFAULT_QUEUE_TIMEOUT_MS = 3000;

export function getCandidateProfileParserConfig(
  env: CandidateProfileParserEnv = process.env,
): CandidateProfileParserConfig {
  return {
    apiKey: cleanOptional(env.DEEPSEEK_API_KEY),
    baseURL: cleanOptional(env.DEEPSEEK_CANDIDATE_PARSER_BASE_URL) ?? cleanOptional(env.DEEPSEEK_BASE_URL) ?? DEFAULT_BASE_URL,
    model: cleanOptional(env.DEEPSEEK_CANDIDATE_PARSER_MODEL) ?? DEFAULT_MODEL,
    maxTokens: positiveInteger(env.DEEPSEEK_CANDIDATE_PARSER_MAX_TOKENS, DEFAULT_MAX_TOKENS),
    requestTimeoutMs: positiveInteger(env.DEEPSEEK_CANDIDATE_PARSER_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    totalTimeoutMs: positiveInteger(env.DEEPSEEK_CANDIDATE_PARSER_TOTAL_TIMEOUT_MS, DEFAULT_TOTAL_TIMEOUT_MS),
    concurrencyLimit: positiveInteger(env.DEEPSEEK_CANDIDATE_PARSER_CONCURRENCY_LIMIT, DEFAULT_CONCURRENCY_LIMIT),
    queueTimeoutMs: positiveInteger(env.DEEPSEEK_CANDIDATE_PARSER_QUEUE_TIMEOUT_MS, DEFAULT_QUEUE_TIMEOUT_MS),
  };
}

export function resetCandidateProfileParserConfigForTests(): void {
  // Kept as a stable test hook in case config caching is introduced later.
}

function cleanOptional(value: string | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned ? cleaned : null;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}
