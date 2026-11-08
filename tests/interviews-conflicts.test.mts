import assert from "node:assert/strict";
import test from "node:test";

import { findInterviewConflicts } from "../lib/interviews/conflicts.ts";

const base = {
  id: "existing-1",
  candidateId: "candidate-1",
  scheduledAt: "2099-01-10T10:00:00.000Z",
  durationMinutes: 60,
  status: "scheduled" as const,
  interviewerIds: ["u1"],
  interviewerNamesById: { u1: "Анна" },
};

test("warns when an interviewer has an overlapping scheduled interview", () => {
  const conflicts = findInterviewConflicts({
    scheduledAt: "2099-01-10T10:30:00.000Z",
    durationMinutes: 30,
    candidateId: "candidate-2",
    interviewerIds: ["u1"],
    existing: [base],
  });

  assert.deepEqual(conflicts, [
    {
      interviewId: "existing-1",
      kind: "interviewer",
      interviewerId: "u1",
      interviewerName: "Анна",
      startsAt: "2099-01-10T10:00:00.000Z",
      endsAt: "2099-01-10T11:00:00.000Z",
      message: "У Анны уже есть встреча на это время. Можно сохранить, если это ожидаемо.",
    },
  ]);
});

test("warns when the same candidate has an overlapping scheduled interview", () => {
  const conflicts = findInterviewConflicts({
    scheduledAt: "2099-01-10T10:30:00.000Z",
    durationMinutes: 30,
    candidateId: "candidate-1",
    interviewerIds: ["u2"],
    existing: [base],
  });

  assert.deepEqual(conflicts, [
    {
      interviewId: "existing-1",
      kind: "candidate",
      candidateId: "candidate-1",
      startsAt: "2099-01-10T10:00:00.000Z",
      endsAt: "2099-01-10T11:00:00.000Z",
      message: "У кандидата уже есть собеседование на это время. Можно сохранить, если это ожидаемо.",
    },
  ]);
});

test("does not warn when one interval ends exactly at the next start", () => {
  const conflicts = findInterviewConflicts({
    scheduledAt: "2099-01-10T11:00:00.000Z",
    durationMinutes: 30,
    candidateId: "candidate-1",
    interviewerIds: ["u1"],
    existing: [base],
  });

  assert.deepEqual(conflicts, []);
});

test("ignores completed and cancelled interviews", () => {
  const conflicts = findInterviewConflicts({
    scheduledAt: "2099-01-10T10:30:00.000Z",
    durationMinutes: 30,
    candidateId: "candidate-2",
    interviewerIds: ["u1"],
    existing: [
      { ...base, id: "completed-1", status: "completed" as const },
      { ...base, id: "cancelled-1", status: "cancelled" as const },
    ],
  });

  assert.deepEqual(conflicts, []);
});

test("ignores the interview being edited", () => {
  const conflicts = findInterviewConflicts({
    scheduledAt: "2099-01-10T10:30:00.000Z",
    durationMinutes: 30,
    candidateId: "candidate-2",
    interviewerIds: ["u1"],
    existing: [base],
    ignoreInterviewId: "existing-1",
  });

  assert.deepEqual(conflicts, []);
});
