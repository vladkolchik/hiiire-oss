import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { AiAnalysisSchemaParsed } from "../worker/src/ai-analysis.ts";
import { buildAiAnalysisPrompt } from "../worker/src/ai-prompt.ts";

test("AI analysis schema requires education match metadata", () => {
  const parsed = AiAnalysisSchemaParsed.parse({
    overallScore: 75,
    categories: {
      skills: { score: 80, feedback: "Навыки подходят", details: [] },
      experience: { score: 70, feedback: "Опыт частично подходит", details: [] },
      education: {
        score: 0,
        feedback: "В вакансии нет требования к образованию, поэтому категория не влияла на итоговую оценку.",
        details: [],
        applicable: false,
        includedInMatch: false,
        criterionState: "not_required",
        criterionEvidence: [],
      },
      achievements: { score: 60, feedback: "Есть отдельные результаты", details: [] },
      cultural_fit: { score: 90, feedback: "Формат подходит", details: [] },
    },
    summary: "Кандидат подходит по ключевым параметрам.",
    verdict: "Можно рассмотреть.",
    reasons: ["Навыки близки", "Опыт релевантен", "Образование не требовалось"],
    prospects: "Перспективы хорошие.",
    strengths: ["Опыт"],
    weaknesses: ["Мало метрик"],
    recommendations: ["Уточнить детали опыта"],
  });

  assert.equal(parsed.categories.education.includedInMatch, false);
  assert.equal(parsed.categories.education.criterionState, "not_required");
});

test("AI analysis schema rejects education without match metadata", () => {
  assert.throws(() =>
    AiAnalysisSchemaParsed.parse({
      overallScore: 75,
      categories: {
        skills: { score: 80, feedback: "Навыки подходят", details: [] },
        experience: { score: 70, feedback: "Опыт частично подходит", details: [] },
        education: { score: 0, feedback: "Нет данных", details: [] },
        achievements: { score: 60, feedback: "Есть отдельные результаты", details: [] },
        cultural_fit: { score: 90, feedback: "Формат подходит", details: [] },
      },
      summary: "Кандидат подходит по ключевым параметрам.",
      verdict: "Можно рассмотреть.",
      reasons: ["Навыки близки", "Опыт релевантен", "Образование не требовалось"],
      prospects: "Перспективы хорошие.",
      strengths: ["Опыт"],
      weaknesses: ["Мало метрик"],
      recommendations: ["Уточнить детали опыта"],
    })
  );
});

test("AI analysis schema rejects blank education evidence items", () => {
  assert.throws(() =>
    AiAnalysisSchemaParsed.parse({
      overallScore: 75,
      categories: {
        skills: { score: 80, feedback: "Навыки подходят", details: [] },
        experience: { score: 70, feedback: "Опыт частично подходит", details: [] },
        education: {
          score: 90,
          feedback: "Образование подходит.",
          details: [],
          applicable: true,
          includedInMatch: true,
          criterionState: "required",
          criterionEvidence: ["   "],
        },
        achievements: { score: 60, feedback: "Есть отдельные результаты", details: [] },
        cultural_fit: { score: 90, feedback: "Формат подходит", details: [] },
      },
      summary: "Кандидат подходит по ключевым параметрам.",
      verdict: "Можно рассмотреть.",
      reasons: ["Навыки близки", "Опыт релевантен", "Образование подходит"],
      prospects: "Перспективы хорошие.",
      strengths: ["Опыт"],
      weaknesses: ["Мало метрик"],
      recommendations: ["Уточнить детали опыта"],
    })
  );
});

test("AI prompt includes mandatory requirements and education classification rules", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Опыт продаж 5 лет. Образование не указано.",
    vacancyDescription: "Ищем менеджера по продажам.",
    vacancyRequirements: ["Опыт активных продаж"],
    vacancyMandatoryRequirementsText: "Профильное образование будет преимуществом.",
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /Обязательные требования:/);
  assert.match(prompt, /Профильное образование будет преимуществом/);
  assert.match(prompt, /criterionState/);
  assert.match(prompt, /includedInMatch/);
  assert.match(prompt, /optional/);
  assert.match(prompt, /not_required/);
  assert.match(prompt, /Если требования к образованию нет/i);
  assert.match(prompt, /не по названию поля|не по названию секции/i);
});

test("AI prompt treats optional education inside mandatory requirements as optional", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Опыт продаж 5 лет. Образование не указано.",
    vacancyDescription: "Ищем менеджера по продажам.",
    vacancyRequirements: ["Опыт активных продаж"],
    vacancyMandatoryRequirementsText: "Профильное образование будет преимуществом.",
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /Профильное образование будет преимуществом/);
  assert.match(prompt, /будет преимуществом[\s\S]*optional|optional[\s\S]*будет преимуществом/i);
  assert.match(prompt, /название секции[\s\S]*не делает/i);
});

test("AI prompt requires positive included metadata for mandatory education", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Опыт разработки 5 лет. Образование не указано.",
    vacancyDescription: "Высшее техническое образование обязательно.",
    vacancyRequirements: ["Опыт backend-разработки"],
    vacancyMandatoryRequirementsText: null,
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /required/);
  assert.match(prompt, /includedInMatch=true/);
  assert.match(prompt, /applicable=true/);
  assert.match(prompt, /criterionEvidence[\s\S]*непуст/i);
});

test("AI prompt keeps HH survey and resume out of education criterion classification", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Высшее образование: экономика.",
    vacancyDescription: "Нужен backend-разработчик. Высшее техническое образование обязательно.",
    vacancyRequirements: [],
    vacancyMandatoryRequirementsText: null,
    hhAutoSurveyText: "Кандидат готов пройти тестовое задание.",
    injectionNote: "",
  });

  assert.match(prompt, /criterionState[\s\S]*description[\s\S]*requirements[\s\S]*mandatory_requirements_text/i);
  assert.match(prompt, /resumeText[\s\S]*не должен|резюме[\s\S]*не должно/i);
  assert.match(prompt, /hhAutoSurveyText[\s\S]*не должен|HH автоопрос[\s\S]*не должен/i);
});

test("AI prompt contains explicit education JSON contract for JSON-only providers", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Опыт продаж 5 лет.",
    vacancyDescription: "Ищем менеджера.",
    vacancyRequirements: [],
    vacancyMandatoryRequirementsText: null,
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /categories\.education/);
  assert.match(prompt, /applicable/);
  assert.match(prompt, /includedInMatch/);
  assert.match(prompt, /criterionState/);
  assert.match(prompt, /criterionEvidence/);
});

test("AI prompt keeps achievements missing-data rule strict", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Работал менеджером.",
    vacancyDescription: "Ищем менеджера.",
    vacancyRequirements: [],
    vacancyMandatoryRequirementsText: null,
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /achievements\.score.*0/i);
  assert.match(prompt, /обязанност/i);
  assert.match(prompt, /не додумывай недостающие факты/i);
});

test("AI prompt includes structured candidate desired salary and vacancy salary blocks", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Опыт продаж 5 лет. В резюме написано: хочу 500 000 RUB.",
    vacancyDescription: "Ищем менеджера.",
    vacancyRequirements: [],
    vacancyMandatoryRequirementsText: null,
    candidateDesiredSalary: {
      text: "от 250 000 RUB net",
      amount: 250000,
      currency: "RUB",
      source: "ai_parser",
    },
    vacancySalary: {
      min: 180000,
      max: 220000,
      currency: "RUB",
      period: "month",
      tax: "net",
    },
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /Структурированные зарплатные данные/);
  assert.match(prompt, /"candidateDesiredSalary"/);
  assert.match(prompt, /"text": "от 250 000 RUB net"/);
  assert.match(prompt, /"amount": 250000/);
  assert.match(prompt, /"source": "ai_parser"/);
  assert.match(prompt, /"vacancySalary"/);
  assert.match(prompt, /"max": 220000/);
  assert.match(prompt, /"period": "month"/);
});

test("AI prompt makes structured desired salary the source of truth instead of resume salary text", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Ожидаемая зарплата: 999 000 RUB. Опыт продаж 5 лет.",
    vacancyDescription: "Ищем менеджера.",
    vacancyRequirements: [],
    vacancyMandatoryRequirementsText: null,
    candidateDesiredSalary: {
      text: "от 250 000 RUB",
      amount: 250000,
      currency: "RUB",
      source: "regex",
    },
    vacancySalary: {
      min: 200000,
      max: 300000,
      currency: "RUB",
      period: "month",
      tax: null,
    },
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /source of truth|источник истины/i);
  assert.match(prompt, /structured field|структурирован/i);
  assert.match(prompt, /не используй[^\n]*resume|resume text[^\n]*not/i);
  assert.match(prompt, /не парс/i);
});

test("AI prompt forbids salary penalty when salary data is missing or incomparable", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Опыт продаж 5 лет.",
    vacancyDescription: "Ищем менеджера.",
    vacancyRequirements: [],
    vacancyMandatoryRequirementsText: null,
    candidateDesiredSalary: {
      text: "обсуждается",
      amount: null,
      currency: null,
      source: "ai_parser",
    },
    vacancySalary: {
      min: 200000,
      max: 300000,
      currency: "USD",
      period: "hour",
      tax: null,
    },
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /не штрафуй[^\n]*зарплат/i);
  assert.match(prompt, /absent|missing|нет данных|непол/i);
  assert.match(prompt, /currencies differ|валют[^\n]*разн/i);
  assert.match(prompt, /unsupported|неподдерж/i);
  assert.match(prompt, /period[^\n]*incomparable|период[^\n]*несравним/i);
});

test("AI prompt forbids salary penalty when tax format is incomparable or unspecified", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Опыт продаж 5 лет.",
    vacancyDescription: "Ищем менеджера.",
    vacancyRequirements: [],
    vacancyMandatoryRequirementsText: null,
    candidateDesiredSalary: {
      text: "от 300 000 RUB gross",
      amount: 300000,
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
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /tax[^\n]*comparab|налог[^\n]*сопоставим/i);
  assert.match(prompt, /gross[\s\S]*net[\s\S]*НДФЛ/i);
  assert.match(prompt, /не штрафуй[^\n]*зарплат[^\n]*(налог|tax)|налог[^\n]*не штрафуй[^\n]*зарплат/i);
});

test("AI prompt requires material score penalty and textual explanation when candidate salary exceeds vacancy max", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Опыт продаж 5 лет.",
    vacancyDescription: "Ищем менеджера.",
    vacancyRequirements: [],
    vacancyMandatoryRequirementsText: null,
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
      tax: null,
    },
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /candidate amount exceeds vacancy max|ожидан[^\n]*выше[^\n]*максим/i);
  assert.match(prompt, /reduce overallScore materially|существенно[^\n]*сниз/i);
  assert.match(prompt, /feedback/);
  assert.match(prompt, /recommendations/);
  assert.match(prompt, /weaknesses/);
  assert.match(prompt, /reasons/);
});

test("AI prompt does not penalize salary when comparable candidate amount fits vacancy range", () => {
  const prompt = buildAiAnalysisPrompt({
    resumeText: "Опыт продаж 5 лет.",
    vacancyDescription: "Ищем менеджера.",
    vacancyRequirements: [],
    vacancyMandatoryRequirementsText: null,
    candidateDesiredSalary: {
      text: "от 250 000 RUB",
      amount: 250000,
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
    hhAutoSurveyText: undefined,
    injectionNote: "",
  });

  assert.match(prompt, /fits vacancy range|вписывается[^\n]*диапазон/i);
  assert.match(prompt, /do not penalize salary|не штрафуй[^\n]*зарплат/i);
});

test("all providers use shared prompt builder and mandatory requirements input", () => {
  for (const filePath of ["worker/src/openai.ts", "worker/src/gemini.ts", "worker/src/deepseek.ts"]) {
    const source = readFileSync(filePath, "utf8");

    assert.match(source, /buildAiAnalysisPrompt/);
    assert.match(source, /vacancyMandatoryRequirementsText/);
    assert.match(source, /candidateDesiredSalary/);
    assert.match(source, /vacancySalary/);
  }
});

test("provider JSON examples include education metadata and no stale education shape", () => {
  for (const filePath of ["worker/src/openai.ts", "worker/src/gemini.ts", "worker/src/deepseek.ts"]) {
    const source = readFileSync(filePath, "utf8");
    const hasEducationExample = /\\"education\\"|`education`|"education"/.test(source);

    if (!hasEducationExample) continue;

    assert.match(source, /applicable/);
    assert.match(source, /includedInMatch/);
    assert.match(source, /criterionState/);
    assert.match(source, /criterionEvidence/);
    assert.doesNotMatch(
      source,
      /\\"education\\": \{\\"score\\": 0, \\"feedback\\": \\"\\.\\.\\.\\", \\"details\\": \[\\"\\.\\."\]\}/
    );
    assert.doesNotMatch(
      source,
      /"education": \{"score": 0, "feedback": "\.\.\.", "details": \["\.\."\]\}/
    );
  }
});
