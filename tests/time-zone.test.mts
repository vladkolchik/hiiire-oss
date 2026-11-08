import assert from "node:assert/strict";
import test from "node:test";

import { formatUserTimeZoneLabel } from "../lib/time-zone.ts";

test("formatUserTimeZoneLabel formats a stable UTC offset", () => {
  const label = formatUserTimeZoneLabel(new Date("2099-01-10T09:00:00.000Z"));

  assert.match(label, /UTC[+-]\d{2}:\d{2}$/);
});

test("formatUserTimeZoneLabel falls back for invalid dates without NaN output", () => {
  const label = formatUserTimeZoneLabel(new Date("not-a-date"));

  assert.doesNotMatch(label, /NaN/);
  assert.match(label, /UTC[+-]\d{2}:\d{2}$/);
});
