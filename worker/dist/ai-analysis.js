"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiAnalysisSchemaParsed = exports.AiAnalysisSchema = void 0;
exports.normalizeAiAnalysisInput = normalizeAiAnalysisInput;
const zod_1 = require("zod");
const FALLBACKS = {
    summary: "Недостаточно данных в резюме, чтобы составить осмысленное резюме кандидата.",
    verdict: "Недостаточно данных для вывода.",
    prospects: "Недостаточно данных в резюме, чтобы оценить перспективы.",
    reason: "Недостаточно данных из резюме.",
    strength: "Недостаточно данных, чтобы выделить сильные стороны.",
    weakness: "Недостаточно данных, чтобы выделить слабые стороны.",
    recommendation: "Добавьте в резюме опыт, навыки и достижения — тогда я смогу дать рекомендации.",
};
function asRecord(value) {
    if (!value || typeof value !== "object")
        return null;
    return value;
}
function ensureTrimmedString(value, fallback, maxLen) {
    if (value === null || value === undefined)
        return fallback;
    if (typeof value !== "string")
        return value;
    const trimmed = value.trim();
    const out = trimmed.length > 0 ? trimmed : fallback;
    return out.length > maxLen ? out.slice(0, maxLen) : out;
}
function ensureStringArrayAtLeastOne(value, fallbackItem) {
    if (value === null || value === undefined)
        return [fallbackItem];
    if (!Array.isArray(value))
        return value;
    const cleaned = value
        .filter((v) => typeof v === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    return cleaned.length > 0 ? cleaned : [fallbackItem];
}
function ensureStringArray(value) {
    if (!Array.isArray(value))
        return value;
    return value
        .filter((v) => typeof v === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
function ensureReasons(value) {
    if (value === null || value === undefined)
        return [FALLBACKS.reason, FALLBACKS.reason, FALLBACKS.reason];
    if (!Array.isArray(value))
        return value;
    const cleaned = value
        .filter((v) => typeof v === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    const out = cleaned.slice(0, 3);
    while (out.length < 3)
        out.push(FALLBACKS.reason);
    return out;
}
function normalizeCategory(value) {
    const obj = asRecord(value);
    if (!obj)
        return value;
    return {
        ...obj,
        feedback: ensureTrimmedString(obj.feedback, FALLBACKS.reason, 600),
        details: ensureStringArray(obj.details),
    };
}
function normalizeAiAnalysisInput(value) {
    const obj = asRecord(value);
    if (!obj)
        return value;
    const categoriesObj = asRecord(obj.categories);
    const categories = categoriesObj
        ? {
            ...categoriesObj,
            skills: normalizeCategory(categoriesObj.skills),
            experience: normalizeCategory(categoriesObj.experience),
            education: normalizeCategory(categoriesObj.education),
            achievements: normalizeCategory(categoriesObj.achievements),
            cultural_fit: normalizeCategory(categoriesObj.cultural_fit),
        }
        : obj.categories;
    return {
        ...obj,
        categories,
        summary: ensureTrimmedString(obj.summary, FALLBACKS.summary, 1200),
        verdict: ensureTrimmedString(obj.verdict, FALLBACKS.verdict, 400),
        prospects: ensureTrimmedString(obj.prospects, FALLBACKS.prospects, 1200),
        reasons: ensureReasons(obj.reasons),
        strengths: ensureStringArrayAtLeastOne(obj.strengths, FALLBACKS.strength),
        weaknesses: ensureStringArrayAtLeastOne(obj.weaknesses, FALLBACKS.weakness),
        recommendations: ensureStringArrayAtLeastOne(obj.recommendations, FALLBACKS.recommendation),
    };
}
const CategorySchema = zod_1.z.object({
    score: zod_1.z.number().int().min(0).max(100),
    feedback: zod_1.z.string().min(1),
    // Structured Outputs (OpenAI) requires all fields to be "required".
    // Use an empty array when there are no details.
    details: zod_1.z.array(zod_1.z.string()),
});
const EducationCategorySchema = CategorySchema.extend({
    applicable: zod_1.z.boolean(),
    includedInMatch: zod_1.z.boolean(),
    criterionState: zod_1.z.enum(["required", "optional", "not_required"]),
    criterionEvidence: zod_1.z.array(zod_1.z.string().trim().min(1)).max(5),
});
exports.AiAnalysisSchema = zod_1.z.object({
    overallScore: zod_1.z.number().int().min(0).max(100),
    categories: zod_1.z.object({
        skills: CategorySchema,
        experience: CategorySchema,
        education: EducationCategorySchema,
        achievements: CategorySchema,
        cultural_fit: CategorySchema,
    }),
    summary: zod_1.z.string().min(1).max(1200),
    verdict: zod_1.z.string().min(1).max(400),
    reasons: zod_1.z.array(zod_1.z.string().min(1)).length(3),
    prospects: zod_1.z.string().min(1).max(1200),
    strengths: zod_1.z.array(zod_1.z.string()).min(1),
    weaknesses: zod_1.z.array(zod_1.z.string()).min(1),
    recommendations: zod_1.z.array(zod_1.z.string()).min(1),
});
// Parser helper for providers that may return empty arrays/strings.
// Keeps `AiAnalysisSchema` strict (important for OpenAI structured outputs),
// while making the worker resilient to "[]"/"" edge cases from other providers.
exports.AiAnalysisSchemaParsed = zod_1.z.preprocess(normalizeAiAnalysisInput, exports.AiAnalysisSchema);
