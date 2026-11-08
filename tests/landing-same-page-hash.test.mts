import assert from "node:assert/strict";
import test from "node:test";

import { getSamePageHashTargetId } from "../lib/landing/same-page-hash.ts";

test("same-page hash target is returned even when the current URL already has the same hash", () => {
  assert.equal(
    getSamePageHashTargetId("/#features", "https://hiiire.com/#features"),
    "features",
  );
});

test("cross-route hash links are left for normal navigation", () => {
  assert.equal(
    getSamePageHashTargetId("/#pricing", "https://hiiire.com/blog"),
    "",
  );
});
