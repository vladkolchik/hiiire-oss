import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialogFiles = [
  ["create vacancy dialog", "components/dashboard/create-vacancy-dialog.tsx"],
  ["edit vacancy dialog", "components/dashboard/edit-vacancy-dialog.tsx"],
] as const;

const maxLengthByField = {
  title: 120,
  location: 120,
  workSchedule: 80,
  description: 20_000,
  requirementsText: 2000,
  responsibilitiesText: 2000,
  mandatoryRequirements: 10_000,
  hiringProcess: 10_000,
  benefits: 5000,
  bonus: 5000,
} as const;

function getFieldBlock(source: string, fieldName: string): string {
  const nameIndex = source.indexOf(`name="${fieldName}"`);
  assert.notEqual(nameIndex, -1, `Could not find form field "${fieldName}"`);

  const endIndex = source.indexOf('name="', nameIndex + fieldName.length + 7);

  return source.slice(nameIndex, endIndex === -1 ? undefined : endIndex);
}

const bilingualExperienceLevelLabels = [
  "Стажер (Trainee)",
  "Начальный (Junior)",
  "Средний (Middle)",
  "Высокий (Senior)",
  "Ведущий (Lead)",
] as const;

const vacancyListSource = readFileSync("lib/vacancies/lists.ts", "utf8");

for (const [dialogName, filePath] of dialogFiles) {
  const source = readFileSync(filePath, "utf8");

  test(`${dialogName} keeps explicit Russian max messages for vacancy title and description`, () => {
    assert.match(source, /Название вакансии не должно быть длиннее 120 символов/);
    assert.match(source, /Описание вакансии не должно быть длиннее 20000 символов/);
  });

  test(`${dialogName} mirrors vacancy text limits with maxLength attributes`, () => {
    for (const [fieldName, maxLength] of Object.entries(maxLengthByField)) {
      const fieldBlock = getFieldBlock(source, fieldName);
      assert.match(fieldBlock, new RegExp(`maxLength=\\{${maxLength}\\}`));
    }
  });

  test(`${dialogName} explains structured vacancy fields as optional notes and AI relies on description`, () => {
    assert.match(
      source,
      /Эти поля не обязательны — заполняйте, только если хотите указать дополнительную информацию\s+для себя\. Для ИИ-анализа достаточно подробно заполненного поля «Описание»\./
    );
    assert.match(source, /VACANCY_LIST_FIELD_DESCRIPTION/);
    assert.match(vacancyListSource, /Каждая строка — отдельный пункт\. До \$\{VACANCY_LIST_MAX_TEXT_LENGTH\} символов\./);
    assert.doesNotMatch(source, /до 100 пунктов/);
    assert.doesNotMatch(source, /200 символов в пункте/);
  });

  test(`${dialogName} shows inline text limit messages before submit`, () => {
    for (const fieldName of ["title", "location", "description", "workSchedule"] as const) {
      const fieldBlock = getFieldBlock(source, fieldName);
      assert.match(fieldBlock, /onBeforeInput=\{\(event\) => handleTextLimitBeforeInput\(/);
      assert.match(fieldBlock, /onPaste=\{\(event\) => handleTextLimitPaste\(/);
    }
  });

  test(`${dialogName} formats salary inputs before submit`, () => {
    assert.match(source, /formatVacancySalaryInput/);
    assert.match(getFieldBlock(source, "salaryMin"), /placeholder="Напр\. 150 000"/);
    assert.match(getFieldBlock(source, "salaryMax"), /placeholder="Напр\. 250 000"/);
  });

  test(`${dialogName} mirrors the salary amount length limit`, () => {
    assert.match(source, /VACANCY_SALARY_MAX_INPUT_LENGTH/);
    assert.match(getFieldBlock(source, "salaryMin"), /maxLength=\{VACANCY_SALARY_MAX_INPUT_LENGTH\}/);
    assert.match(getFieldBlock(source, "salaryMax"), /maxLength=\{VACANCY_SALARY_MAX_INPUT_LENGTH\}/);
  });

  test(`${dialogName} guards salary input by digit count, not formatted string length`, () => {
    assert.match(source, /handleSalaryInputChange/);
    assert.match(
      getFieldBlock(source, "salaryMin"),
      /onChange=\{\(event\) => handleSalaryInputChange\("salaryMin", field\.onChange, event\.target\.value\)\}/
    );
    assert.match(
      getFieldBlock(source, "salaryMax"),
      /onChange=\{\(event\) => handleSalaryInputChange\("salaryMax", field\.onChange, event\.target\.value\)\}/
    );
  });

  test(`${dialogName} shows bilingual candidate level labels`, () => {
    const fieldBlock = getFieldBlock(source, "experienceLevel");

    for (const label of bilingualExperienceLevelLabels) {
      assert.match(fieldBlock, new RegExp(label.replace(/[()]/g, "\\$&")));
    }

    assert.doesNotMatch(fieldBlock, />Junior</);
    assert.doesNotMatch(fieldBlock, />Middle</);
    assert.doesNotMatch(fieldBlock, />Senior</);
    assert.doesNotMatch(fieldBlock, />Lead</);
    assert.doesNotMatch(fieldBlock, />Trainee</);
  });
}
