"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAiAnalysisFinalizePayload = buildAiAnalysisFinalizePayload;
const ai_match_score_ts_1 = require("./ai-match-score.js");
function buildAiAnalysisFinalizePayload(input) {
    const baseMatchPercentage = (0, ai_match_score_ts_1.computeMatchPercentage)(input.analysis);
    const matchPercentage = (0, ai_match_score_ts_1.adjustMatchPercentageForSalary)(baseMatchPercentage, input.candidateDesiredSalary, input.vacancySalary);
    const baseRpcArgs = {
        job_id: input.jobId,
        candidate_id: input.candidateId,
        requested_by: input.requestedBy,
        overall_score: input.analysis.overallScore,
        match_percentage: matchPercentage,
        category_scores: input.analysis.categories,
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
