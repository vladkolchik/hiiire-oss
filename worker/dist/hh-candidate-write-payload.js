"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasHhDesiredSalaryPatch = hasHhDesiredSalaryPatch;
exports.buildHhCandidateWritePayload = buildHhCandidateWritePayload;
exports.splitHhCandidateRowsByDesiredSalaryPatch = splitHhCandidateRowsByDesiredSalaryPatch;
function hasHhDesiredSalaryPatch(row) {
    return Object.prototype.hasOwnProperty.call(row, "desired_salary_text");
}
function buildHhCandidateWritePayload(row) {
    return {
        applied_at: row.applied_at,
        avatar_url: row.avatar_url,
        created_at: row.created_at,
        created_by: row.created_by,
        ...(hasHhDesiredSalaryPatch(row)
            ? {
                desired_salary_text: row.desired_salary_text ?? null,
                desired_salary_amount: row.desired_salary_amount ?? null,
                desired_salary_currency: row.desired_salary_currency ?? null,
                desired_salary_source: row.desired_salary_source ?? null,
            }
            : {}),
        hh_auto_survey_text: row.hh_auto_survey_text,
        hh_source_fingerprint: row.hh_source_fingerprint,
        hhru_resume_id: row.hhru_resume_id,
        name: row.name,
        position: row.position,
        resume_text: row.resume_text,
        source: row.source,
        status: row.status,
        updated_at: row.updated_at,
        vacancy_id: row.vacancy_id,
    };
}
function splitHhCandidateRowsByDesiredSalaryPatch(rows) {
    const withDesiredSalaryPatch = [];
    const withoutDesiredSalaryPatch = [];
    for (const row of rows) {
        if (hasHhDesiredSalaryPatch(row)) {
            withDesiredSalaryPatch.push(row);
        }
        else {
            withoutDesiredSalaryPatch.push(row);
        }
    }
    return { withDesiredSalaryPatch, withoutDesiredSalaryPatch };
}
