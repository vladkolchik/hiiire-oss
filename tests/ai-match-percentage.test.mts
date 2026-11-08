import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAiAnalysisFinalizePayload } from "../worker/src/ai-finalize-payload.ts";
import type { AiAnalysis } from "../worker/src/ai-analysis.ts";
import { compareSalaryForMatchAdjustment, computeMatchPercentage } from "../worker/src/ai-match-score.ts";

function analysis(input: {
  includedInMatch: boolean;
  criterionState: "required" | "optional" | "not_required";
  criterionEvidence: string[];
  scores?: Partial<Record<keyof AiAnalysis["categories"], number>>;
}): AiAnalysis {
  return {
    overallScore: 0,
    categories: {
      skills: { score: input.scores?.skills ?? 80, feedback: "skills", details: [] },
      experience: { score: input.scores?.experience ?? 70, feedback: "experience", details: [] },
      education: {
        score: input.scores?.education ?? 0,
        feedback: "education",
        details: [],
        applicable: input.includedInMatch,
        includedInMatch: input.includedInMatch,
        criterionState: input.criterionState,
        criterionEvidence: input.criterionEvidence,
      },
      achievements: { score: input.scores?.achievements ?? 60, feedback: "achievements", details: [] },
      cultural_fit: { score: input.scores?.cultural_fit ?? 90, feedback: "culture", details: [] },
    },
    summary: "summary",
    verdict: "verdict",
    reasons: ["one", "two", "three"],
    prospects: "prospects",
    strengths: ["strength"],
    weaknesses: ["weakness"],
    recommendations: ["recommendation"],
  };
}

test("match percentage keeps legacy weights when education is included", () => {
  assert.equal(
    computeMatchPercentage(
      analysis({
        includedInMatch: true,
        criterionState: "required",
        criterionEvidence: ["высшее образование обязательно"],
      })
    ),
    68
  );
});

test("match percentage normalizes remaining weights when education is excluded", () => {
  assert.equal(
    computeMatchPercentage(
      analysis({
        includedInMatch: false,
        criterionState: "not_required",
        criterionEvidence: [],
      })
    ),
    75
  );
});

test("match percentage excludes education when LLM returns optional but includedInMatch true", () => {
  assert.equal(
    computeMatchPercentage(
      analysis({
        includedInMatch: true,
        criterionState: "optional",
        criterionEvidence: ["профильное образование будет преимуществом"],
      })
    ),
    75
  );
});

test("match percentage excludes education when LLM returns not_required but includedInMatch true", () => {
  assert.equal(
    computeMatchPercentage(
      analysis({
        includedInMatch: true,
        criterionState: "not_required",
        criterionEvidence: ["образование не требуется"],
      })
    ),
    75
  );
});

test("match percentage excludes education when required evidence is empty", () => {
  assert.equal(
    computeMatchPercentage(
      analysis({
        includedInMatch: true,
        criterionState: "required",
        criterionEvidence: [],
      })
    ),
    75
  );
});

test("match percentage excludes education when required evidence is blank", () => {
  assert.equal(
    computeMatchPercentage(
      analysis({
        includedInMatch: true,
        criterionState: "required",
        criterionEvidence: ["", "   "],
      })
    ),
    75
  );
});

test("match percentage divides by effective weight before rounding", () => {
  assert.equal(
    computeMatchPercentage(
      analysis({
        includedInMatch: false,
        criterionState: "not_required",
        criterionEvidence: [],
        scores: {
          skills: 50,
          experience: 50,
          achievements: 50,
          cultural_fit: 64,
        },
      })
    ),
    52
  );
});

test("worker reads and forwards mandatory requirements to every provider path", () => {
  const source = readFileSync("worker/src/index.ts", "utf8");

  assert.match(source, /select\("id,description,requirements,mandatory_requirements_text,company_id/);
  assert.match(source, /vacancyMandatoryRequirementsText/);
  assert.match(source, /analyzeResumeWithOpenAI\([\s\S]*vacancyMandatoryRequirementsText/);
  assert.match(source, /analyzeResumeWithGemini\([\s\S]*vacancyMandatoryRequirementsText/);
  assert.match(source, /analyzeResumeWithDeepSeek\([\s\S]*vacancyMandatoryRequirementsText/);
});

test("worker reads and forwards structured salary context to every provider path", () => {
  const source = readFileSync("worker/src/index.ts", "utf8");

  assert.match(
    source,
    /select\("id,vacancy_id,resume_text,hh_auto_survey_text,desired_salary_text,desired_salary_amount,desired_salary_currency,desired_salary_source"\)/
  );
  assert.match(source, /const candidateDesiredSalary(?::[^=]+)?\s*=\s*\{/);
  assert.match(source, /text:\s*candidate\.desired_salary_text/);
  assert.match(source, /amount:\s*candidate\.desired_salary_amount/);
  assert.match(source, /currency:\s*candidate\.desired_salary_currency/);
  assert.match(source, /source:\s*candidate\.desired_salary_source/);
  assert.match(
    source,
    /select\("id,description,requirements,mandatory_requirements_text,company_id,salary_min,salary_max,salary_currency,salary_period,salary_tax"\)/
  );
  assert.match(source, /const vacancySalary(?::[^=]+)?\s*=\s*\{/);
  assert.match(source, /min:\s*vacancy\.salary_min/);
  assert.match(source, /max:\s*vacancy\.salary_max/);
  assert.match(source, /currency:\s*vacancy\.salary_currency/);
  assert.match(source, /period:\s*vacancy\.salary_period/);
  assert.match(source, /tax:\s*vacancy\.salary_tax/);
  assert.match(source, /analyzeResumeWithOpenAI\([\s\S]*candidateDesiredSalary[\s\S]*vacancySalary/);
  assert.match(source, /analyzeResumeWithGemini\([\s\S]*candidateDesiredSalary[\s\S]*vacancySalary/);
  assert.match(source, /analyzeResumeWithDeepSeek\([\s\S]*candidateDesiredSalary[\s\S]*vacancySalary/);
});

test("worker uses a final analysis payload helper instead of ad hoc finalize objects", () => {
  const source = readFileSync("worker/src/index.ts", "utf8");

  assert.match(source, /buildAiAnalysisFinalizePayload/);
});

test("worker forwards structured salary context to final match percentage payload", () => {
  const source = readFileSync("worker/src/index.ts", "utf8");

  assert.match(source, /const candidateDesiredSalary(?::[^=]+)?\s*=/);
  assert.match(source, /const vacancySalary(?::[^=]+)?\s*=/);
  assert.match(source, /buildAiAnalysisFinalizePayload\([\s\S]*candidateDesiredSalary[\s\S]*vacancySalary/);
});

test("fallback finalize preserves status transition, job completion, and idempotent credit ledger", () => {
  const source = readFileSync("worker/src/index.ts", "utf8");

  assert.match(source, /function fallbackFinalize/);
  assert.match(source, /\.from\("candidates"\)[\s\S]*\.update\(\{\s*status:\s*"reviewing"/);
  assert.match(source, /\.eq\("status",\s*"new"\)/);
  assert.match(source, /\.from\("credit_ledger"\)[\s\S]*\.select\("id"\)/);
  assert.match(source, /\.from\("credit_ledger"\)[\s\S]*\.insert\(/);
  assert.match(source, /\.from\("jobs_ai"\)[\s\S]*\.update\(\{\s*status:\s*"done"/);
});

test("finalize payload preserves education metadata and normalized match percentage", () => {
  const sourceAnalysis = analysis({
    includedInMatch: true,
    criterionState: "optional",
    criterionEvidence: ["профильное образование будет преимуществом"],
  });
  const payload = buildAiAnalysisFinalizePayload({
    candidateId: "candidate-1",
    jobId: "job-1",
    requestedBy: "user-1",
    analysis: sourceAnalysis,
    provider: "deepseek",
    providerModel: "deepseek-v4-flash",
    tokensIn: 123,
    tokensOut: 456,
  });

  const categoryScores = payload.rpcArgs.category_scores as AiAnalysis["categories"];

  assert.equal(payload.matchPercentage, 75);
  assert.equal(payload.matchPercentage, computeMatchPercentage(sourceAnalysis));
  assert.equal(payload.rpcArgs.match_percentage, 75);
  assert.equal(categoryScores.education.includedInMatch, true);
  assert.equal(categoryScores.education.criterionState, "optional");
  assert.equal(payload.rpcArgs.summary, "summary");
  assert.equal(payload.rpcArgs.verdict, "verdict");
  assert.deepEqual(payload.rpcArgs.reasons, ["one", "two", "three"]);
  assert.equal(payload.rpcArgs.provider, "deepseek");
  assert.equal(payload.rpcArgs.provider_model, "deepseek-v4-flash");
  assert.equal(payload.rpcArgs.tokens_in, 123);
  assert.equal(payload.rpcArgs.tokens_out, 456);
  assert.equal(payload.legacyRpcArgs.provider_model, "deepseek-v4-flash");
  assert.equal(payload.fallbackInput.matchPercentage, 75);
  assert.equal(payload.fallbackInput.tokensIn, 123);
});

test("low overallScore alone does not lower persisted match percentage without salary context", () => {
  const sourceAnalysis = analysis({
    includedInMatch: false,
    criterionState: "not_required",
    criterionEvidence: [],
    scores: {
      skills: 95,
      experience: 95,
      achievements: 95,
      cultural_fit: 95,
    },
  });
  sourceAnalysis.overallScore = 30;

  const payload = buildAiAnalysisFinalizePayload({
    candidateId: "candidate-1",
    jobId: "job-1",
    requestedBy: "user-1",
    analysis: sourceAnalysis,
    provider: "deepseek",
    providerModel: "deepseek-v4-flash",
    tokensIn: null,
    tokensOut: null,
  });

  assert.equal(payload.matchPercentage, 95);
  assert.equal(payload.rpcArgs.match_percentage, 95);
  assert.equal(payload.fallbackInput.matchPercentage, 95);
});

function buildOverBudgetSalaryPayload(input: { text: string; vacancyTax: "gross" | "net" }) {
  return buildAiAnalysisFinalizePayload({
    candidateId: "candidate-1",
    jobId: "job-1",
    requestedBy: "user-1",
    analysis: analysis({
      includedInMatch: false,
      criterionState: "not_required",
      criterionEvidence: [],
      scores: {
        skills: 95,
        experience: 95,
        achievements: 95,
        cultural_fit: 95,
      },
    }),
    provider: "deepseek",
    providerModel: "deepseek-v4-flash",
    tokensIn: null,
    tokensOut: null,
    candidateDesiredSalary: {
      text: input.text,
      amount: 350000,
      currency: "RUB",
      source: "hh",
    },
    vacancySalary: {
      min: 200000,
      max: 300000,
      currency: "RUB",
      period: "month",
      tax: input.vacancyTax,
    },
  });
}

test("over-budget salary text with ambiguous с учетом НДФЛ leaves match percentage unchanged", () => {
  const payload = buildOverBudgetSalaryPayload({
    text: "от 350 000 RUB с учетом НДФЛ",
    vacancyTax: "net",
  });

  assert.equal(payload.matchPercentage, 95);
  assert.equal(payload.rpcArgs.match_percentage, 95);
  assert.equal(payload.fallbackInput.matchPercentage, 95);
});

test("over-budget salary text before НДФЛ lowers persisted match percentage for gross vacancy", () => {
  const payload = buildOverBudgetSalaryPayload({
    text: "от 350 000 RUB до вычета НДФЛ",
    vacancyTax: "gross",
  });

  assert.equal(payload.matchPercentage, 70);
  assert.equal(payload.rpcArgs.match_percentage, 70);
  assert.equal(payload.fallbackInput.matchPercentage, 70);
});

test("over-budget salary text after НДФЛ lowers persisted match percentage for net vacancy", () => {
  for (const text of ["от 350 000 RUB после вычета НДФЛ", "от 350 000 RUB за вычетом НДФЛ"]) {
    const payload = buildOverBudgetSalaryPayload({
      text,
      vacancyTax: "net",
    });

    assert.equal(payload.matchPercentage, 70);
    assert.equal(payload.rpcArgs.match_percentage, 70);
    assert.equal(payload.fallbackInput.matchPercentage, 70);
  }
});

test("over-budget salary text with mismatched tax leaves match percentage unchanged", () => {
  const payload = buildOverBudgetSalaryPayload({
    text: "от 350 000 RUB до вычета НДФЛ",
    vacancyTax: "net",
  });

  assert.equal(payload.matchPercentage, 95);
  assert.equal(payload.rpcArgs.match_percentage, 95);
  assert.equal(payload.fallbackInput.matchPercentage, 95);
});

test("comparable over-budget salary text with сейчас still lowers persisted match percentage", () => {
  const payload = buildAiAnalysisFinalizePayload({
    candidateId: "candidate-1",
    jobId: "job-1",
    requestedBy: "user-1",
    analysis: analysis({
      includedInMatch: false,
      criterionState: "not_required",
      criterionEvidence: [],
      scores: {
        skills: 95,
        experience: 95,
        achievements: 95,
        cultural_fit: 95,
      },
    }),
    provider: "deepseek",
    providerModel: "deepseek-v4-flash",
    tokensIn: null,
    tokensOut: null,
    candidateDesiredSalary: {
      text: "сейчас хочу от 350 000 RUB net",
      amount: 350000,
      currency: "RUB",
      source: "hh",
    },
    vacancySalary: {
      min: 200000,
      max: 300000,
      currency: "RUB",
      period: "month",
      tax: "net",
    },
  });

  assert.equal(payload.matchPercentage, 70);
  assert.equal(payload.rpcArgs.match_percentage, 70);
  assert.equal(payload.fallbackInput.matchPercentage, 70);
});

test("comparable over-budget salary text with деньгами still lowers persisted match percentage", () => {
  const payload = buildAiAnalysisFinalizePayload({
    candidateId: "candidate-1",
    jobId: "job-1",
    requestedBy: "user-1",
    analysis: analysis({
      includedInMatch: false,
      criterionState: "not_required",
      criterionEvidence: [],
      scores: {
        skills: 95,
        experience: 95,
        achievements: 95,
        cultural_fit: 95,
      },
    }),
    provider: "deepseek",
    providerModel: "deepseek-v4-flash",
    tokensIn: null,
    tokensOut: null,
    candidateDesiredSalary: {
      text: "от 350 000 RUB деньгами на руки",
      amount: 350000,
      currency: "RUB",
      source: "hh",
    },
    vacancySalary: {
      min: 200000,
      max: 300000,
      currency: "RUB",
      period: "month",
      tax: "net",
    },
  });

  assert.equal(payload.matchPercentage, 70);
  assert.equal(payload.rpcArgs.match_percentage, 70);
  assert.equal(payload.fallbackInput.matchPercentage, 70);
});

test("explicit non-monthly candidate salary periods keep over-budget salary incomparable", () => {
  for (const text of ["от 350 000 RUB net за день", "от 350 000 RUB net в час"]) {
    const payload = buildAiAnalysisFinalizePayload({
      candidateId: "candidate-1",
      jobId: "job-1",
      requestedBy: "user-1",
      analysis: analysis({
        includedInMatch: false,
        criterionState: "not_required",
        criterionEvidence: [],
        scores: {
          skills: 95,
          experience: 95,
          achievements: 95,
          cultural_fit: 95,
        },
      }),
      provider: "deepseek",
      providerModel: "deepseek-v4-flash",
      tokensIn: null,
      tokensOut: null,
      candidateDesiredSalary: {
        text,
        amount: 350000,
        currency: "RUB",
        source: "hh",
      },
      vacancySalary: {
        min: 200000,
        max: 300000,
        currency: "RUB",
        period: "month",
        tax: "net",
      },
    });

    assert.equal(payload.matchPercentage, 95);
    assert.equal(payload.rpcArgs.match_percentage, 95);
    assert.equal(payload.fallbackInput.matchPercentage, 95);
  }
});

test("candidate salary period detection recognizes explicit Russian and English non-monthly markers", () => {
  const markers = [
    "от 350 000 RUB net в час",
    "от 350 000 RUB net за час",
    "от 350 000 RUB net часовая",
    "от 350 000 RUB net в день",
    "от 350 000 RUB net за день",
    "от 350 000 RUB net дневная",
    "от 350 000 RUB net в неделю",
    "от 350 000 RUB net неделя",
    "от 350 000 RUB net в год",
    "от 350 000 RUB net годовая",
    "от 350 000 RUB net за смену",
    "от 350 000 RUB net сменная",
    "350 000 RUB net hourly",
    "350 000 RUB net daily",
    "350 000 RUB net weekly",
    "350 000 RUB net yearly",
    "350 000 RUB net shift",
  ];

  for (const text of markers) {
    assert.deepEqual(
      compareSalaryForMatchAdjustment(
        {
          text,
          amount: 350000,
          currency: "RUB",
          source: "hh",
        },
        {
          min: 200000,
          max: 300000,
          currency: "RUB",
          period: "month",
          tax: "net",
        }
      ),
      { comparable: false, mismatch: false, reason: "candidate_period_incomparable" }
    );
  }
});

test("comparable salary mismatch lowers persisted match percentage in every finalize path", () => {
  const sourceAnalysis = analysis({
    includedInMatch: false,
    criterionState: "not_required",
    criterionEvidence: [],
    scores: {
      skills: 95,
      experience: 95,
      achievements: 95,
      cultural_fit: 95,
    },
  });
  sourceAnalysis.overallScore = 30;

  const payload = buildAiAnalysisFinalizePayload({
    candidateId: "candidate-1",
    jobId: "job-1",
    requestedBy: "user-1",
    analysis: sourceAnalysis,
    provider: "deepseek",
    providerModel: "deepseek-v4-flash",
    tokensIn: 123,
    tokensOut: 456,
    candidateDesiredSalary: {
      text: "от 350 000 RUB net",
      amount: 350000,
      currency: "RUB",
      source: "hh",
    },
    vacancySalary: {
      min: 200000,
      max: 300000,
      currency: "RUB",
      period: "month",
      tax: "net",
    },
  });

  assert.equal(payload.matchPercentage, 70);
  assert.equal(payload.rpcArgs.match_percentage, 70);
  assert.equal(payload.legacyRpcArgs.match_percentage, 70);
  assert.equal(payload.fallbackInput.matchPercentage, 70);
  assert.equal(sourceAnalysis.overallScore, 30);
  assert.equal(sourceAnalysis.categories.skills.score, 95);
});

test("incomparable salary context leaves match percentage unchanged", () => {
  const baseInput = {
    candidateId: "candidate-1",
    jobId: "job-1",
    requestedBy: "user-1",
    analysis: analysis({
      includedInMatch: false,
      criterionState: "not_required",
      criterionEvidence: [],
      scores: {
        skills: 95,
        experience: 95,
        achievements: 95,
        cultural_fit: 95,
      },
    }),
    provider: "deepseek",
    providerModel: "deepseek-v4-flash",
    tokensIn: null,
    tokensOut: null,
  };

  const differentCurrency = buildAiAnalysisFinalizePayload({
    ...baseInput,
    candidateDesiredSalary: {
      text: "от 350 000 USD net",
      amount: 350000,
      currency: "USD",
      source: "hh",
    },
    vacancySalary: {
      min: 200000,
      max: 300000,
      currency: "RUB",
      period: "month",
      tax: "net",
    },
  });
  const missingCandidateTax = buildAiAnalysisFinalizePayload({
    ...baseInput,
    candidateDesiredSalary: {
      text: "от 350 000 RUB",
      amount: 350000,
      currency: "RUB",
      source: "hh",
    },
    vacancySalary: {
      min: 200000,
      max: 300000,
      currency: "RUB",
      period: "month",
      tax: "net",
    },
  });
  const missingVacancyTax = buildAiAnalysisFinalizePayload({
    ...baseInput,
    candidateDesiredSalary: {
      text: "от 350 000 RUB net",
      amount: 350000,
      currency: "RUB",
      source: "hh",
    },
    vacancySalary: {
      min: 200000,
      max: 300000,
      currency: "RUB",
      period: "month",
      tax: null,
    },
  });

  assert.equal(differentCurrency.matchPercentage, 95);
  assert.equal(missingCandidateTax.matchPercentage, 95);
  assert.equal(missingVacancyTax.matchPercentage, 95);
});

test("matching comparable salary leaves match percentage unchanged", () => {
  const payload = buildAiAnalysisFinalizePayload({
    candidateId: "candidate-1",
    jobId: "job-1",
    requestedBy: "user-1",
    analysis: analysis({
      includedInMatch: false,
      criterionState: "not_required",
      criterionEvidence: [],
      scores: {
        skills: 95,
        experience: 95,
        achievements: 95,
        cultural_fit: 95,
      },
    }),
    provider: "deepseek",
    providerModel: "deepseek-v4-flash",
    tokensIn: null,
    tokensOut: null,
    candidateDesiredSalary: {
      text: "от 250 000 RUB gross",
      amount: 250000,
      currency: "RUB",
      source: "hh",
    },
    vacancySalary: {
      min: 200000,
      max: 300000,
      currency: "RUB",
      period: "month",
      tax: "gross",
    },
  });

  assert.equal(payload.matchPercentage, 95);
  assert.equal(payload.rpcArgs.match_percentage, 95);
  assert.equal(payload.fallbackInput.matchPercentage, 95);
});
