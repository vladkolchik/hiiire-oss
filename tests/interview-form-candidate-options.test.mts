import assert from "node:assert/strict";
import test from "node:test";

import {
  filterInterviewCandidatesForVacancy,
  mergeInterviewCandidates,
  resolveInterviewCandidatesForVacancy,
} from "../lib/interviews/candidate-options.ts";

const candidates = [
  { id: "candidate-a", name: "Анна", vacancyId: "vacancy-with-candidates" },
  { id: "candidate-b", name: "Борис", vacancyId: "other-vacancy" },
  { id: "candidate-c", name: "Светлана", vacancyId: "other-vacancy" },
];

test("interview candidate picker does not fall back to account candidates for an empty vacancy", () => {
  assert.deepEqual(filterInterviewCandidatesForVacancy(candidates, "empty-vacancy"), []);
});

test("interview candidate picker keeps only candidates from the selected vacancy", () => {
  assert.deepEqual(filterInterviewCandidatesForVacancy(candidates, "vacancy-with-candidates"), [candidates[0]]);
});

test("interview candidate picker can keep the initially locked candidate option", () => {
  assert.deepEqual(filterInterviewCandidatesForVacancy(candidates, "vacancy-with-candidates", "candidate-b"), [
    candidates[0],
    candidates[1],
  ]);
});

test("interview candidate picker merges vacancy-scoped results beyond the calendar account cache", () => {
  const cachedCandidates = filterInterviewCandidatesForVacancy(candidates, "late-vacancy");
  const vacancyScopedCandidates = [{ id: "candidate-late", name: "Мария", vacancyId: "late-vacancy" }];

  assert.deepEqual(mergeInterviewCandidates(cachedCandidates, vacancyScopedCandidates), vacancyScopedCandidates);
});

test("interview candidate picker removes duplicates when selected vacancy data is loaded twice", () => {
  const duplicate = { id: "candidate-a", name: "Анна", vacancyId: "vacancy-with-candidates" };

  assert.deepEqual(mergeInterviewCandidates([duplicate], [duplicate]), [duplicate]);
});

test("interview candidate picker treats scoped total zero as authoritative over stale cache", () => {
  assert.deepEqual(
    resolveInterviewCandidatesForVacancy({
      candidates: [{ id: "candidate-stale", name: "Ольга", vacancyId: "stale-vacancy" }],
      vacancyCandidates: [],
      vacancyId: "stale-vacancy",
      vacancyCandidatesFor: "stale-vacancy",
      vacancyCandidatesTotal: 0,
    }),
    []
  );
});

test("interview candidate picker keeps cached candidates while scoped vacancy load is still pending", () => {
  assert.deepEqual(
    resolveInterviewCandidatesForVacancy({
      candidates: [candidates[0]],
      vacancyCandidates: [],
      vacancyId: "vacancy-with-candidates",
      vacancyCandidatesFor: "vacancy-with-candidates",
      vacancyCandidatesTotal: null,
    }),
    [candidates[0]]
  );
});
