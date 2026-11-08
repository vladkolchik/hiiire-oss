import type { AiAnalysis } from "./ai-analysis";
import type { CandidateDesiredSalaryForAi, VacancySalaryForAi } from "./ai-prompt";
import type { Json } from "./database.types";
import { adjustMatchPercentageForSalary, computeMatchPercentage } from "./ai-match-score.ts";

export function buildAiAnalysisFinalizePayload(input: {
  candidateId: string;
  jobId: string;
  requestedBy: string | null;
  analysis: AiAnalysis;
  provider: string;
  providerModel: string;
  tokensIn: number | null;
  tokensOut: number | null;
  candidateDesiredSalary?: CandidateDesiredSalaryForAi;
  vacancySalary?: VacancySalaryForAi;
}) {
  const baseMatchPercentage = computeMatchPercentage(input.analysis);
  const matchPercentage = adjustMatchPercentageForSalary(
    baseMatchPercentage,
    input.candidateDesiredSalary,
    input.vacancySalary
  );
  const baseRpcArgs = {
    job_id: input.jobId,
    candidate_id: input.candidateId,
    requested_by: input.requestedBy,
    overall_score: input.analysis.overallScore,
    match_percentage: matchPercentage,
    category_scores: input.analysis.categories as unknown as Json,
    summary: input.analysis.summary,
    verdict: input.analysis.verdict,
    reasons: input.analysis.reasons,
    prospects: input.analysis.prospects,
    strengths: input.analysis.strengths,
    weaknesses: input.analysis.weaknesses,
    recommendations: input.analysis.recommendations,
    provider: input.provider,
    provider_model: input.providerModel,
  };

  return {
    matchPercentage,
    rpcArgs: {
      ...baseRpcArgs,
      tokens_in: input.tokensIn,
      tokens_out: input.tokensOut,
    },
    legacyRpcArgs: baseRpcArgs,
    fallbackInput: {
      analysis: input.analysis,
      matchPercentage,
      provider: input.provider,
      providerModel: input.providerModel,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
    },
  };
}

export type AiAnalysisFallbackFinalizeInput = ReturnType<typeof buildAiAnalysisFinalizePayload>["fallbackInput"];
